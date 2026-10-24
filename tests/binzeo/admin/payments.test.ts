import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminServiceContext: vi.fn() }));
vi.mock("@/binzeo/admin/lib/admin", () => ({ getAdminServiceContext: mocks.getAdminServiceContext }));

import { GET } from "@/binzeo/api/admin/payments/route";

describe("admin central payment history access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the dedicated payments.read permission before querying data", async () => {
    mocks.getAdminServiceContext.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://api.example/api/admin/payments"));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("PAYMENTS_READ_REQUIRED");
    expect(mocks.getAdminServiceContext).toHaveBeenCalledWith(expect.any(Request), "payments.read");
  });

  it("rejects an excessive page size before accessing any records", async () => {
    mocks.getAdminServiceContext.mockResolvedValueOnce({ admin: {} });
    const response = await GET(new Request("https://api.example/api/admin/payments?page_size=1000"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_PAGINATION");
  });

  it("rejects unsupported status filters", async () => {
    mocks.getAdminServiceContext.mockResolvedValueOnce({ admin: {} });
    const response = await GET(new Request("https://api.example/api/admin/payments?status=processing"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_STATUS_FILTER");
  });
});
