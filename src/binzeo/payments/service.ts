import "server-only";
import Stripe from "stripe";
import { z } from "zod";
import type { CentralIdentity } from "@/binzeo/auth/identity";
import { createPrivilegedClient } from "@/common/database/supabase/clients";

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

  const { data, error } = await db.from("payment_requests").insert({
    project_id: project.id,
    user_id: identity.user.id,
    external_order_reference: order.external_order_reference,
    idempotency_key: order.idempotency_key,
    amount_minor: order.amount_minor,
    currency: order.currency,
    line_items: order.line_items,
    status: "pending",
  }).select("id,project_id,user_id,external_order_reference,amount_minor,currency,line_items,status,expires_at").single();

  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await db.from("payment_requests").select("id,project_id,user_id,external_order_reference,idempotency_key,amount_minor,currency,line_items,status,expires_at").eq("project_id", project.id).eq("external_order_reference", order.external_order_reference).maybeSingle();
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
  if (paymentRequest.currency !== site.currency) {
    throw new PaymentServiceError("CURRENCY_NOT_ALLOWED", 409, "The payment request currency does not match the site's configuration.");
  }
  if (provider.mode === "live" && (!provider.merchant_country || !provider.default_currency)) {
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

  const successUrl = safeRelativeUrl(site.success_path, origin);
  const successUrlValue = `${successUrl.toString()}${successUrl.search ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = safeRelativeUrl(site.cancel_path, origin, { payment: "cancelled", request_id: paymentRequest.id });
  const metadata = {
    payment_request_id: paymentRequest.id,
    project_key: project.project_key,
    user_id: input.identity.user.id,
  };

  try {
    const stripeCustomerId = await getOrCreateStripeCustomer(db, stripe, input.identity);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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

export async function getPaymentRequestStatus(paymentRequestId: string, identity: CentralIdentity) {
  const db = createPrivilegedClient();
  const { data: paymentRequest, error } = await db.from("payment_requests")
    .select("id,project_id,external_order_reference,amount_minor,currency,status,created_at,expires_at")
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
        .select("id,payment_request_id,amount_minor,currency,status")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();
      if (attemptError) safeDatabaseError(attemptError, "WEBHOOK_ATTEMPT_LOOKUP");

      if (attempt) {
        if (session.amount_total !== Number(attempt.amount_minor) || session.currency !== attempt.currency) {
          console.error("[CENTRAL_PAYMENT_WEBHOOK_TOTAL_MISMATCH]", { eventId: event.id, sessionId: session.id });
          await db.from("payment_webhook_events").update({ status: "processed", lease_expires_at: null, processed_at: new Date().toISOString(), last_error_code: "CHECKOUT_TOTAL_MISMATCH" }).eq("event_id", event.id);
          return { received: true, processed: true };
        }

        let status: "paid" | "processing" | "failed" | "expired";
        if (event.type === "checkout.session.expired") status = "expired";
        else if (event.type === "checkout.session.async_payment_failed") status = "failed";
        else if (event.type === "checkout.session.async_payment_succeeded" || session.payment_status === "paid") status = "paid";
        else status = "processing";

        if (attempt.status !== "paid" && attempt.status !== "refunded") {
          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
          const { error: updateAttemptError } = await db.from("payment_attempts").update({
            status,
            stripe_payment_intent_id: paymentIntentId,
            ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
          }).eq("id", attempt.id);
          if (updateAttemptError) safeDatabaseError(updateAttemptError, "WEBHOOK_ATTEMPT_UPDATE");
          if (status === "paid") {
            const { error: updateRequestError } = await db.from("payment_requests").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", attempt.payment_request_id);
            if (updateRequestError) safeDatabaseError(updateRequestError, "WEBHOOK_REQUEST_UPDATE");
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
    await db.from("payment_webhook_events").update({ status: "failed", lease_expires_at: null, last_error_code: "PROCESSING_FAILED" }).eq("event_id", event.id);
    throw error instanceof PaymentServiceError ? error : new PaymentServiceError("WEBHOOK_PROCESSING_FAILED", 503, "The Stripe event could not be processed.");
  }
}
