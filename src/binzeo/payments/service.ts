import "server-only";
import Stripe from "stripe";
import { z } from "zod";
import type { CentralIdentity } from "@/binzeo/auth/identity";
import { createPrivilegedClient } from "@/common/database/supabase/clients";
import { getJabiyenAdminDatabase } from "@/jabiyen/website/database";
import { sendPaidJabiyenStripeOrderConfirmationEmailOnce } from "@/binzeo/payments/order-confirmation-email";
import { buildPaymentReturnUrl, checkoutSessionMatchesAttempt, createPaymentReturnToken, hashPaymentReturnToken, USD_CHECKOUT_PRICING_OPTIONS, usdMajorToMinorUnits, verifiedCheckoutEventStatus } from "@/binzeo/payments/security";

export class PaymentServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

const currencySchema = z.string().regex(/^[a-z]{3}$/);
const lineItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  quantity: z.number().int().min(1).max(99),
  unit_amount_minor: z.number().int().min(1).max(999999999999),
}).strict();
const lineItemsSchema = z.array(lineItemSchema).min(1).max(100);
const requestInputSchema = z.object({
  project_key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  external_order_reference: z.string().trim().min(1).max(160),
  idempotency_key: z.string().uuid(),
  amount_minor: z.number().int().min(1).max(999999999999),
  currency: currencySchema,
  line_items: lineItemsSchema,
}).strict();

export type PaymentRequestInput = z.infer<typeof requestInputSchema>;
export type PaymentLineItem = z.infer<typeof lineItemSchema>;

function requireStripeSecret(mode: "test" | "live") {
  const secret = process.env.STRIPE_SECRET_KEY;
  const expectedPrefix = mode === "live" ? "sk_live_" : "sk_test_";
  if (!secret || !secret.startsWith(expectedPrefix)) {
    throw new PaymentServiceError("PAYMENT_PROVIDER_NOT_CONFIGURED", 503, "The payment service is not configured.");
  }
  if (mode === "live" && process.env.STRIPE_LIVE_CHARGES_ENABLED !== "true") {
    throw new PaymentServiceError("LIVE_PAYMENTS_NOT_ENABLED", 503, "Live payments are not enabled.");
  }
  return new Stripe(secret);
}

function safeDatabaseError(error: { code?: string } | null, operation: string): never {
  console.error(`[CENTRAL_PAYMENT_${operation}]`, error?.code || "DATABASE_ERROR");
  throw new PaymentServiceError("PAYMENT_SERVICE_UNAVAILABLE", 503, "The payment service is temporarily unavailable.");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

type ExistingPaymentRequest = {
  user_id: string | null;
  amount_minor: number | string;
  currency: string;
  idempotency_key: string;
  line_items: unknown;
};

function isSameOrder(existing: ExistingPaymentRequest, input: PaymentRequestInput, userId: string) {
  return existing.user_id === userId
    && Number(existing.amount_minor) === input.amount_minor
    && existing.currency === input.currency
    && existing.idempotency_key === input.idempotency_key
    && canonicalJson(existing.line_items) === canonicalJson(input.line_items);
}

/**
 * Trusted site adapters call this only after loading the order from their server-side
 * data source, checking ownership against `identity.user.id`, and calculating the
 * final payable total. It is intentionally not exposed as a browser-facing route.
 */
export async function createPaymentRequest(input: unknown, identity: CentralIdentity) {
  const parsed = requestInputSchema.safeParse(input);
  if (!parsed.success) throw new PaymentServiceError("INVALID_PAYMENT_ORDER", 400, "The payment order is invalid.");
  const order = parsed.data;
  if (order.currency !== "usd") throw new PaymentServiceError("CURRENCY_NOT_ALLOWED", 400, "All central payments must be charged in USD.");
  if (!identity.user.email || !identity.user.email_confirmed_at) {
    throw new PaymentServiceError("VERIFIED_EMAIL_REQUIRED", 403, "A verified account email is required for checkout.");
  }

  const lineTotal = order.line_items.reduce((total, item) => total + item.quantity * item.unit_amount_minor, 0);
  if (!Number.isSafeInteger(lineTotal) || lineTotal !== order.amount_minor) {
    throw new PaymentServiceError("PAYMENT_TOTAL_MISMATCH", 400, "The server-calculated line items do not match the order total.");
  }

  const db = createPrivilegedClient();
  const { data: project, error: projectError } = await db
    .from("platform_projects")
    .select("id,status,project_key")
    .eq("project_key", order.project_key)
    .eq("status", "active")
    .maybeSingle();
  if (projectError) safeDatabaseError(projectError, "PROJECT_LOOKUP");
  if (!project) throw new PaymentServiceError("PAYMENT_SITE_NOT_FOUND", 404, "The payment site is not registered.");

  const [{ data: provider, error: providerError }, { data: site, error: siteError }] = await Promise.all([
    db.from("payment_provider_settings").select("enabled,mode,merchant_country,default_currency").eq("provider", "stripe").maybeSingle(),
    db.from("payment_site_settings").select("enabled,currency").eq("project_id", project.id).maybeSingle(),
  ]);
  if (providerError) safeDatabaseError(providerError, "PROVIDER_CONFIG");
  if (siteError) safeDatabaseError(siteError, "SITE_CONFIG");
  if (!provider?.enabled || !site?.enabled) {
    throw new PaymentServiceError("PAYMENTS_NOT_ENABLED", 503, "Payments are not enabled for this site.");
  }
  if (order.currency !== site.currency) {
    throw new PaymentServiceError("CURRENCY_NOT_ALLOWED", 400, "The payment currency does not match the site's configured currency.");
  }
  if (provider.mode === "live" && (!provider.merchant_country || !provider.default_currency)) {
    throw new PaymentServiceError("MERCHANT_CONFIGURATION_REQUIRED", 503, "Merchant country and currency must be configured before live payments.");
  }
  if (provider.mode === "live") {
    requireStripeSecret("live");
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new PaymentServiceError("WEBHOOK_NOT_CONFIGURED", 503, "The live payment webhook is not configured.");
    }
  }

  const { data, error } = await db.from("payment_requests").insert({
    project_id: project.id,
    user_id: identity.user.id,
    external_order_reference: order.external_order_reference,
    idempotency_key: order.idempotency_key,
    amount_minor: order.amount_minor,
    currency: order.currency,
    line_items: order.line_items,
    status: "pending",
    fulfillment_status: order.project_key === "jabiyen" ? "pending" : "not_required",
  }).select("id,project_id,user_id,external_order_reference,amount_minor,currency,line_items,status,fulfillment_status,expires_at").single();

  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await db.from("payment_requests").select("id,project_id,user_id,external_order_reference,idempotency_key,amount_minor,currency,line_items,status,fulfillment_status,expires_at").eq("project_id", project.id).eq("external_order_reference", order.external_order_reference).maybeSingle();
    if (lookupError) safeDatabaseError(lookupError, "IDEMPOTENCY_LOOKUP");
    if (existing && isSameOrder(existing, order, identity.user.id)) return existing;
    throw new PaymentServiceError("PAYMENT_ORDER_CONFLICT", 409, "A different payment request already exists for this order.");
  }
  if (error) safeDatabaseError(error, "REQUEST_CREATE");
  return data;
}

