import "server-only";
import { buildJabiyenOrderConfirmationEmail } from "@/binzeo/auth/lib/email/order-confirmation";
import { EMAIL_FROM, getPublicSiteUrl, transporter } from "@/binzeo/auth/lib/email/transporter";
import { createPrivilegedClient } from "@/common/database/supabase/clients";
import { getJabiyenAdminDatabase } from "@/jabiyen/website/database";

const TEMPLATE_VERSION = "order-confirmation-v1";
const ORDER_NUMBER_RE = /^JBY-\d{6}-[A-F0-9]{8}$/;

type OrderEmailSnapshot = {
  order_number: string;
  total_amount?: string | number | null;
  customer?: { name?: string | null; email?: string | null } | null;
  payment?: { method?: string | null } | null;
  [key: string]: unknown;
};

function parseMinorUnits(value: string | number | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d{1,10})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function codOrderUsdMinor(order: OrderEmailSnapshot) {
  const amount = parseMinorUnits(order.total_amount);
  if (amount == null || amount <= 0n || amount > 999_999_999_999n) throw new Error("JABIYEN_ORDER_TOTAL_INVALID");
  return Number(amount);
}

type DeliveryRecord = {
  id: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempt_count: number;
  last_attempt_at: string | null;
};

function databaseFailure(operation: string, error: { code?: string } | null): never {
  console.error(`[CENTRAL_ORDER_CONFIRMATION_${operation}]`, error?.code || "DATABASE_ERROR");
  throw new Error("ORDER_CONFIRMATION_EMAIL_UNAVAILABLE");
}

async function loadOrderSnapshot(orderNumber: string): Promise<OrderEmailSnapshot> {
  if (!ORDER_NUMBER_RE.test(orderNumber)) throw new Error("JABIYEN_ORDER_NOT_FOUND");
  const db = getJabiyenAdminDatabase();
  const { data: order, error: orderError } = await db.from("orders")
    .select("order_number,access_token_hash")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (orderError) databaseFailure("JABIYEN_ORDER_LOOKUP", orderError);
  if (!order || typeof order.access_token_hash !== "string") throw new Error("JABIYEN_ORDER_NOT_FOUND");

  const { data, error } = await db.rpc("get_jabiyen_public_order", {
    p_order_number: orderNumber,
    p_access_token_hash: order.access_token_hash,
  });
  if (error) databaseFailure("JABIYEN_ORDER_DETAILS", error);
  if (!data || data.order_number !== orderNumber || !data.customer?.email) throw new Error("JABIYEN_ORDER_DETAILS_UNAVAILABLE");
  return data as OrderEmailSnapshot;
}

async function createOrLoadDelivery(centralDb: ReturnType<typeof createPrivilegedClient>, orderNumber: string, email: string) {
  const table = centralDb.from("order_confirmation_email_deliveries");
  const { data: found, error: lookupError } = await table
    .select("id,status,attempt_count,last_attempt_at")
    .eq("project_key", "jabiyen")
    .eq("order_reference", orderNumber)
    .eq("template_version", TEMPLATE_VERSION)
    .maybeSingle<DeliveryRecord>();
  if (lookupError) databaseFailure("DELIVERY_LOOKUP", lookupError);
  if (found) return found;

  const { data: created, error: insertError } = await table.insert({
    project_key: "jabiyen",
    order_reference: orderNumber,
    template_version: TEMPLATE_VERSION,
    recipient_email: email,
    status: "pending",
    attempt_count: 0,
  }).select("id,status,attempt_count,last_attempt_at").maybeSingle<DeliveryRecord>();
  if (insertError && insertError.code !== "23505") databaseFailure("DELIVERY_CREATE", insertError);
  if (created) return created;

  const { data: raced, error: racedError } = await table
    .select("id,status,attempt_count,last_attempt_at")
    .eq("project_key", "jabiyen")
    .eq("order_reference", orderNumber)
    .eq("template_version", TEMPLATE_VERSION)
    .maybeSingle<DeliveryRecord>();
  if (racedError) databaseFailure("DELIVERY_RELOAD", racedError);
  if (!raced) throw new Error("ORDER_CONFIRMATION_DELIVERY_UNAVAILABLE");
  return raced;
}

