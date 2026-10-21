import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateBearerToken: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({
  authenticateBearerToken: mocks.authenticateBearerToken,
}));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import { GET } from "@/app/(system)/v1/me/addresses/route";

function createQuery(addresses: unknown[] = []) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: addresses, error: null });
  return query;
}

describe("GET /v1/me/addresses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing or invalid bearer identity before querying addresses", async () => {
    mocks.authenticateBearerToken.mockResolvedValue({
      ok: false,
      status: 401,
      code: "BEARER_TOKEN_REQUIRED",
      message: "A valid bearer token is required.",
    });

    const response = await GET(new Request("https://api.example/v1/me/addresses"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("BEARER_TOKEN_REQUIRED");
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("returns only the verified user's addresses and applies a result limit", async () => {
    const addresses = [{
      id: "address-1",
      address_type: "home",
      address_line_1: "Example Road",
      city: "Example City",
      country_code: "BD",
      is_primary: true,
    }];
    const query = createQuery(addresses);
    const identity = {
      user: { id: "verified-user-1" },
      supabase: { from: vi.fn().mockReturnValue(query) },
    };
    mocks.authenticateBearerToken.mockResolvedValue({ ok: true, identity });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });

    const response = await GET(new Request("https://api.example/v1/me/addresses", {
      headers: { Authorization: "Bearer validated-by-mock" },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.addresses).toEqual(addresses);
    expect(identity.supabase.from).toHaveBeenCalledWith("user_addresses");
    expect(query.eq).toHaveBeenCalledWith("user_id", "verified-user-1");
    expect(query.limit).toHaveBeenCalledWith(20);
  });

  it("returns a retryable rate-limit error without reading addresses", async () => {
    const query = createQuery();
    const identity = {
      user: { id: "verified-user-1" },
      supabase: { from: vi.fn().mockReturnValue(query) },
    };
    mocks.authenticateBearerToken.mockResolvedValue({ ok: true, identity });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });

    const response = await GET(new Request("https://api.example/v1/me/addresses", {
      headers: { Authorization: "Bearer validated-by-mock" },
    }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(identity.supabase.from).not.toHaveBeenCalled();
  });
});
