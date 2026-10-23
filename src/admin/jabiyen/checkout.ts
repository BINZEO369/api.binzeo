import "server-only";
import { createHash, createHmac } from "node:crypto";
import express from "express";
import { z } from "zod";
import { authenticateBearerToken } from "@/lib/auth/identity";
import { getJabiyenAdminDatabase } from "@/user/jabiyen/database";

const router = express.Router();
const PHONE_RE = /^(?:\+?8801[3-9]\d{8}|01[3-9]\d{8})$/;
const ORDER_NUMBER_RE = /^JBY-\d{6}-[A-F0-9]{8}$/;
const ACCESS_TOKEN_RE = /^[A-Za-z0-9_-]{43,64}$/;

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  variant_id: z.union([z.null(), z.coerce.number().int().positive()]).optional().default(null),
  quantity: z.number().int().min(1).max(10),
});

const checkoutSchema = z.object({
  idempotency_key: z.string().uuid(),
  access_token: z.string().regex(ACCESS_TOKEN_RE),
  customer: z.object({
    name: z.string().trim().max(120).optional().default(""),
    phone: z.string().trim().max(24).optional().default(""),
    email: z.string().trim().max(254).refine((value) => !value || z.string().email().safeParse(value).success).optional().default(""),
    address: z.object({
      line1: z.string().trim().max(240).optional().default(""),
      line2: z.string().trim().max(240).optional().default(""),
      district: z.string().trim().max(100).optional().default(""),
      city: z.string().trim().max(100).optional().default(""),
      postal_code: z.string().trim().max(20).optional().default(""),
      state: z.string().trim().max(120).optional().default(""),
      country_code: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).default("BD"),
    }),
    delivery_notes: z.string().trim().max(500).optional().default(""),
  }),
  delivery_type: z.enum(["Standard", "Express"]).default("Standard"),
  quoted_delivery_fee: z.number().finite().nonnegative().max(10000000).optional(),
  items: z.array(itemSchema).min(1).max(20),
  website: z.string().max(0).optional().default(""),
});

const shippingQuoteSchema = z.object({
  country_code: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  state: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  postal_code: z.string().trim().max(20).optional().default(""),
  delivery_type: z.enum(["Standard", "Express"]).default("Standard"),
  subtotal: z.coerce.number().finite().nonnegative().max(10000000),
});

function normalizePhone(phone: string) {
  const compact = phone.replace(/[\s().-]/g, "");
  if (/^01[3-9]\d{8}$/.test(compact)) return `+88${compact}`;
  if (/^8801[3-9]\d{8}$/.test(compact)) return `+${compact}`;
  return compact;
}

function allowlistedOrigin(req: express.Request) {
  const origin = req.get("origin");
  if (!origin) return false;
  if (origin === "https://jabiyen-website.vercel.app") return true;
  return process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function clientFingerprint(req: express.Request, serviceKey: string) {
  const raw = req.get("x-real-ip") || req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
  return createHmac("sha256", serviceKey).update(raw).digest("hex");
}

async function authenticateOrderRequest(req: express.Request) {
  return authenticateBearerToken(new Request("https://api.binzeo.invalid/jabiyen-order", {
    headers: { Authorization: req.get("authorization") || "" },
  }));
}

function errorStatus(code: string) {
  if (code === "RATE_LIMITED") return 429;
  if (["OUT_OF_STOCK", "PRODUCT_UNAVAILABLE", "VARIANT_UNAVAILABLE", "VARIANT_REQUIRED", "IDEMPOTENCY_CONFLICT", "SHIPPING_UNAVAILABLE", "SHIPPING_QUOTE_CHANGED"].includes(code)) return 409;
  if (["INVALID_REQUEST", "INVALID_ITEMS", "INVALID_CUSTOMER", "INVALID_TOTAL", "INVALID_PRICE", "INVALID_SHIPPING_REQUEST"].includes(code)) return 400;
  return 503;
}

router.get("/api/shipping/quote", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.get("origin") && !allowlistedOrigin(req)) return res.status(403).json({ success: false, error: "Shipping quote origin is not allowed." });

  const parsed = shippingQuoteSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Please check your country, address, delivery type, and order subtotal." });
  if (!process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ success: false, error: "Shipping prices are temporarily unavailable." });

  try {
    const db = getJabiyenAdminDatabase();
    const { data, error } = await db.rpc("get_jabiyen_shipping_quote", {
      p_country_code: parsed.data.country_code,
      p_state: parsed.data.state,
      p_city: parsed.data.city,
      p_postal_code: parsed.data.postal_code,
      p_delivery_type: parsed.data.delivery_type,
      p_subtotal: parsed.data.subtotal,
    });
    if (error) {
      console.error("[JABIYEN_SHIPPING_QUOTE]", error.code || "DB_ERROR");
      return res.status(503).json({ success: false, error: "Shipping prices are temporarily unavailable." });
    }
    if (!data?.ok) return res.status(errorStatus(data?.code || "SHIPPING_UNAVAILABLE")).json({ success: false, code: data?.code || "SHIPPING_UNAVAILABLE", error: data?.message || "Delivery is not available for this address." });
    return res.status(200).json({ success: true, quote: data.quote });
  } catch (error) {
    console.error("[JABIYEN_SHIPPING_QUOTE]", error instanceof Error ? error.name : "UNKNOWN");
    return res.status(503).json({ success: false, error: "Shipping prices are temporarily unavailable." });
  }
});

