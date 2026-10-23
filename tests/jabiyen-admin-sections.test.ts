import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJabiyenGateway } from "@/admin/jabiyen/express-adapter";
import dataTables from "@/admin/jabiyen/data-tables";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/admin/jabiyen/admin-context", () => ({
  adminAuth: (req: unknown, _res: unknown, next: () => void) => {
    const request = req as { user?: unknown; admin?: unknown };
    request.user = { id: "admin-user" };
    request.admin = { email: "admin@example.test", full_name: "Store Admin", role: "admin" };
    next();
  },
  supabase: { from: mocks.from },
}));

function createQuery() {
  const result = { data: [], error: null, count: 0 };
  const query = {} as {
    select: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    abortSignal: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
  query.select = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn(async () => result);
  query.insert = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.delete = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.abortSignal = vi.fn(() => query);
  query.single = vi.fn(async () => ({ data: { id: 12, header_title: "About" }, error: null }));
  query.maybeSingle = vi.fn(async () => ({ data: { id: 12, header_title: "About" }, error: null }));
  return query;
}

function createAdminApiHarness() {
  const app = express();
  app.use((req, _res, next) => {
    const prefix = "/api/jabiyen-admin";
    if (req.url.startsWith(prefix)) req.url = "/api" + req.url.slice(prefix.length);
    next();
  });
  app.use(express.json());
  app.use(dataTables);
  return app;
}

async function request(path: string[], init: { method?: string; body?: unknown } = {}) {
  const response = await runJabiyenGateway(
    createAdminApiHarness(),
    new Request(`https://api.example/${path.join("/")}`, {
      method: init.method || "GET",
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    "/api/jabiyen-admin",
    path,
  );
  const body = await response.json().catch(() => null);
  return { response, body };
}

describe("JABIYEN admin content sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation(() => createQuery());
  });

  it("offers friendly website-section paths and excludes auth, customer and order tables", async () => {
    const { response, body } = await request(["admin", "tables"]);
    const names = body.tables.map((table: { name: string }) => table.name);
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.admin.email).toBe("admin@example.test");
    expect(body.tables.length).toBeGreaterThan(20);
    expect(body.tables.every((table: { path: string }) => !table.path.includes("/database/"))).toBe(true);
    expect(names).toContain("about_us");
    expect(names).toContain("shipping_fees");
    expect(names).not.toContain("admins");
    expect(names).not.toContain("profiles");
    expect(names).not.toContain("customer_profiles");
    expect(names).not.toContain("orders");
    expect(names).not.toContain("order_payments");
  });

  it("provides the sign-in session verification endpoint expected by the static frontend", async () => {
    const { response, body } = await request(["admin", "session"]);
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user).toMatchObject({ email: "admin@example.test", full_name: "Store Admin" });
  });

  it("returns actual column names and paginated records for a content page", async () => {
    const query = createQuery();
    query.range = vi.fn(async () => ({ data: [{ id: 12, header_title: "About" }], error: null, count: 1 }));
    mocks.from.mockReturnValueOnce(query);
    const { response, body } = await request(["admin", "tables", "about_us"]);
    expect(response.status).toBe(200);
    expect(body.name).toBe("about_us");
    expect(body.columns.map((column: { name: string }) => column.name)).toContain("header_title");
    expect(body.editableColumns).toContain("section_description");
    expect(body.rows).toEqual([{ id: 12, header_title: "About" }]);
  });

  it("does not expose order tables through the generic reader or writer", async () => {
    const { response, body } = await request(["admin", "tables", "orders"], { method: "POST", body: { status: "cancelled" } });
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("creates a content row using only the section's explicit editable columns", async () => {
    const query = createQuery();
    mocks.from.mockReturnValueOnce(query);
    const { response, body } = await request(["admin", "tables", "about_us"], {
      method: "POST",
      body: { header_title: "About", section_description: "Our story" },
    });
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith("about_us");
    expect(query.insert).toHaveBeenCalledWith({ header_title: "About", section_description: "Our story" });
  });

  it("returns a clear timeout response when a database write never settles", async () => {
    vi.useFakeTimers();
    try {
      const query = createQuery();
      query.single = vi.fn(() => new Promise(() => {}));
      mocks.from.mockReturnValueOnce(query);
      const pendingRequest = request(["admin", "tables", "about_us"], {
        method: "POST",
        body: { header_title: "About", section_description: "Our story" },
      });
      await vi.advanceTimersByTimeAsync(7000);
      const { response, body } = await pendingRequest;
      expect(response.status).toBe(504);
      expect(body.error).toContain("timed out");
      expect(query.abortSignal).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects attempts to edit fields outside the explicit allowlist", async () => {
    const { response, body } = await request(["admin", "tables", "about_us", "12"], {
      method: "PATCH",
      body: { role: "super_admin" },
    });
    expect(response.status).toBe(400);
    expect(body.error).toContain("role");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("updates and deletes an allowed section row", async () => {
    const updateQuery = createQuery();
    const deleteQuery = createQuery();
    mocks.from.mockReturnValueOnce(updateQuery).mockReturnValueOnce(deleteQuery);
    const update = await request(["admin", "tables", "about_us", "12"], { method: "PATCH", body: { header_title: "New title" } });
    const remove = await request(["admin", "tables", "about_us", "12"], { method: "DELETE" });
    expect(update.response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ header_title: "New title", updated_at: expect.any(String) }));
    expect(remove.response.status).toBe(200);
    expect(deleteQuery.delete).toHaveBeenCalledTimes(1);
  });
});
