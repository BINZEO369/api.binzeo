import { describe, expect, it } from "vitest";
import {
  buildPaymentReturnUrl,
  checkoutSessionMatchesAttempt,
  createPaymentReturnToken,
  hashPaymentReturnToken,
  usdMajorToMinorUnits,
  verifiedCheckoutEventStatus,
} from "@/binzeo/payments/security";

const expected = {
  paymentRequestId: "fa240890-b6ad-42a4-97a0-bdf4b58a7b01",
  amountMinor: 12500,
  currency: "usd",
  projectKey: "jabiyen",
  userId: "7ba7902b-a52a-4ced-8401-73493630ad9f",
};
const session = {
  id: "cs_test_123",
  status: "complete",
  mode: "payment",
  client_reference_id: expected.paymentRequestId,
  amount_total: expected.amountMinor,
  currency: expected.currency,
  payment_status: "paid",
  metadata: {
    payment_request_id: expected.paymentRequestId,
    project_key: expected.projectKey,
    user_id: expected.userId,
  },
};

describe("central Stripe proof and payment return handoff security", () => {
  it.each([
    ["125", 12500n],
    ["125.00", 12500n],
    ["0.05", 5n],
    [125.5, 12550n],
  ])("converts exact USD major units to minor units (%s)", (value, expectedMinor) => {
    expect(usdMajorToMinorUnits(value)).toBe(expectedMinor);
  });

  it.each(["125.001", "-1", "1e3", "", null, "10000000000.00"]) (
    "rejects an ambiguous or out-of-range USD amount (%s)",
    (value) => expect(usdMajorToMinorUnits(value)).toBeNull(),
  );

  it("accepts a paid session only when amount, currency, owner, project and request all match", () => {
    expect(checkoutSessionMatchesAttempt(session, expected)).toBe(true);
    expect(verifiedCheckoutEventStatus("checkout.session.completed", session)).toBe("paid");
  });

  it.each([
    ["amount", { amount_total: 1 }],
    ["currency", { currency: "eur" }],
    ["request reference", { client_reference_id: "other-request" }],
    ["request metadata", { metadata: { ...session.metadata, payment_request_id: "other-request" } }],
    ["owner metadata", { metadata: { ...session.metadata, user_id: "other-user" } }],
    ["project metadata", { metadata: { ...session.metadata, project_key: "other-site" } }],
    ["mode", { mode: "subscription" }],
    ["incomplete session", { status: "open" }],
  ])("rejects a mismatched Stripe session (%s)", (_name, override) => {
    expect(checkoutSessionMatchesAttempt({ ...session, ...override }, expected)).toBe(false);
  });

  it("does not treat a browser-return-style completed but unpaid session as paid", () => {
    expect(verifiedCheckoutEventStatus("checkout.session.completed", { ...session, payment_status: "unpaid" })).toBe("processing");
    expect(verifiedCheckoutEventStatus("checkout.session.async_payment_failed", { ...session, payment_status: "unpaid" })).toBe("failed");
  });

  it("issues high-entropy tokens and stores only their SHA-256 hash", () => {
    const handoff = createPaymentReturnToken();
    expect(handoff.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(handoff.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(handoff.tokenHash).toBe(hashPaymentReturnToken(handoff.token));
    expect(handoff.tokenHash).not.toContain(handoff.token);
    expect(hashPaymentReturnToken("short")).toBeNull();
  });

  it("builds the handoff using only the configured HTTPS origin and safely encodes the order number", () => {
    const token = createPaymentReturnToken().token;
    const url = new URL(buildPaymentReturnUrl({
      origin: "https://jabiyen-website.vercel.app",
      pathTemplate: "/order-confirmation?order={ORDER_NUMBER}",
      orderNumber: "JBY-261025-A1B2C3D4",
      token,
    }));
    expect(url.origin).toBe("https://jabiyen-website.vercel.app");
    expect(url.pathname).toBe("/order-confirmation");
    expect(url.searchParams.get("order")).toBe("JBY-261025-A1B2C3D4");
    expect(new URLSearchParams(url.hash.slice(1)).get("payment_handoff")).toBe(token);
  });

  it.each([
    ["attacker host", "https://attacker.example", "/order-confirmation"],
    ["protocol-relative path", "https://jabiyen-website.vercel.app", "//attacker.example/path"],
    ["absolute path", "https://jabiyen-website.vercel.app", "https://attacker.example/path"],
    ["insecure scheme", "http://jabiyen-website.vercel.app", "/order-confirmation"],
  ])("rejects unsafe return destination (%s)", (_name, origin, pathTemplate) => {
    expect(() => buildPaymentReturnUrl({ origin, pathTemplate, orderNumber: "JBY-261025-A1B2C3D4", token: createPaymentReturnToken().token })).toThrow("PAYMENT_RETURN_URL_INVALID");
  });
});
