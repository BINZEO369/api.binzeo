import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

type MockResult = { data: unknown; error: { code?: string } | null };
type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  is: (...args: unknown[]) => QueryBuilder;
  gt: (...args: unknown[]) => QueryBuilder;
  update: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<MockResult>;
};

const mocks = vi.hoisted(() => ({
  createPrivilegedClient: vi.fn(),
  getJabiyenAdminDatabase: vi.fn(),
  sendPaidJabiyenStripeOrderConfirmationEmailOnce: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/common/database/supabase/clients", () => ({ createPrivilegedClient: mocks.createPrivilegedClient }));
vi.mock("@/jabiyen/website/database", () => ({ getJabiyenAdminDatabase: mocks.getJabiyenAdminDatabase }));
vi.mock("@/binzeo/payments/order-confirmation-email", () => ({
  sendPaidJabiyenStripeOrderConfirmationEmailOnce: mocks.sendPaidJabiyenStripeOrderConfirmationEmailOnce,
}));

import { PaymentServiceError, redeemPaymentReturnHandoff } from "@/binzeo/payments/service";

const paymentRequestId = "fa240890-b6ad-42a4-97a0-bdf4b58a7b01";
const projectId = "687b8e4a-b2c4-4f89-9eab-2c9a456d1643";
const userId = "7ba7902b-a52a-4ced-8401-73493630ad9f";
const orderNumber = "JBY-20261023-12345678";
const token = "A".repeat(43);
const tokenHash = createHash("sha256").update(token).digest("hex");

function createFakeCentralDatabase() {
  let consumed = false;
  let consumeUpdateCount = 0;
  const handoff = {
    payment_request_id: paymentRequestId,
    project_id: projectId,
    user_id: userId,
    external_order_reference: orderNumber,
  };
  const request = {
    id: paymentRequestId,
    project_id: projectId,
    user_id: userId,
    external_order_reference: orderNumber,
    amount_minor: 12500,
    currency: "usd",
    status: "paid",
    fulfillment_status: "fulfilled",
  };

  const database = {
    from(table: string): QueryBuilder {
      let isUpdate = false;
      const query = {} as QueryBuilder;
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.is = vi.fn(() => query);
      query.gt = vi.fn(() => query);
      query.update = vi.fn(() => {
        isUpdate = true;
        consumeUpdateCount += 1;
        return query;
      });
      query.maybeSingle = vi.fn(async () => {
        if (table === "payment_return_handoffs") {
          if (isUpdate) {
            if (consumed) return { data: null, error: null };
            consumed = true;
            return { data: { token_hash: tokenHash }, error: null };
          }
          return consumed ? { data: null, error: null } : { data: handoff, error: null };
        }
        if (table === "payment_requests") return { data: request, error: null };
        if (table === "platform_projects") return { data: { project_key: "jabiyen", status: "active" }, error: null };
        if (table === "payment_customers") return { data: { email_snapshot: "buyer@example.com" }, error: null };
        throw new Error(`UNEXPECTED_TABLE:${table}`);
      });
      return query;
    },
  };
  return { database, getConsumeUpdateCount: () => consumeUpdateCount };
}

const confirmedOrder = {
  order_number: orderNumber,
  status: "confirmed",
  currency: "USD",
  total_amount: "125.00",
  customer: { email: "buyer@example.com" },
  payment: { method: "stripe", status: "collected", currency: "USD" },
};

describe("one-time handoff recovery after transient site database failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a valid token unconsumed on lookup outage, then consumes it once after verified success", async () => {
    const central = createFakeCentralDatabase();
    let failOrderLookup = true;
    const jabiyenDatabase = {
      from: vi.fn((table: string) => {
        if (table !== "orders") throw new Error(`UNEXPECTED_JABIYEN_TABLE:${table}`);
        const query = {} as QueryBuilder;
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.maybeSingle = vi.fn(async () => {
          if (failOrderLookup) {
            failOrderLookup = false;
            return { data: null, error: { code: "TEMPORARY_DATABASE_OUTAGE" } };
          }
          return { data: { order_number: orderNumber, access_token_hash: "a".repeat(64) }, error: null };
        });
        return query;
      }),
      rpc: vi.fn(async () => ({ data: confirmedOrder, error: null })),
    };

    mocks.createPrivilegedClient.mockReturnValue(central.database);
    mocks.getJabiyenAdminDatabase.mockReturnValue(jabiyenDatabase);

    await expect(redeemPaymentReturnHandoff(token)).rejects.toMatchObject({
      code: "PAYMENT_SERVICE_UNAVAILABLE",
      status: 503,
    });
    expect(central.getConsumeUpdateCount()).toBe(0);

    await expect(redeemPaymentReturnHandoff(token)).resolves.toEqual({ order: confirmedOrder });
    expect(central.getConsumeUpdateCount()).toBe(1);

    await expect(redeemPaymentReturnHandoff(token)).rejects.toBeInstanceOf(PaymentServiceError);
    await expect(redeemPaymentReturnHandoff(token)).rejects.toMatchObject({
      code: "PAYMENT_HANDOFF_INVALID",
      status: 404,
    });
    expect(central.getConsumeUpdateCount()).toBe(1);
  });
});
