import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJabiyenGateway } from "@/admin/jabiyen/express-adapter";
import checkout from "@/admin/jabiyen/checkout";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/user/jabiyen/database", () => ({
  getJabiyenAdminDatabase: () => ({ rpc }),
}));

const validCheckout = {
  idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
  access_token: "a".repeat(64),
  customer: {
    name: "Test Customer",
    phone: "+8801712345678",
    email: "",
    address: {
      line1: "12 Test Road",
      line2: "",
      district: "Dhaka",
      city: "Dhaka",
      postal_code: "",
      country_code: "BD",
    },
    delivery_notes: "",
  },
  items: [{ product_id: 12, variant_id: 34, quantity: 2 }],
  website: "",
};

function createPublicApiHarness() {
  const app = express();
  app.use((req, _res, next) => {
    const prefix = "/api/jabiyen-public";
    if (req.url.startsWith(prefix)) req.url = "/api" + req.url.slice(prefix.length);
    next();
  });
  app.use(express.json());
  app.use(checkout);
  return app;
}

describe("JABIYEN COD checkout RPC contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    rpc.mockResolvedValue({
      data: {
        ok: true,
        duplicate: false,
        order: {
          order_number: "JBY-261022-A1B2C3D4",
          status: "pending_confirmation",
          item_count: 1,
        },
      },
      error: null,
    });
  });

  it("calls the database RPC with the declared p_items parameter and returns the private token", async () => {
    const request = new Request("https://api.example/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCheckout),
    });

    const response = await runJabiyenGateway(
      createPublicApiHarness(),
      request,
      "/api/jabiyen-public",
      ["orders"],
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.order.order_number).toBe("JBY-261022-A1B2C3D4");
    expect(payload.access_token).toBe(validCheckout.access_token);
    expect(rpc).toHaveBeenCalledTimes(1);

    const [functionName, args] = rpc.mock.calls[0];
    expect(functionName).toBe("create_jabiyen_cod_order");
    expect(args.p_items).toEqual([{ product_id: 12, variant_id: 34, quantity: 2 }]);
    expect(args).not.toHaveProperty("items");
    expect(args.p_access_token_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
