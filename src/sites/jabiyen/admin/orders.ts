// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import { supabase, adminAuth } from "./admin-context";

const router = express.Router();
const ORDER_STATUSES = ["pending_confirmation", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];
const PAYMENT_STATUSES = ["awaiting_collection", "collected", "cancelled", "refunded"] as const;

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
function isPaymentStatus(value: unknown): boolean {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}
function cleanString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result ? result.slice(0, max) : undefined;
}

router.use(adminAuth);

router.get("/api/admin/orders", async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "25"), 10) || 25, 1), 100);
    const status = cleanString(req.query.status, 40);
    const search = cleanString(req.query.search, 120);
    let query = supabase.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (status && isOrderStatus(status)) query = query.eq("status", status);
    if (search) query = query.or(`order_number.ilike.%${search}%,id.eq.${search}`);
    const { data: orders, error, count } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });
    const list = orders || [];
    const checkoutIds = list.map((o: any) => o.checkout_id).filter(Boolean);
    const orderIds = list.map((o: any) => o.id).filter(Boolean);
    const [checkoutResult, itemResult, paymentResult] = await Promise.all([
      checkoutIds.length ? supabase.from("checkout_sessions").select("*").in("id", checkoutIds) : { data: [], error: null },
      orderIds.length ? supabase.from("order_items").select("*").in("order_id", orderIds).order("created_at", { ascending: true }) : { data: [], error: null },
      orderIds.length ? supabase.from("order_payments").select("*").in("order_id", orderIds) : { data: [], error: null },
    ]);
    const checkouts = new Map((checkoutResult.data || []).map((x: any) => [x.id, x]));
    const items = new Map<string, any[]>();
    for (const item of itemResult.data || []) items.set(item.order_id, [...(items.get(item.order_id) || []), item]);
    const payments = new Map((paymentResult.data || []).map((x: any) => [x.order_id, x]));
    const result = list.map((order: any) => ({ ...order, checkout: checkouts.get(order.checkout_id) || null, items: items.get(order.id) || [], payment: payments.get(order.id) || null }));
    return res.json({ success: true, orders: result, pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || "Failed to load orders" });
  }
});

router.get("/api/admin/orders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { data: order, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    const [checkout, items, payment, history] = await Promise.all([
      supabase.from("checkout_sessions").select("*").eq("id", order.checkout_id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id).order("created_at", { ascending: true }),
      supabase.from("order_payments").select("*").eq("order_id", id).maybeSingle(),
      supabase.from("order_status_history").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    ]);
    return res.json({ success: true, order: { ...order, checkout: checkout.data || null, items: items.data || [], payment: payment.data || null, history: history.data || [] } });
  } catch (error: any) { return res.status(500).json({ success: false, error: error?.message || "Failed to load order" }); }
});

router.patch("/api/admin/orders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const { data: current, error: findError } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (findError) return res.status(500).json({ success: false, error: findError.message });
    if (!current) return res.status(404).json({ success: false, error: "Order not found" });
    const nextStatus = body.status === undefined ? current.status : body.status;
    if (!isOrderStatus(nextStatus)) return res.status(400).json({ success: false, error: "Invalid order status" });
    const orderUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) orderUpdate.status = nextStatus;
    if (body.order_number !== undefined) { const number = cleanString(body.order_number, 80); if (number) orderUpdate.order_number = number; }
    const { data: updated, error: orderError } = await supabase.from("orders").update(orderUpdate).eq("id", id).select("*").single();
    if (orderError) return res.status(500).json({ success: false, error: orderError.message });
    const checkoutFields = ["customer_name", "customer_phone", "customer_email", "shipping_address", "delivery_notes", "delivery_fee", "delivery_fee_status", "delivery_type", "estimated_days_min", "estimated_days_max"];
    const checkoutUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of checkoutFields) if (body[field] !== undefined) checkoutUpdate[field] = body[field];
    if (Object.keys(checkoutUpdate).length > 1 && current.checkout_id) {
      const { error: checkoutError } = await supabase.from("checkout_sessions").update(checkoutUpdate).eq("id", current.checkout_id);
      if (checkoutError) return res.status(400).json({ success: false, error: checkoutError.message });
    }
    if (body.payment_status !== undefined || body.collected_amount !== undefined) {
      if (body.payment_status !== undefined && !isPaymentStatus(body.payment_status)) return res.status(400).json({ success: false, error: "Invalid payment status" });
      const paymentUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.payment_status !== undefined) paymentUpdate.status = body.payment_status;
      if (body.collected_amount !== undefined) paymentUpdate.collected_amount = body.collected_amount;
      if (body.payment_status === "collected") paymentUpdate.collected_at = new Date().toISOString();
      await supabase.from("order_payments").update(paymentUpdate).eq("order_id", id);
    }
    if (current.status !== nextStatus) {
      await supabase.from("order_status_history").insert({ order_id: id, from_status: current.status, to_status: nextStatus, changed_by: req.user?.email || req.user?.id || "admin", note: cleanString(body.status_note, 500) || null });
    }
    return res.json({ success: true, order: updated });
  } catch (error: any) { return res.status(500).json({ success: false, error: error?.message || "Failed to update order" }); }
});

router.delete("/api/admin/orders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { data: order, error: findError } = await supabase.from("orders").select("id,status,checkout_id").eq("id", id).maybeSingle();
    if (findError) return res.status(500).json({ success: false, error: findError.message });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    if (["shipped", "delivered", "returned"].includes(order.status)) return res.status(409).json({ success: false, error: "Completed orders cannot be deleted. Change status to cancelled only when appropriate." });
    for (const table of ["order_status_history", "order_payments", "order_items"]) {
      const { error } = await supabase.from(table).delete().eq("order_id", id);
      if (error) return res.status(500).json({ success: false, error: error.message });
    }
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (error: any) { return res.status(500).json({ success: false, error: error?.message || "Failed to delete order" }); }
});

export default router;
