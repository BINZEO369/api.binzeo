import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redeemPaymentReturnHandoff: vi.fn(),
  createPrivilegedClient: vi.fn(() => ({})),
  consumeRateLimit: vi.fn(),
  PaymentServiceError: class PaymentServiceError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
}));

vi.mock("@/binzeo/payments/service", () => ({
  PaymentServiceError: mocks.PaymentServiceError,
  redeemPaymentReturnHandoff: mocks.redeemPaymentReturnHandoff,
}));
vi.mock("@/common/database/supabase/clients", () => ({ createPrivilegedClient: mocks.createPrivilegedClient }));
vi.mock("@/common/security/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));

import router from "@/jabiyen/admin/payment-handoff";

const order = {
  order_number: "JBY-20261023-12345678",
  status: "confirmed",
  currency: "USD",
  payment: { method: "stripe", status: "collected", currency: "USD" },
};

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader(name: string, value: string): void;
  status(code: number): MockResponse;
  json(value: unknown): MockResponse;
};

async function redeemThroughPublicRoute(token: string) {
  const layers = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void> }> } }> }).stack;
  const route = layers.find((layer) => layer.route?.path === "/api/payment-handoff")?.route;
  if (!route) throw new Error("HANDOFF_ROUTE_NOT_REGISTERED");
  const handler = route.stack[0].handle;
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  const request = {
    body: { token },
    ip: "127.0.0.1",
    get(name: string) {
      if (name.toLowerCase() === "origin") return "http://localhost:3000";
      if (name.toLowerCase() === "x-real-ip") return "127.0.0.1";
      return undefined;
    },
  };
  await handler(request, response, () => undefined);
  return response;
}

describe("JABIYEN one-time payment return redemption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
  });

  it("returns only the verified order on the first token redemption and rejects replay", async () => {
    let consumed = false;
    mocks.redeemPaymentReturnHandoff.mockImplementation(async (token: string) => {
      expect(token).toBe("A".repeat(43));
      if (consumed) throw new mocks.PaymentServiceError("PAYMENT_HANDOFF_INVALID", 404, "This link has expired or was already used.");
      consumed = true;
      return { order };
    });

    const first = await redeemThroughPublicRoute("A".repeat(43));
    const replay = await redeemThroughPublicRoute("A".repeat(43));

    expect(first.statusCode).toBe(200);
    expect((first.body as { order: typeof order }).order).toEqual(order);
    expect(replay.statusCode).toBe(404);
    expect(replay.body).toMatchObject({ success: false, code: "PAYMENT_HANDOFF_INVALID" });
    expect(mocks.redeemPaymentReturnHandoff).toHaveBeenCalledTimes(2);
  });

  it("does not turn an expired or invalid token into a success response", async () => {
    mocks.redeemPaymentReturnHandoff.mockRejectedValueOnce(
      new mocks.PaymentServiceError("PAYMENT_HANDOFF_INVALID", 404, "This link has expired or was already used."),
    );
    const response = await redeemThroughPublicRoute("B".repeat(43));
    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ success: false, code: "PAYMENT_HANDOFF_INVALID" });
  });
});
