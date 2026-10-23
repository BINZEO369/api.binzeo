import { describe, expect, it } from "vitest";
import { getPaymentUiRequestOrigin } from "@/binzeo/auth/payment-ui-origin";

const authOrigin = "https://auth-binzeo.vercel.app";
const apiUrl = "https://api-binzeo.vercel.app/v1/payments/requests/11111111-2222-4333-8444-555555555555";

function makeRequest(method: string, headers: Record<string, string> = {}) {
  return new Request(apiUrl, { method, headers });
}

describe("Central Auth payment UI origin resolution", () => {
  it("prefers an explicit Origin header", () => {
    const request = makeRequest("GET", {
      origin: "https://untrusted.example",
      referer: `${authOrigin}/payment?payment=success`,
      "sec-fetch-site": "same-origin",
    });

    expect(getPaymentUiRequestOrigin(request)).toBe("https://untrusted.example");
  });

  it("uses Referer for a same-origin GET when Origin is omitted", () => {
    const request = makeRequest("GET", {
      referer: `${authOrigin}/payment?payment=success`,
      "sec-fetch-site": "same-origin",
    });

    expect(getPaymentUiRequestOrigin(request)).toBe(authOrigin);
  });

  it("rejects a Referer fallback for cross-site requests", () => {
    const request = makeRequest("GET", {
      referer: `${authOrigin}/payment`,
      "sec-fetch-site": "cross-site",
    });

    expect(getPaymentUiRequestOrigin(request)).toBeNull();
  });

  it("rejects a Referer fallback without same-origin Fetch Metadata", () => {
    const request = makeRequest("GET", { referer: `${authOrigin}/payment` });

    expect(getPaymentUiRequestOrigin(request)).toBeNull();
  });

  it("does not use Referer fallback for a POST without Origin", () => {
    const request = makeRequest("POST", {
      referer: `${authOrigin}/payment`,
      "sec-fetch-site": "same-origin",
    });

    expect(getPaymentUiRequestOrigin(request)).toBeNull();
  });
});