function safeRelativeUrl(path: string, origin: string, extraQuery?: Record<string, string>) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new PaymentServiceError("PAYMENT_RETURN_URL_INVALID", 503, "The payment return URL is not configured safely.");
  }
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new PaymentServiceError("PAYMENT_RETURN_URL_INVALID", 503, "The payment return URL is not configured safely.");
  for (const [key, value] of Object.entries(extraQuery ?? {})) url.searchParams.set(key, value);
  return url;
}

function centralProfileName(identity: CentralIdentity) {
  const displayName = identity.profile.display_name?.trim();
  if (displayName) return displayName.slice(0, 200);
  const fullName = [identity.profile.first_name, identity.profile.last_name].filter(Boolean).join(" ").trim();
  return fullName ? fullName.slice(0, 200) : null;
}

async function getOrCreateStripeCustomer(db: ReturnType<typeof createPrivilegedClient>, stripe: Stripe, identity: CentralIdentity) {
  const email = identity.user.email?.trim().toLowerCase();
  if (!email || !identity.user.email_confirmed_at) {
    throw new PaymentServiceError("VERIFIED_EMAIL_REQUIRED", 403, "A verified account email is required for checkout.");
  }
  const name = centralProfileName(identity);
  const { data: existing, error: lookupError } = await db.from("payment_customers")
    .select("user_id,stripe_customer_id,email_snapshot,name_snapshot")
    .eq("user_id", identity.user.id)
    .maybeSingle();
  if (lookupError) safeDatabaseError(lookupError, "CUSTOMER_LOOKUP");

  if (existing) {
    if (existing.email_snapshot !== email || existing.name_snapshot !== name) {
      try {
        await stripe.customers.update(existing.stripe_customer_id, {
          email,
          ...(name ? { name } : { name: "" }),
        });
      } catch (stripeError) {
        console.error("[CENTRAL_PAYMENT_CUSTOMER_SYNC]", stripeError instanceof Stripe.errors.StripeError ? stripeError.type : "STRIPE_CUSTOMER_UPDATE_FAILED");
        throw new PaymentServiceError("PAYMENT_CUSTOMER_SYNC_FAILED", 503, "The payment service is temporarily unavailable.");
      }
      const { error: updateError } = await db.from("payment_customers").update({ email_snapshot: email, name_snapshot: name }).eq("user_id", identity.user.id);
      if (updateError) safeDatabaseError(updateError, "CUSTOMER_UPDATE");
    }
    return existing.stripe_customer_id as string;
  }

  const emailKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${identity.user.id}:${email}`));
  const idempotencySuffix = Array.from(new Uint8Array(emailKey), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create({
      email,
      metadata: { central_user_id: identity.user.id },
    }, { idempotencyKey: `central-customer-${idempotencySuffix}` });
    if (name) await stripe.customers.update(customer.id, { name });
  } catch (error) {
    const errorCode = error instanceof Stripe.errors.StripeError ? error.type : "STRIPE_CUSTOMER_CREATE_FAILED";
    console.error("[CENTRAL_PAYMENT_CUSTOMER_CREATE]", errorCode);
    throw new PaymentServiceError("PAYMENT_CUSTOMER_CREATE_FAILED", 503, "The payment service is temporarily unavailable.");
  }

  const { error: insertError } = await db.from("payment_customers").insert({
    user_id: identity.user.id,
    stripe_customer_id: customer.id,
    email_snapshot: email,
    name_snapshot: name,
  });
  if (insertError?.code === "23505") {
    const { data: winner, error: winnerError } = await db.from("payment_customers").select("stripe_customer_id").eq("user_id", identity.user.id).maybeSingle();
    if (winnerError) safeDatabaseError(winnerError, "CUSTOMER_RACE_LOOKUP");
    if (winner) return winner.stripe_customer_id as string;
  } else if (insertError) {
    safeDatabaseError(insertError, "CUSTOMER_CREATE");
  }
  return customer.id;
}

export async function createCheckoutSession(input: {
  paymentRequestId: string;
  idempotencyKey: string;
  origin: string | null;
  identity: CentralIdentity;
}) {
  const db = createPrivilegedClient();
  const { data: paymentRequest, error: requestError } = await db.from("payment_requests")
    .select("id,project_id,user_id,external_order_reference,amount_minor,currency,line_items,status,expires_at")
    .eq("id", input.paymentRequestId)
    .eq("user_id", input.identity.user.id)
    .maybeSingle();
  if (requestError) safeDatabaseError(requestError, "REQUEST_LOOKUP");
  if (!paymentRequest) throw new PaymentServiceError("PAYMENT_REQUEST_NOT_FOUND", 404, "The payment request was not found.");
  if (paymentRequest.status !== "pending") throw new PaymentServiceError("PAYMENT_REQUEST_NOT_PAYABLE", 409, "This payment request is no longer payable.");
  if (new Date(paymentRequest.expires_at).getTime() <= Date.now()) {
    throw new PaymentServiceError("PAYMENT_REQUEST_EXPIRED", 409, "This payment request has expired.");
  }
  if (!input.identity.user.email || !input.identity.user.email_confirmed_at) {
    throw new PaymentServiceError("VERIFIED_EMAIL_REQUIRED", 403, "A verified account email is required for checkout.");
  }
  if (!input.origin) throw new PaymentServiceError("PAYMENT_ORIGIN_REQUIRED", 403, "A registered website origin is required.");

  let origin: string;
  try {
    origin = new URL(input.origin).origin;
    if (origin !== input.origin) throw new Error("Origin must not include a path.");
  } catch {
    throw new PaymentServiceError("PAYMENT_ORIGIN_NOT_ALLOWED", 403, "The payment website is not allowed.");
  }

  const [{ data: project, error: projectError }, { data: provider, error: providerError }, { data: site, error: siteError }] = await Promise.all([
    db.from("platform_projects").select("project_key,status,allowed_origins").eq("id", paymentRequest.project_id).maybeSingle(),
    db.from("payment_provider_settings").select("enabled,mode,merchant_country,default_currency").eq("provider", "stripe").maybeSingle(),
    db.from("payment_site_settings").select("enabled,currency,success_path,cancel_path").eq("project_id", paymentRequest.project_id).maybeSingle(),
  ]);
  if (projectError) safeDatabaseError(projectError, "PROJECT_LOOKUP");
  if (providerError) safeDatabaseError(providerError, "PROVIDER_CONFIG");
  if (siteError) safeDatabaseError(siteError, "SITE_CONFIG");
  const allowedOrigins = Array.isArray(project?.allowed_origins) ? project.allowed_origins : [];
  if (!project || project.status !== "active" || !allowedOrigins.includes(origin)) {
    throw new PaymentServiceError("PAYMENT_ORIGIN_NOT_ALLOWED", 403, "The payment website is not allowed.");
  }
  if (!provider?.enabled || !site?.enabled || !site.currency) {
    throw new PaymentServiceError("PAYMENTS_NOT_ENABLED", 503, "Payments are not enabled for this site.");
  }
  if (paymentRequest.currency !== "usd" || site.currency !== "usd" || provider.default_currency !== "usd") {
    throw new PaymentServiceError("CURRENCY_NOT_ALLOWED", 409, "The payment request currency does not match the site's configuration.");
  }
  if (provider.mode === "live" && provider.merchant_country !== "US") {
    throw new PaymentServiceError("MERCHANT_CONFIGURATION_REQUIRED", 503, "Merchant country and currency must be configured before live payments.");
  }

  const lineItems = lineItemsSchema.safeParse(paymentRequest.line_items);
  if (!lineItems.success) throw new PaymentServiceError("PAYMENT_ORDER_INVALID", 503, "The payment order is invalid.");
  const calculatedTotal = lineItems.data.reduce((total, item) => total + item.quantity * item.unit_amount_minor, 0);
  if (!Number.isSafeInteger(calculatedTotal) || calculatedTotal !== Number(paymentRequest.amount_minor)) {
    throw new PaymentServiceError("PAYMENT_TOTAL_MISMATCH", 409, "The saved order total does not match its line items.");
  }

  const stripe = requireStripeSecret(provider.mode);
  const { data: existingAttempts, error: attemptsError } = await db.from("payment_attempts")
    .select("id,idempotency_key,stripe_checkout_session_id,checkout_url,status")
    .eq("payment_request_id", paymentRequest.id)
    .in("status", ["creating", "open", "processing"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (attemptsError) safeDatabaseError(attemptsError, "ATTEMPT_LOOKUP");
  let attempt = existingAttempts?.[0] ?? null;
  if (attempt?.status === "open" && attempt.checkout_url) {
    return { payment_request_id: paymentRequest.id, checkout_session_id: attempt.stripe_checkout_session_id, checkout_url: attempt.checkout_url, status: attempt.status };
  }
  if (attempt?.status === "processing") {
    throw new PaymentServiceError("PAYMENT_PROCESSING", 409, "The payment is already being processed.");
  }
  if (attempt?.status === "creating" && attempt.idempotency_key !== input.idempotencyKey) {
    throw new PaymentServiceError("CHECKOUT_IN_PROGRESS", 409, "A checkout session is already being created.");
  }

  if (!attempt) {
    const { data: inserted, error: insertError } = await db.from("payment_attempts").insert({
      payment_request_id: paymentRequest.id,
      idempotency_key: input.idempotencyKey,
      amount_minor: paymentRequest.amount_minor,
      currency: paymentRequest.currency,
      status: "creating",
    }).select("id,idempotency_key,stripe_checkout_session_id,checkout_url,status").single();
    if (insertError?.code === "23505") {
      const { data: active, error: activeError } = await db.from("payment_attempts")
        .select("id,idempotency_key,stripe_checkout_session_id,checkout_url,status")
        .eq("payment_request_id", paymentRequest.id)
        .in("status", ["creating", "open", "processing"])
        .order("created_at", { ascending: false }).limit(1);
      if (activeError) safeDatabaseError(activeError, "ACTIVE_ATTEMPT_LOOKUP");
      attempt = active?.[0] ?? null;
      if (attempt?.status === "open" && attempt.checkout_url) {
        return { payment_request_id: paymentRequest.id, checkout_session_id: attempt.stripe_checkout_session_id, checkout_url: attempt.checkout_url, status: attempt.status };
      }
      if (!attempt) {
        const { data: previous, error: previousError } = await db.from("payment_attempts")
          .select("id,idempotency_key,stripe_checkout_session_id,checkout_url,status")
          .eq("payment_request_id", paymentRequest.id)
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (previousError) safeDatabaseError(previousError, "FAILED_ATTEMPT_LOOKUP");
        if (previous?.status === "failed") {
          const { data: retried, error: retryError } = await db.from("payment_attempts").update({ status: "creating" })
            .eq("id", previous.id)
            .select("id,idempotency_key,stripe_checkout_session_id,checkout_url,status")
            .single();
          if (retryError) safeDatabaseError(retryError, "FAILED_ATTEMPT_RETRY");
          attempt = retried;
        }
      }
      if (!attempt || attempt.status !== "creating" || attempt.idempotency_key !== input.idempotencyKey) {
        throw new PaymentServiceError("CHECKOUT_IN_PROGRESS", 409, "A checkout session is already being created.");
      }
    } else if (insertError) {
      safeDatabaseError(insertError, "ATTEMPT_CREATE");
    } else {
      attempt = inserted;
    }
  }
  if (!attempt) throw new PaymentServiceError("PAYMENT_SERVICE_UNAVAILABLE", 503, "The payment service is temporarily unavailable.");

  const successUrl = safeRelativeUrl(site.success_path, origin, {
    request_id: paymentRequest.id,
    order_number: paymentRequest.external_order_reference,
  });
  const successUrlValue = `${successUrl.toString()}${successUrl.search ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = safeRelativeUrl(site.cancel_path, origin, {
    payment: "cancelled",
    request_id: paymentRequest.id,
    order_number: paymentRequest.external_order_reference,
  });
  const metadata = {
    payment_request_id: paymentRequest.id,
    project_key: project.project_key,
    user_id: input.identity.user.id,
  };

  try {
    const stripeCustomerId = await getOrCreateStripeCustomer(db, stripe, input.identity);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...USD_CHECKOUT_PRICING_OPTIONS,
      client_reference_id: paymentRequest.id,
      customer: stripeCustomerId,
      line_items: lineItems.data.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: paymentRequest.currency,
          unit_amount: item.unit_amount_minor,
          product_data: {
            name: item.name,
            ...(item.description ? { description: item.description } : {}),
          },
        },
      })),
      success_url: successUrlValue,
      cancel_url: cancelUrl.toString(),
      metadata,
      payment_intent_data: { metadata },
    }, { idempotencyKey: `binzeo-payment-${attempt.id}` });

    if (!session.url) throw new Error("STRIPE_SESSION_URL_MISSING");
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const { error: updateError } = await db.from("payment_attempts").update({
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      checkout_url: session.url,
      status: "open",
    }).eq("id", attempt.id);
    if (updateError) safeDatabaseError(updateError, "ATTEMPT_UPDATE");
    return { payment_request_id: paymentRequest.id, checkout_session_id: session.id, checkout_url: session.url, status: "open" };
  } catch (error) {
    if (error instanceof PaymentServiceError) throw error;
    const errorCode = error instanceof Stripe.errors.StripeError ? error.type : "STRIPE_REQUEST_FAILED";
    console.error("[CENTRAL_PAYMENT_CHECKOUT]", errorCode);
    await db.from("payment_attempts").update({ status: "failed" }).eq("id", attempt.id);
    throw new PaymentServiceError("CHECKOUT_SESSION_CREATE_FAILED", 503, "We could not start checkout. Please retry shortly.");
  }
}

