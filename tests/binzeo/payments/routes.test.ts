import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatePaymentRequest: vi.fn(),
  consumeRateLimit: vi.fn(),
  createCheckoutSession: vi.fn(),
  createJabiyenOrderCheckoutSession: vi.fn(),
  createPaymentReturnHandoff: vi.fn(),
  getPaymentRequestStatus: vi.fn(),
  handleStripeWebhook: vi.fn(),
}));

vi.mock("@/binzeo/auth/identity", () => ({ authenticatePaymentRequest: mocks.authenticatePaymentRequest }));
vi.mock("@/common/security/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/binzeo/payments/service", () => ({
  PaymentServiceError: class PaymentServiceError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  createCheckoutSession: mocks.createCheckoutSession,
  createJabiyenOrderCheckoutSession: mocks.createJabiyenOrderCheckoutSession,
  createPaymentReturnHandoff: mocks.createPaymentReturnHandoff,
  getPaymentRequestStatus: mocks.getPaymentRequestStatus,
  handleStripeWebhook: mocks.handleStripeWebhook,
}));

import { POST as createCheckout } from "@/binzeo/api/v1/payments/checkout-sessions/route";
import { POST as createJabiyenCheckout } from "@/binzeo/api/v1/payments/jabiyen/checkout-sessions/route";
import { GET as getStatus } from "@/binzeo/api/v1/payments/requests/[requestId]/route";
import { POST as createReturnHandoff } from "@/binzeo/api/v1/payments/requests/[requestId]/return-handoff/route";
import { POST as stripeWebhook } from "@/binzeo/api/v1/payments/stripe/webhook/route";

const identity = {
  user: { id: "7ba7902b-a52a-4ced-8401-73493630ad9f", email: "user@example.com", email_confirmed_at: "2026-10-01T00:00:00.000Z" },
  profile: { display_name: "Account Name", first_name: "Account", last_name: "Name" },
  supabase: {},
};
const paymentRequestId = "fa240890-b6ad-42a4-97a0-bdf4b58a7b01";
const idempotencyKey = "0b1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const orderNumber = "JBY-20261023-12345678";