router.post("/api/orders", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.get("origin") && !allowlistedOrigin(req)) return res.status(403).json({ success: false, error: "Checkout origin is not allowed." });

  const identity = await authenticateOrderRequest(req);
  if (!identity.ok) return res.status(identity.status).json({ success: false, code: identity.code, error: identity.message });

  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Please check your contact, delivery, and cart details." });
  if (parsed.data.website) return res.status(400).json({ success: false, error: "Checkout could not be completed." });
  const accountEmail = identity.identity.user.email?.trim().toLowerCase() || "";
  if (!accountEmail || parsed.data.customer.email.trim().toLowerCase() !== accountEmail) {
    return res.status(403).json({ success: false, code: "ORDER_ACCOUNT_MISMATCH", error: "Your order email must match your signed-in account." });
  }

  const serviceKey = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(503).json({ success: false, error: "Checkout is temporarily unavailable. Please call the store." });

  try {
    const db = getJabiyenAdminDatabase();
    const accessTokenHash = createHash("sha256").update(parsed.data.access_token).digest("hex");
    const { data, error } = await db.rpc("create_jabiyen_cod_order", {
      p_idempotency_key: parsed.data.idempotency_key,
      p_access_token_hash: accessTokenHash,
      p_request_fingerprint: clientFingerprint(req, serviceKey),
      p_customer: {
        name: parsed.data.customer.name.trim().length >= 2 ? parsed.data.customer.name : null,
        phone: PHONE_RE.test(parsed.data.customer.phone.replace(/[\s().-]/g, ""))
          ? normalizePhone(parsed.data.customer.phone)
          : null,
        email: parsed.data.customer.email || null,
        address: {
          ...parsed.data.customer.address,
          line1: parsed.data.customer.address.line1,
          country_code: parsed.data.customer.address.country_code,
        },
        delivery_notes: parsed.data.customer.delivery_notes || null,
        delivery_type: parsed.data.delivery_type,
        quoted_delivery_fee: parsed.data.quoted_delivery_fee ?? null,
      },
      p_items: parsed.data.items.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        quantity: item.quantity,
      })),
    });
    if (error) {
      console.error("[JABIYEN_COD_ORDER_CREATE]", error.code || "DB_ERROR");
      return res.status(503).json({ success: false, error: "We could not save your order just now. Please retry or contact the store." });
    }
    if (!data?.ok) return res.status(errorStatus(data?.code || "UNKNOWN")).json({ success: false, code: data?.code || "ORDER_FAILED", error: data?.message || "We could not complete this order." });

    return res.status(data.duplicate ? 200 : 201).json({
      success: true,
      order: data.order,
      access_token: parsed.data.access_token,
      message: "Your cash-on-delivery order has been received. The delivery fee and total are shown in your order details.",
    });
  } catch (error) {
    console.error("[JABIYEN_COD_ORDER_CREATE]", error instanceof Error ? error.name : "UNKNOWN");
    return res.status(503).json({ success: false, error: "Checkout is temporarily unavailable. Please try again shortly." });
  }
});

router.get("/api/orders/:orderNumber", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.get("origin") && !allowlistedOrigin(req)) return res.status(403).json({ success: false, error: "Order lookup origin is not allowed." });

  const identity = await authenticateOrderRequest(req);
  if (!identity.ok) return res.status(identity.status).json({ success: false, code: identity.code, error: identity.message });

  const orderNumber = typeof req.params.orderNumber === "string" ? req.params.orderNumber.toUpperCase() : "";
  const token = req.get("x-order-access-token")?.match(/^([A-Za-z0-9_-]{43,64})$/)?.[1] || "";
  if (!ORDER_NUMBER_RE.test(orderNumber) || !ACCESS_TOKEN_RE.test(token)) {
    return res.status(404).json({ success: false, error: "Order not found." });
  }

  try {
    const db = getJabiyenAdminDatabase();
    const accessTokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await db.rpc("get_jabiyen_public_order", {
      p_order_number: orderNumber,
      p_access_token_hash: accessTokenHash,
    });
    if (error) {
      console.error("[JABIYEN_COD_ORDER_LOOKUP]", error.code || "DB_ERROR");
      return res.status(503).json({ success: false, error: "Order status is temporarily unavailable." });
    }
    const accountEmail = identity.identity.user.email?.trim().toLowerCase() || "";
    const orderEmail = typeof data?.customer?.email === "string" ? data.customer.email.trim().toLowerCase() : "";
    if (!data || !accountEmail || orderEmail !== accountEmail) return res.status(404).json({ success: false, error: "Order not found." });
    return res.status(200).json({ success: true, order: data });
  } catch (error) {
    console.error("[JABIYEN_COD_ORDER_LOOKUP]", error instanceof Error ? error.name : "UNKNOWN");
    return res.status(503).json({ success: false, error: "Order status is temporarily unavailable." });
  }
});

export default router;