async function sendOnce({ order, paymentMethod, expectedEmail, stripeAmountMinor, stripeCurrency }: {
  order: OrderEmailSnapshot;
  paymentMethod: "cod" | "stripe";
  expectedEmail: string;
  stripeAmountMinor?: number;
  stripeCurrency?: string;
}) {
  const email = order.customer?.email?.trim().toLowerCase() || "";
  if (!email || email !== expectedEmail.trim().toLowerCase()) throw new Error("ORDER_EMAIL_IDENTITY_MISMATCH");
  if (paymentMethod === "cod" && order.payment?.method !== "cod") throw new Error("ORDER_PAYMENT_METHOD_MISMATCH");

  const centralDb = createPrivilegedClient();
  const delivery = await createOrLoadDelivery(centralDb, order.order_number, email);
  if (delivery.status === "sent") return { sent: false, alreadySent: true };
  if (delivery.status === "sending") {
    const lastAttempt = delivery.last_attempt_at ? Date.parse(delivery.last_attempt_at) : NaN;
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 15 * 60 * 1000) {
      return { sent: false, alreadyInProgress: true };
    }
    const { error: staleError } = await centralDb.from("order_confirmation_email_deliveries").update({
      status: "failed",
      last_error: "Previous delivery outcome was not recorded; retrying after the delivery lease expired.",
      updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    if (staleError) databaseFailure("STALE_DELIVERY_RESET", staleError);
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await centralDb.from("order_confirmation_email_deliveries").update({
    status: "sending",
    recipient_email: email,
    attempt_count: delivery.attempt_count + 1,
    last_attempt_at: now,
    last_error: null,
    updated_at: now,
  }).eq("id", delivery.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
  if (claimError) databaseFailure("DELIVERY_CLAIM", claimError);
  if (!claimed) return { sent: false, alreadyInProgress: true };

  try {
    const orderAmountUsdMinor = paymentMethod === "cod" ? codOrderUsdMinor(order) : (stripeAmountMinor ?? Number.NaN);
    if (!Number.isSafeInteger(orderAmountUsdMinor) || orderAmountUsdMinor <= 0 || (paymentMethod === "stripe" && stripeCurrency !== "usd")) {
      throw new Error("ORDER_USD_AMOUNT_INVALID");
    }
    const content = buildJabiyenOrderConfirmationEmail({
      siteUrl: getPublicSiteUrl(),
      order,
      paymentMethod,
      orderAmountUsdMinor: Number(orderAmountUsdMinor),
    });
    const info = await transporter.sendMail({ from: EMAIL_FROM, to: email, subject: content.subject, html: content.html });
    const rejected = Array.isArray(info.rejected) && info.rejected.length > 0;
    if (rejected) throw new Error("SMTP_RECIPIENT_REJECTED");

    const { error: finalizeError } = await centralDb.from("order_confirmation_email_deliveries").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: typeof info.messageId === "string" ? info.messageId.slice(0, 500) : null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    if (finalizeError) {
      // SMTP has accepted the email. Leave the row in `sending` so retries cannot duplicate it.
      console.error("[CENTRAL_ORDER_CONFIRMATION_FINALIZE]", finalizeError.code || "DATABASE_ERROR");
    }
    return { sent: true, alreadySent: false };
  } catch (error) {
    await centralDb.from("order_confirmation_email_deliveries").update({
      status: "failed",
      last_error: "SMTP delivery failed.",
      updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    console.error("[CENTRAL_ORDER_CONFIRMATION_SMTP]", error instanceof Error ? error.name : "UNKNOWN");
    throw new Error("ORDER_CONFIRMATION_EMAIL_DELIVERY_FAILED");
  }
}

export async function sendJabiyenCodOrderConfirmationEmailOnce(orderNumber: string, expectedEmail: string) {
  const order = await loadOrderSnapshot(orderNumber);
  return sendOnce({ order, paymentMethod: "cod", expectedEmail });
}

export async function sendPaidJabiyenStripeOrderConfirmationEmailOnce(paymentRequestId: string) {
  const centralDb = createPrivilegedClient();
  const { data: request, error: requestError } = await centralDb.from("payment_requests")
    .select("id,project_id,user_id,external_order_reference,amount_minor,currency,status,fulfillment_status")
    .eq("id", paymentRequestId)
    .maybeSingle();
  if (requestError) databaseFailure("PAID_REQUEST_LOOKUP", requestError);
  if (!request || request.status !== "paid" || !request.user_id) throw new Error("STRIPE_PAYMENT_NOT_CONFIRMED");

  const [{ data: project, error: projectError }, { data: customer, error: customerError }] = await Promise.all([
    centralDb.from("platform_projects").select("project_key").eq("id", request.project_id).maybeSingle(),
    centralDb.from("payment_customers").select("email_snapshot").eq("user_id", request.user_id).maybeSingle(),
  ]);
  if (projectError) databaseFailure("PROJECT_LOOKUP", projectError);
  if (customerError) databaseFailure("PAYMENT_CUSTOMER_LOOKUP", customerError);
  if (project?.project_key !== "jabiyen") return { sent: false, notApplicable: true };
  if (request.fulfillment_status !== "fulfilled") throw new Error("STRIPE_ORDER_NOT_FULFILLED");
  if (!customer?.email_snapshot) throw new Error("STRIPE_PAYMENT_CUSTOMER_UNAVAILABLE");
  if (request.currency !== "usd" || !Number.isSafeInteger(Number(request.amount_minor)) || Number(request.amount_minor) <= 0) {
    throw new Error("STRIPE_PAYMENT_AMOUNT_INVALID");
  }

  const orderNumber = String(request.external_order_reference);
  const order = await loadOrderSnapshot(orderNumber);
  return sendOnce({
    order,
    paymentMethod: "stripe",
    expectedEmail: customer.email_snapshot,
    stripeAmountMinor: Number(request.amount_minor),
    stripeCurrency: request.currency,
  });
}
