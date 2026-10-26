import { createHash, randomBytes } from "node:crypto";

export const PAYMENT_RETURN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createPaymentReturnToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}

export function hashPaymentReturnToken(token: string) {
  if (!PAYMENT_RETURN_TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function usdMajorToMinorUnits(value: unknown): bigint | null {
  const match = String(value ?? "").trim().match(/^(\d{1,10})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export function buildPaymentReturnUrl(input: {
  origin: string;
  pathTemplate: string;
  orderNumber: string;
  token: string;
}) {
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    throw new Error("PAYMENT_RETURN_URL_INVALID");
  }
  if (origin.protocol !== "https:" || origin.origin !== input.origin || origin.username || origin.password) {
    throw new Error("PAYMENT_RETURN_URL_INVALID");
  }
  if (!input.pathTemplate.startsWith("/") || input.pathTemplate.startsWith("//") || input.pathTemplate.includes("#") || !input.pathTemplate.includes("{ORDER_NUMBER}") || !PAYMENT_RETURN_TOKEN_PATTERN.test(input.token)) {
    throw new Error("PAYMENT_RETURN_URL_INVALID");
  }

  const path = input.pathTemplate.replaceAll("{ORDER_NUMBER}", encodeURIComponent(input.orderNumber));
  const target = new URL(path, origin.origin);
  if (target.origin !== origin.origin || target.username || target.password) throw new Error("PAYMENT_RETURN_URL_INVALID");
  target.hash = new URLSearchParams({ payment_handoff: input.token }).toString();
  return target.toString();
}

export type CheckoutProofSession = {
  id: string;
  status: string | null;
  mode: string | null;
  client_reference_id: string | null;
  amount_total: number | null;
  currency: string | null;
  payment_status: string;
  metadata: Record<string, string> | null;
};

export function checkoutSessionMatchesAttempt(
  session: CheckoutProofSession,
  expected: { paymentRequestId: string; amountMinor: number; currency: string; projectKey: string; userId: string },
) {
  return session.mode === "payment"
    && (session.status === "complete" || session.status === "expired")
    && session.client_reference_id === expected.paymentRequestId
    && session.metadata?.payment_request_id === expected.paymentRequestId
    && session.metadata?.project_key === expected.projectKey
    && session.metadata?.user_id === expected.userId
    && session.amount_total === expected.amountMinor
    && session.currency === expected.currency;
}

export function verifiedCheckoutEventStatus(eventType: string, session: CheckoutProofSession) {
  if (eventType === "checkout.session.expired") return session.status === "expired" ? "expired" as const : null;
  if (eventType === "checkout.session.async_payment_failed") return session.status === "complete" ? "failed" as const : null;
  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    if (session.status !== "complete") return null;
    return session.payment_status === "paid" ? "paid" as const : "processing" as const;
  }
  return null;
}
