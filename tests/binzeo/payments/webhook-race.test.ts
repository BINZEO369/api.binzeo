import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResult = { data: unknown; error: { code?: string } | null };
type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder | Promise<{ error: null }>;
  maybeSingle: () => Promise<MockResult>;
  update: (payload: Record<string, unknown>) => QueryBuilder;
};

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  createPrivilegedClient: vi.fn(),
  getJabiyenAdminDatabase: vi.fn(),
  sendPaidJabiyenStripeOrderConfirmationEmailOnce: vi.fn(),
  webhookInboxUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("stripe", () => {
  class StripeMock {
    webhooks = { constructEvent: mocks.constructEvent };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: StripeMock };
});
vi.mock("@/common/database/supabase/clients", () => ({ createPrivilegedClient: mocks.createPrivilegedClient }));
vi.mock("@/jabiyen/website/database", () => ({ getJabiyenAdminDatabase: mocks.getJabiyenAdminDatabase }));
vi.mock("@/binzeo/payments/order-confirmation-email", () => ({
  sendPaidJabiyenStripeOrderConfirmationEmailOnce: mocks.sendPaidJabiyenStripeOrderConfirmationEmailOnce,
}));

import { handleStripeWebhook } from "@/binzeo/payments/service";

function createDatabase() {
  const database = {
    from(table: string): QueryBuilder {
      let updatePayload: Record<string, unknown> | null = null;
      const query = {} as QueryBuilder;
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => updatePayload ? Promise.resolve({ error: null }) : query);
      query.maybeSingle = vi.fn(async () => {
        if (table === "payment_provider_settings") {
          return { data: { enabled: true, mode: "test" }, error: null };
        }
        if (table === "payment_attempts") return { data: null, error: null };
        throw new Error(`UNEXPECTED_MAYBE_SINGLE_TABLE:${table}`);
      });
      query.update = vi.fn((payload: Record<string, unknown>) => {
        updatePayload = payload;
        if (table === "payment_webhook_events") mocks.webhookInboxUpdates.push(payload);
        return query;
      });
      return query;
    },
    rpc: vi.fn(async () => ({ data: "claimed", error: null })),
  };
  return database;
}

function checkoutEvent(session: Record<string, unknown>) {
  return {
    id: "evt_test_central_checkout",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: session },
  };
}

describe("Stripe webhook delivery races", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.webhookInboxUpdates.length = 0;
    mocks.createPrivilegedClient.mockReturnValue(createDatabase());
    mocks.constructEvent.mockImplementation(() => checkoutEvent({
      id: "cs_test_early_webhook",
      status: "complete",
      client_reference_id: "central-request-id",
      metadata: { payment_request_id: "central-request-id" },
    }));
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_race";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_webhook_race";
  });

  it("asks Stripe to retry when a central Checkout event beats persistence of its attempt row", async () => {
    await expect(handleStripeWebhook(Buffer.from("{}"), "t=1,v1=signature"))
      .rejects.toMatchObject({ code: "WEBHOOK_ATTEMPT_NOT_FOUND", status: 503 });

    expect(mocks.webhookInboxUpdates).toContainEqual(expect.objectContaining({
      status: "failed",
      last_error_code: "WEBHOOK_ATTEMPT_NOT_FOUND",
      lease_expires_at: null,
    }));
  });

  it("acknowledges an unrelated Stripe Checkout event without central metadata", async () => {
    mocks.constructEvent.mockImplementationOnce(() => checkoutEvent({
      id: "cs_test_unrelated_checkout",
      status: "complete",
      client_reference_id: null,
      metadata: null,
    }));

    await expect(handleStripeWebhook(Buffer.from("{}"), "t=1,v1=signature"))
      .resolves.toMatchObject({ received: true, processed: true });
    expect(mocks.webhookInboxUpdates).toContainEqual(expect.objectContaining({ status: "processed" }));
  });
});
