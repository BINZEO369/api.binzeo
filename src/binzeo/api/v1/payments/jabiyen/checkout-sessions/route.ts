import { z } from "zod";
import { authenticatePaymentRequest } from "@/binzeo/auth/identity";
import { createJabiyenOrderCheckoutSession, PaymentServiceError } from "@/binzeo/payments/service";
import { apiError, apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";
import { consumeRateLimit } from "@/common/security/rate-limit";

const bodySchema = z.object({
  order_number: z.string().trim().min(1).max(80),
}).strict();

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const auth = await authenticatePaymentRequest(request);
  if (!auth.ok) return apiError(requestId, auth.code, auth.message, auth.status);

  const rateLimit = await consumeRateLimit(auth.identity.supabase, request, "v1-jabiyen-payment-checkout", 8);
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many checkout requests. Try again later.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(requestId, "INVALID_JSON", "The request body must be valid JSON.", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(requestId, "INVALID_REQUEST", "A valid JABIYEN order number is required.", 400);

  try {
    const data = await createJabiyenOrderCheckoutSession({
      orderNumber: parsed.data.order_number,
      origin: request.headers.get("origin"),
      identity: auth.identity,
    });
    return apiSuccess(data, requestId, 200);
  } catch (error) {
    if (error instanceof PaymentServiceError) return apiError(requestId, error.code, error.message, error.status);
    console.error("[CENTRAL_JABIYEN_PAYMENT_ROUTE]", error instanceof Error ? error.name : "UNKNOWN");
    return apiError(requestId, "PAYMENT_SERVICE_UNAVAILABLE", "The payment service is temporarily unavailable.", 503);
  }
}
