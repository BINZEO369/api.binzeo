import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJabiyenGateway } from "@/jabiyen/admin/express-adapter";
import products from "@/jabiyen/admin/products";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/jabiyen/admin/admin-context", () => ({
  adminAuth: (req: unknown, _res: unknown, next: () => void) => {
    const request = req as { user?: unknown; admin?: unknown };
    request.user = { id: "admin-user" };
    request.admin = { email: "admin@example.test", role: "admin" };
    next();
  },
  superAdminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  supabase: { from: mocks.from },
}));

function createQuery(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const query = {} as {
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
  query.delete = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  return query;
}

function createProductApi() {
  const app = express();
  app.use((req, _res, next) => {
    const prefix = "/api/jabiyen-admin";
    if (req.url.startsWith(prefix)) req.url = "/api" + req.url.slice(prefix.length);
    next();
  });
  app.use(express.json());
  app.use(products);
  return app;
}

async function request(path: string[], method: string) {
  const response = await runJabiyenGateway(
    createProductApi(),
    new Request(`https://api.example/${path.join("/")}`, { method }),
    "/api/jabiyen-admin",
    path,
  );
  return { response, body: await response.json() };
}

describe("JABIYEN product delete lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives an order-linked product when the database restricts hard deletion", async () => {
    const deleteQuery = createQuery({ data: null, error: { code: "23503", message: "order_items product foreign key restricts deletion" } });
    const archiveQuery = createQuery({ data: { id: 42, title: "Ordered item", is_active: false }, error: null });
    mocks.from.mockReturnValueOnce(deleteQuery).mockReturnValueOnce(archiveQuery);

    const { response, body } = await request(["admin", "products", "42"], "DELETE");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, archived: true, product: { id: 42, is_active: false } });
    expect(archiveQuery.update).toHaveBeenCalledWith({ is_active: false });
  });

  it("hard-deletes products that are not referenced by order history", async () => {
    const deleteQuery = createQuery({ data: { id: 43, title: "Unused item" }, error: null });
    mocks.from.mockReturnValueOnce(deleteQuery);

    const { response, body } = await request(["admin", "products", "43"], "DELETE");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, message: "Product deleted successfully", product: { id: 43 } });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("restores an archived product to the storefront", async () => {
    const restoreQuery = createQuery({ data: { id: 42, title: "Ordered item", is_active: true }, error: null });
    mocks.from.mockReturnValueOnce(restoreQuery);

    const { response, body } = await request(["admin", "products", "42", "restore"], "PATCH");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, product: { id: 42, is_active: true } });
    expect(restoreQuery.update).toHaveBeenCalledWith({ is_active: true });
  });
});