function parseMinorUnits(value: unknown): bigint | null {
  const match = String(value ?? "").trim().match(/^(\d{1,10})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/**
 * The Auth payment page submits only an order number. This adapter reads the
 * authoritative JABIYEN order and rate server-side; Stripe records are written
 * only to the Central Supabase payment tables.
 */
export async function createJabiyenOrderCheckoutSession(input: {
  orderNumber: string;
  origin: string | null;
  identity: CentralIdentity;
}) {
  const orderNumber = input.orderNumber.trim();
  if (!/^[A-Za-z0-9-]{1,80}$/.test(orderNumber)) {
    throw new PaymentServiceError("ORDER_NOT_PAYABLE", 404, "The order is not available for payment.");
  }
  const email = input.identity.user.email?.trim().toLowerCase();
  if (!email || !input.identity.user.email_confirmed_at) {
    throw new PaymentServiceError("VERIFIED_EMAIL_REQUIRED", 403, "A verified account email is required for checkout.");
  }

  const jabiDb = getJabiyenAdminDatabase();
  const { data: order, error: orderError } = await jabiDb.from("orders")
    .select("id,order_number,checkout_id,status")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (orderError) safeDatabaseError(orderError, "JABIYEN_ORDER_LOOKUP");
  if (!order || !["pending_confirmation", "confirmed"].includes(order.status)) {
    throw new PaymentServiceError("ORDER_NOT_PAYABLE", 404, "The order is not available for payment.");
  }

  const [{ data: checkout, error: checkoutError }, { data: payment, error: paymentError }, { data: items, error: itemsError }] = await Promise.all([
    jabiDb.from("checkout_sessions").select("id,idempotency_key,customer_email,currency,subtotal,delivery_fee,total_amount,delivery_fee_status,status").eq("id", order.checkout_id).maybeSingle(),
    jabiDb.from("order_payments").select("method,status,currency,amount_due").eq("order_id", order.id).maybeSingle(),
    jabiDb.from("order_items").select("product_name,variant_name,quantity,unit_price,line_total").eq("order_id", order.id).limit(20),
  ]);
  if (checkoutError) safeDatabaseError(checkoutError, "JABIYEN_CHECKOUT_LOOKUP");
  if (paymentError) safeDatabaseError(paymentError, "JABIYEN_PAYMENT_LOOKUP");
  if (itemsError) safeDatabaseError(itemsError, "JABIYEN_ITEMS_LOOKUP");
  if (!checkout || !payment || !Array.isArray(items) || items.length < 1
      || checkout.customer_email?.trim().toLowerCase() !== email
      || checkout.status !== "converted"
      || checkout.delivery_fee_status !== "confirmed"
      || payment.method !== "cod" || payment.status !== "awaiting_collection") {
    throw new PaymentServiceError("ORDER_NOT_PAYABLE", 404, "The order is not available for payment.");
  }

  const subtotalMinor = parseMinorUnits(checkout.subtotal);
  const deliveryMinor = parseMinorUnits(checkout.delivery_fee);
  const totalMinor = parseMinorUnits(checkout.total_amount);
  const paymentDueMinor = payment.amount_due == null ? totalMinor : parseMinorUnits(payment.amount_due);
  if (subtotalMinor == null || deliveryMinor == null || totalMinor == null || paymentDueMinor == null
      || subtotalMinor <= 0n || deliveryMinor < 0n || subtotalMinor + deliveryMinor !== totalMinor || paymentDueMinor !== totalMinor) {
    throw new PaymentServiceError("ORDER_TOTAL_UNCONFIRMED", 409, "The delivery fee or order total is not confirmed yet.");
  }

  let itemSubtotal = 0n;
  const itemNames: string[] = [];
  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitMinor = parseMinorUnits(item.unit_price);
    const lineMinor = parseMinorUnits(item.line_total);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || unitMinor == null || lineMinor == null
        || unitMinor * BigInt(quantity) !== lineMinor) {
      throw new PaymentServiceError("ORDER_TOTAL_UNCONFIRMED", 409, "The saved order items do not match the order total.");
    }
    itemSubtotal += lineMinor;
    if (itemNames.length < 5) {
      itemNames.push(`${String(item.product_name).slice(0, 80)}${item.variant_name ? ` (${String(item.variant_name).slice(0, 40)})` : ""} × ${quantity}`);
    }
  }
  if (itemSubtotal !== subtotalMinor) {
    throw new PaymentServiceError("ORDER_TOTAL_UNCONFIRMED", 409, "The saved order items do not match the order total.");
  }

  // JABIYEN's saved numeric totals are denominated in USD by business rule.
  // Do not apply a local-currency or exchange-rate conversion here.
  const usdMinorBigInt = totalMinor;
  if (usdMinorBigInt < 1n || usdMinorBigInt > 999_999_999_999n) {
    throw new PaymentServiceError("ORDER_TOTAL_UNCONFIRMED", 409, "The saved USD order total is outside the supported range.");
  }
  const usdMinor = Number(usdMinorBigInt);
  const description = `JABIYEN saved item and delivery totals are treated as USD with no currency conversion; ${itemNames.join(", ")}`.slice(0, 500);

  const paymentRequest = await createPaymentRequest({
    project_key: "jabiyen",
    external_order_reference: order.order_number,
    idempotency_key: checkout.idempotency_key,
    amount_minor: usdMinor,
    currency: "usd",
    line_items: [{ name: `JABIYEN order ${order.order_number}`, description, quantity: 1, unit_amount_minor: usdMinor }],
  }, input.identity);

  const session = await createCheckoutSession({
    paymentRequestId: paymentRequest.id,
    idempotencyKey: checkout.idempotency_key,
    origin: input.origin,
    identity: input.identity,
  });
  return { ...session, order_number: order.order_number, amount_minor: usdMinor, currency: "usd" };
}