function authorizedRequest(url: string, method: string, body?: string) {
  return new Request(url, {
    method,
    headers: {
      authorization: "Bearer central-user-token",
      origin: "https://store.example",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });
}

describe("central payment route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatePaymentRequest.mockResolvedValue({ ok: true, identity });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
    mocks.createCheckoutSession.mockResolvedValue({ checkout_url: "https://checkout.stripe.com/c/pay_test", status: "open" });
    mocks.createJabiyenOrderCheckoutSession.mockResolvedValue({ checkout_url: "https://checkout.stripe.com/c/pay_test", status: "open" });
    mocks.createPaymentReturnHandoff.mockResolvedValue({ return_url: "https://jabiyen-website.vercel.app/order-confirmation?order=JBY-20261023-12345678#payment_handoff=token", expires_at: "2026-10-25T00:10:00.000Z" });
    mocks.getPaymentRequestStatus.mockResolvedValue({ id: paymentRequestId, status: "pending", latest_attempt: null });
    mocks.handleStripeWebhook.mockResolvedValue({ received: true, processed: true });
  });

  it("derives checkout identity from Central Auth and accepts no browser amount or customer fields", async () => {
    const response = await createCheckout(authorizedRequest("https://api.example/v1/payments/checkout-sessions", "POST", JSON.stringify({
      payment_request_id: paymentRequestId,
      idempotency_key: idempotencyKey,
    })));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith({
      paymentRequestId,
      idempotencyKey,
      origin: "https://store.example",
      identity,
    });
  });

  it("rejects browser-supplied identity, amount and URLs", async () => {
    const response = await createCheckout(authorizedRequest("https://api.example/v1/payments/checkout-sessions", "POST", JSON.stringify({
      payment_request_id: paymentRequestId,
      idempotency_key: idempotencyKey,
      user_id: identity.user.id,
      customer_email: "attacker@example.com",
      amount_minor: 1,
      currency: "usd",
      success_url: "https://attacker.example/thanks",
    })));

    expect(response.status).toBe(400);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("accepts only a JABIYEN order number and delegates amount checks to the central adapter", async () => {
    const response = await createJabiyenCheckout(authorizedRequest("https://api.example/v1/payments/jabiyen/checkout-sessions", "POST", JSON.stringify({
      order_number: orderNumber,
    })));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.createJabiyenOrderCheckoutSession).toHaveBeenCalledWith({
      orderNumber,
      origin: "https://store.example",
      identity,
    });
  });

  it("rejects browser-supplied price, identity, and return URLs on the JABIYEN handoff", async () => {
    const response = await createJabiyenCheckout(authorizedRequest("https://api.example/v1/payments/jabiyen/checkout-sessions", "POST", JSON.stringify({
      order_number: orderNumber,
      amount_minor: 1,
      currency: "usd",
      customer_email: "attacker@example.com",
      success_url: "https://attacker.example/thanks",
    })));

    expect(response.status).toBe(400);
    expect(mocks.createJabiyenOrderCheckoutSession).not.toHaveBeenCalled();
  });

  it("requires a verified Central Auth identity before creating checkout", async () => {
    mocks.authenticatePaymentRequest.mockResolvedValueOnce({ ok: false, status: 401, code: "INVALID_TOKEN", message: "Invalid token." });
    const response = await createCheckout(authorizedRequest("https://api.example/v1/payments/checkout-sessions", "POST", JSON.stringify({
      payment_request_id: paymentRequestId,
      idempotency_key: idempotencyKey,
    })));

    expect(response.status).toBe(401);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns payment status through the authenticated owner-bound service", async () => {
    const response = await getStatus(authorizedRequest(`https://api.example/v1/payments/requests/${paymentRequestId}`, "GET"), {
      params: Promise.resolve({ requestId: paymentRequestId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getPaymentRequestStatus).toHaveBeenCalledWith(paymentRequestId, identity);
  });

  it("issues a return URL only through the authenticated owner-bound handoff service", async () => {
    const response = await createReturnHandoff(
      authorizedRequest(`https://api.example/v1/payments/requests/${paymentRequestId}/return-handoff`, "POST", "{}"),
      { params: Promise.resolve({ requestId: paymentRequestId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.return_url).toContain("#payment_handoff=");
    expect(mocks.createPaymentReturnHandoff).toHaveBeenCalledWith(paymentRequestId, identity);
  });

  it("does not issue a handoff when Central Auth rejects the owner", async () => {
    mocks.authenticatePaymentRequest.mockResolvedValueOnce({ ok: false, status: 401, code: "INVALID_TOKEN", message: "Invalid token." });
    const response = await createReturnHandoff(
      authorizedRequest(`https://api.example/v1/payments/requests/${paymentRequestId}/return-handoff`, "POST", "{}"),
      { params: Promise.resolve({ requestId: paymentRequestId }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.createPaymentReturnHandoff).not.toHaveBeenCalled();
  });

  it("does not issue a handoff before the webhook marks fulfillment complete", async () => {
    mocks.createPaymentReturnHandoff.mockRejectedValueOnce(new (await import("@/binzeo/payments/service")).PaymentServiceError("PAYMENT_NOT_READY", 409, "The order is not ready yet."));
    const response = await createReturnHandoff(
      authorizedRequest(`https://api.example/v1/payments/requests/${paymentRequestId}/return-handoff`, "POST", "{}"),
      { params: Promise.resolve({ requestId: paymentRequestId }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.createPaymentReturnHandoff).toHaveBeenCalledWith(paymentRequestId, identity);
  });

  it("passes the untouched webhook payload and Stripe signature to the verifier", async () => {
    const raw = '{"id":"evt_test_123","type":"checkout.session.completed"}';
    const request = new Request("https://api.example/v1/payments/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=test-signature", "content-length": String(Buffer.byteLength(raw)) },
      body: raw,
    });
    const response = await stripeWebhook(request);

    expect(response.status).toBe(200);
    expect(mocks.handleStripeWebhook).toHaveBeenCalledWith(Buffer.from(raw), "t=1,v1=test-signature");
  });
});