export async function getPaymentRequestStatus(paymentRequestId: string, identity: CentralIdentity) {
  const db = createPrivilegedClient();
  const { data: paymentRequest, error } = await db.from("payment_requests")
    .select("id,project_id,external_order_reference,amount_minor,currency,status,fulfillment_status,fulfilled_at,created_at,expires_at")
    .eq("id", paymentRequestId)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  if (error) safeDatabaseError(error, "STATUS_LOOKUP");
  if (!paymentRequest) throw new PaymentServiceError("PAYMENT_REQUEST_NOT_FOUND", 404, "The payment request was not found.");
  const { data: attempts, error: attemptsError } = await db.from("payment_attempts")
    .select("status,created_at,paid_at")
    .eq("payment_request_id", paymentRequest.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (attemptsError) safeDatabaseError(attemptsError, "STATUS_ATTEMPT_LOOKUP");
  return { ...paymentRequest, latest_attempt: attempts?.[0] ?? null };
}

async function loadCentralJabiyenPayment(paymentRequestId: string) {
  const db = createPrivilegedClient();
  const { data: request, error: requestError } = await db.from("payment_requests")
    .select("id,project_id,user_id,external_order_reference,amount_minor,currency,status,fulfillment_status")
    .eq("id", paymentRequestId)
    .maybeSingle();
  if (requestError) safeDatabaseError(requestError, "FULFILLMENT_REQUEST_LOOKUP");
  if (!request || !request.user_id) throw new PaymentServiceError("PAYMENT_REQUEST_NOT_FOUND", 404, "The payment request was not found.");
  if (request.currency !== "usd" || !Number.isSafeInteger(Number(request.amount_minor)) || Number(request.amount_minor) <= 0) {
    throw new PaymentServiceError("PAYMENT_AMOUNT_INVALID", 409, "The verified payment amount is invalid.");
  }
  const { data: project, error: projectError } = await db.from("platform_projects")
    .select("project_key")
    .eq("id", request.project_id)
    .maybeSingle();
  if (projectError) safeDatabaseError(projectError, "FULFILLMENT_PROJECT_LOOKUP");
  if (project?.project_key !== "jabiyen") throw new PaymentServiceError("PAYMENT_SITE_NOT_SUPPORTED", 404, "This payment return is not available.");
  return { db, request };
}

async function confirmJabiyenOrderFromCentralWebhook(paymentRequestId: string) {
  const { db, request } = await loadCentralJabiyenPayment(paymentRequestId);
  if (request.status !== "paid") throw new PaymentServiceError("PAYMENT_NOT_CONFIRMED", 409, "The central payment has not been confirmed.");
  if (request.fulfillment_status === "fulfilled") return { fulfilled: true, alreadyFulfilled: true };

  const { data: customer, error: customerError } = await db.from("payment_customers")
    .select("email_snapshot")
    .eq("user_id", request.user_id)
    .maybeSingle();
  if (customerError) safeDatabaseError(customerError, "FULFILLMENT_CUSTOMER_LOOKUP");
  const expectedEmail = customer?.email_snapshot?.trim().toLowerCase();
  if (!expectedEmail) throw new PaymentServiceError("ORDER_FULFILLMENT_FAILED", 503, "The order could not be updated yet.");

  const jabiDb = getJabiyenAdminDatabase();
  const { data: confirmation, error: confirmationError } = await jabiDb.rpc("confirm_jabiyen_stripe_order_from_central", {
    p_order_number: request.external_order_reference,
    p_expected_email: expectedEmail,
    p_payment_request_id: request.id,
    p_expected_amount_minor: Number(request.amount_minor),
  });
  if (confirmationError) {
    console.error("[CENTRAL_PAYMENT_JABIYEN_FULFILLMENT_RPC]", confirmationError.code || "RPC_ERROR");
    throw new PaymentServiceError("ORDER_FULFILLMENT_FAILED", 503, "The order could not be updated yet.");
  }
  if (!confirmation?.ok) {
    console.error("[CENTRAL_PAYMENT_JABIYEN_FULFILLMENT_REJECTED]", confirmation?.code || "ORDER_REJECTED");
    throw new PaymentServiceError("ORDER_FULFILLMENT_FAILED", 503, "The order could not be updated yet.");
  }

  const fulfilledAt = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from("payment_requests")
    .update({ fulfillment_status: "fulfilled", fulfilled_at: fulfilledAt })
    .eq("id", request.id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (updateError) safeDatabaseError(updateError, "FULFILLMENT_MARK_COMPLETE");
  if (!updated && request.fulfillment_status !== "fulfilled") {
    const { data: fresh, error: reloadError } = await db.from("payment_requests")
      .select("fulfillment_status")
      .eq("id", request.id)
      .maybeSingle();
    if (reloadError) safeDatabaseError(reloadError, "FULFILLMENT_STATE_RELOAD");
    if (fresh?.fulfillment_status !== "fulfilled") throw new PaymentServiceError("ORDER_FULFILLMENT_FAILED", 503, "The order could not be updated yet.");
  }
  return { fulfilled: true, alreadyFulfilled: false };
}

export async function createPaymentReturnHandoff(paymentRequestId: string, identity: CentralIdentity) {
  const db = createPrivilegedClient();
  const { data: request, error: requestError } = await db.from("payment_requests")
    .select("id,project_id,user_id,external_order_reference,amount_minor,currency,status,fulfillment_status")
    .eq("id", paymentRequestId)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  if (requestError) safeDatabaseError(requestError, "HANDOFF_REQUEST_LOOKUP");
  if (!request) throw new PaymentServiceError("PAYMENT_REQUEST_NOT_FOUND", 404, "The payment request was not found.");
  if (request.status !== "paid" || request.fulfillment_status !== "fulfilled") {
    throw new PaymentServiceError("PAYMENT_NOT_READY", 409, "The order is not ready for confirmation yet.");
  }
  if (request.currency !== "usd" || !Number.isSafeInteger(Number(request.amount_minor)) || Number(request.amount_minor) <= 0) {
    throw new PaymentServiceError("PAYMENT_AMOUNT_INVALID", 409, "The verified payment amount is invalid.");
  }

  const [{ data: project, error: projectError }, { data: site, error: siteError }, { data: attempts, error: attemptsError }, { data: customer, error: customerError }] = await Promise.all([
    db.from("platform_projects").select("project_key,allowed_origins,status").eq("id", request.project_id).maybeSingle(),
    db.from("payment_site_settings").select("enabled,order_return_origin,order_return_path").eq("project_id", request.project_id).maybeSingle(),
    db.from("payment_attempts").select("status,stripe_checkout_session_id").eq("payment_request_id", request.id).order("created_at", { ascending: false }).limit(1),
    db.from("payment_customers").select("email_snapshot").eq("user_id", identity.user.id).maybeSingle(),
  ]);
  if (projectError) safeDatabaseError(projectError, "HANDOFF_PROJECT_LOOKUP");
  if (siteError) safeDatabaseError(siteError, "HANDOFF_SITE_LOOKUP");
  if (attemptsError) safeDatabaseError(attemptsError, "HANDOFF_ATTEMPT_LOOKUP");
  if (customerError) safeDatabaseError(customerError, "HANDOFF_CUSTOMER_LOOKUP");
  const allowedOrigins = Array.isArray(project?.allowed_origins) ? project.allowed_origins : [];
  if (project?.project_key !== "jabiyen" || project.status !== "active" || !site?.enabled || !site.order_return_origin
      || !site.order_return_path || !allowedOrigins.includes(site.order_return_origin)
      || attempts?.[0]?.status !== "paid" || !attempts[0].stripe_checkout_session_id
      || !customer?.email_snapshot || customer.email_snapshot.toLowerCase() !== identity.user.email?.toLowerCase()) {
    throw new PaymentServiceError("PAYMENT_RETURN_NOT_CONFIGURED", 503, "The order return is not configured safely.");
  }

  const { token, tokenHash } = createPaymentReturnToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const { error: invalidateError } = await db.from("payment_return_handoffs")
    .delete()
    .eq("payment_request_id", request.id)
    .is("redeemed_at", null);
  if (invalidateError) safeDatabaseError(invalidateError, "HANDOFF_INVALIDATE_PREVIOUS");
  const { error: insertError } = await db.from("payment_return_handoffs").insert({
    token_hash: tokenHash,
    payment_request_id: request.id,
    project_id: request.project_id,
    user_id: identity.user.id,
    external_order_reference: request.external_order_reference,
    expires_at: expiresAt,
  });
  if (insertError) safeDatabaseError(insertError, "HANDOFF_CREATE");

  try {
    return {
      return_url: buildPaymentReturnUrl({
        origin: site.order_return_origin,
        pathTemplate: site.order_return_path,
        orderNumber: request.external_order_reference,
        token,
      }),
      expires_at: expiresAt,
    };
  } catch {
    await db.from("payment_return_handoffs").delete().eq("token_hash", tokenHash);
    throw new PaymentServiceError("PAYMENT_RETURN_URL_INVALID", 503, "The order return is not configured safely.");
  }
}

export async function redeemPaymentReturnHandoff(token: string) {
  const tokenHash = hashPaymentReturnToken(token);
  if (!tokenHash) throw new PaymentServiceError("PAYMENT_HANDOFF_INVALID", 404, "This order return link has expired or was already used.");
  const db = createPrivilegedClient();
  const now = new Date().toISOString();
  const { data: handoff, error: handoffError } = await db.from("payment_return_handoffs")
    .select("payment_request_id,project_id,user_id,external_order_reference")
    .eq("token_hash", tokenHash)
    .is("redeemed_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (handoffError) safeDatabaseError(handoffError, "HANDOFF_LOOKUP");
  if (!handoff) throw new PaymentServiceError("PAYMENT_HANDOFF_INVALID", 404, "This order return link has expired or was already used.");

  const [{ data: request, error: requestError }, { data: project, error: projectError }, { data: customer, error: customerError }] = await Promise.all([
    db.from("payment_requests").select("id,project_id,user_id,external_order_reference,amount_minor,currency,status,fulfillment_status").eq("id", handoff.payment_request_id).maybeSingle(),
    db.from("platform_projects").select("project_key,status").eq("id", handoff.project_id).maybeSingle(),
    db.from("payment_customers").select("email_snapshot").eq("user_id", handoff.user_id).maybeSingle(),
  ]);
  if (requestError) safeDatabaseError(requestError, "HANDOFF_PAYMENT_LOOKUP");
  if (projectError) safeDatabaseError(projectError, "HANDOFF_PROJECT_LOOKUP");
  if (customerError) safeDatabaseError(customerError, "HANDOFF_CUSTOMER_LOOKUP");
  if (!request || request.project_id !== handoff.project_id || request.user_id !== handoff.user_id
      || request.external_order_reference !== handoff.external_order_reference || request.status !== "paid"
      || request.fulfillment_status !== "fulfilled" || request.currency !== "usd"
      || project?.project_key !== "jabiyen" || project.status !== "active" || !customer?.email_snapshot) {
    throw new PaymentServiceError("PAYMENT_HANDOFF_INVALID", 404, "This order return link has expired or was already used.");
  }

  const jabiDb = getJabiyenAdminDatabase();
  const { data: orderCredential, error: orderCredentialError } = await jabiDb.from("orders")
    .select("order_number,access_token_hash")
    .eq("order_number", handoff.external_order_reference)
    .maybeSingle();
  if (orderCredentialError) safeDatabaseError(orderCredentialError, "HANDOFF_ORDER_LOOKUP");
  if (!orderCredential || typeof orderCredential.access_token_hash !== "string") {
    throw new PaymentServiceError("ORDER_FULFILLMENT_UNAVAILABLE", 503, "The confirmed order could not be loaded yet.");
  }
  const { data: order, error: orderError } = await jabiDb.rpc("get_jabiyen_public_order", {
    p_order_number: handoff.external_order_reference,
    p_access_token_hash: orderCredential.access_token_hash,
  });
  if (orderError) safeDatabaseError(orderError, "HANDOFF_ORDER_DETAILS");
  if (!order || order.order_number !== handoff.external_order_reference || order.status !== "confirmed"
      || order.payment?.method !== "stripe" || order.payment?.status !== "collected"
      || order.currency !== "USD" || order.payment?.currency !== "USD"
      || usdMajorToMinorUnits(order.total_amount) !== BigInt(Number(request.amount_minor))
      || String(order.customer?.email ?? "").trim().toLowerCase() !== customer.email_snapshot.trim().toLowerCase()) {
    throw new PaymentServiceError("ORDER_FULFILLMENT_UNAVAILABLE", 503, "The confirmed order could not be loaded yet.");
  }

  // Consume only after all central and site-order checks succeed. A transient
  // JABIYEN database failure therefore leaves the unexpired capability usable.
  const redeemedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await db.from("payment_return_handoffs")
    .update({ redeemed_at: redeemedAt })
    .eq("token_hash", tokenHash)
    .is("redeemed_at", null)
    .gt("expires_at", redeemedAt)
    .select("token_hash")
    .maybeSingle();
  if (consumeError) safeDatabaseError(consumeError, "HANDOFF_REDEEM");
  if (!consumed) throw new PaymentServiceError("PAYMENT_HANDOFF_INVALID", 404, "This order return link has expired or was already used.");
  return { order };
}

function stripeWebhookSettingsError() {
  return new PaymentServiceError("WEBHOOK_NOT_CONFIGURED", 503, "The payment webhook is not configured.");
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | null) {
  if (!signature) throw new PaymentServiceError("WEBHOOK_SIGNATURE_REQUIRED", 400, "The Stripe signature is required.");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key || !(key.startsWith("sk_test_") || key.startsWith("sk_live_"))) throw stripeWebhookSettingsError();

  const db = createPrivilegedClient();
  const { data: provider, error: configError } = await db.from("payment_provider_settings")
    .select("enabled,mode").eq("provider", "stripe").maybeSingle();
  if (configError) safeDatabaseError(configError, "WEBHOOK_CONFIG");
  if (!provider?.enabled) throw new PaymentServiceError("PAYMENTS_NOT_ENABLED", 503, "Payments are not enabled.");
  const keyMode = key.startsWith("sk_live_") ? "live" : "test";
  if (provider.mode !== keyMode || (keyMode === "live" && process.env.STRIPE_LIVE_CHARGES_ENABLED !== "true")) {
    throw stripeWebhookSettingsError();
  }

  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new PaymentServiceError("INVALID_WEBHOOK_SIGNATURE", 400, "The Stripe webhook signature is invalid.");
  }
  if (event.livemode !== (provider.mode === "live")) {
    throw new PaymentServiceError("WEBHOOK_MODE_MISMATCH", 400, "The Stripe webhook mode does not match the configured payment mode.");
  }

  const object = event.data.object as { id?: string };
  const { data: claim, error: claimError } = await db.rpc("claim_payment_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_object_id: object.id ?? null,
  });
  if (claimError) safeDatabaseError(claimError, "WEBHOOK_CLAIM");
  const claimStatus = typeof claim === "string" ? claim : Array.isArray(claim) ? claim[0] : claim?.claim_payment_webhook_event;
  if (claimStatus === "processed") return { received: true, duplicate: true };
  if (claimStatus !== "claimed") throw new PaymentServiceError("WEBHOOK_EVENT_BUSY", 503, "The webhook event is already being processed.");

  try {
    const checkoutTypes = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ]);
    if (checkoutTypes.has(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      const { data: attempt, error: attemptError } = await db.from("payment_attempts")
        .select("id,payment_request_id,amount_minor,currency,status,stripe_checkout_session_id")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();
      if (attemptError) safeDatabaseError(attemptError, "WEBHOOK_ATTEMPT_LOOKUP");

      if (!attempt && (session.client_reference_id || session.metadata?.payment_request_id)) {
        // Stripe can deliver the event before createCheckoutSession persists the
        // session ID. Fail retryably so Stripe redelivers after that write lands.
        throw new PaymentServiceError("WEBHOOK_ATTEMPT_NOT_FOUND", 503, "The Stripe session is not linked to a central payment attempt yet.");
      }

      if (attempt) {
        const { data: paymentRequest, error: requestError } = await db.from("payment_requests")
          .select("id,project_id,user_id,external_order_reference,amount_minor,currency,status,fulfillment_status")
          .eq("id", attempt.payment_request_id)
          .maybeSingle();
        if (requestError) safeDatabaseError(requestError, "WEBHOOK_REQUEST_LOOKUP");
        if (!paymentRequest || !paymentRequest.user_id) {
          throw new PaymentServiceError("WEBHOOK_PAYMENT_BINDING_INVALID", 503, "The Stripe payment could not be matched to a central payment request.");
        }
        const { data: project, error: projectError } = await db.from("platform_projects")
          .select("project_key")
          .eq("id", paymentRequest.project_id)
          .maybeSingle();
        if (projectError) safeDatabaseError(projectError, "WEBHOOK_PROJECT_LOOKUP");
        if (!project) {
          throw new PaymentServiceError("WEBHOOK_PAYMENT_BINDING_INVALID", 503, "The Stripe payment could not be matched to a central payment request.");
        }
        if (Number(paymentRequest.amount_minor) !== Number(attempt.amount_minor)
            || paymentRequest.currency !== attempt.currency
            || !checkoutSessionMatchesAttempt(session, {
              paymentRequestId: paymentRequest.id,
              amountMinor: Number(paymentRequest.amount_minor),
              currency: paymentRequest.currency,
              projectKey: project.project_key,
              userId: paymentRequest.user_id,
            })) {
          console.error("[CENTRAL_PAYMENT_WEBHOOK_PROOF_MISMATCH]", { eventId: event.id, sessionId: session.id });
          throw new PaymentServiceError("WEBHOOK_PAYMENT_PROOF_MISMATCH", 503, "The Stripe session did not match its immutable payment request.");
        }

        const status = verifiedCheckoutEventStatus(event.type, session);
        if (!status) throw new PaymentServiceError("WEBHOOK_SESSION_STATE_INVALID", 503, "The Stripe Checkout session state is invalid.");

        if (attempt.status !== "paid" && attempt.status !== "refunded") {
          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
          const { error: updateAttemptError } = await db.from("payment_attempts").update({
            status,
            stripe_payment_intent_id: paymentIntentId,
            ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
          }).eq("id", attempt.id);
          if (updateAttemptError) safeDatabaseError(updateAttemptError, "WEBHOOK_ATTEMPT_UPDATE");
        }
        if (status === "paid" && attempt.status !== "refunded") {
          if (paymentRequest.status !== "pending" && paymentRequest.status !== "paid") {
            throw new PaymentServiceError("PAYMENT_REQUEST_NOT_PAYABLE", 409, "The central payment request is no longer payable.");
          }
          if (paymentRequest.status !== "paid") {
            const { error: updateRequestError } = await db.from("payment_requests").update({
              status: "paid",
              paid_at: new Date().toISOString(),
              ...(project.project_key === "jabiyen" ? { fulfillment_status: "pending", fulfilled_at: null } : { fulfillment_status: "not_required", fulfilled_at: null }),
            }).eq("id", attempt.payment_request_id).eq("status", "pending");
            if (updateRequestError) safeDatabaseError(updateRequestError, "WEBHOOK_REQUEST_UPDATE");
          }
          if (project.project_key === "jabiyen") {
            await confirmJabiyenOrderFromCentralWebhook(attempt.payment_request_id);
            // Sending only after order fulfillment prevents an email from claiming
            // success while the customer-visible order remains unpaid or pending.
            await sendPaidJabiyenStripeOrderConfirmationEmailOnce(attempt.payment_request_id);
          }
        }
      }
    }

    const { error: completeError } = await db.from("payment_webhook_events").update({
      status: "processed",
      lease_expires_at: null,
      processed_at: new Date().toISOString(),
      last_error_code: null,
    }).eq("event_id", event.id);
    if (completeError) safeDatabaseError(completeError, "WEBHOOK_COMPLETE");
    return { received: true, processed: true };
  } catch (error) {
    const lastErrorCode = error instanceof PaymentServiceError ? error.code : "PROCESSING_FAILED";
    await db.from("payment_webhook_events").update({ status: "failed", lease_expires_at: null, last_error_code: lastErrorCode }).eq("event_id", event.id);
    throw error instanceof PaymentServiceError ? error : new PaymentServiceError("WEBHOOK_PROCESSING_FAILED", 503, "The Stripe event could not be processed.");
  }
}
