import { z } from "zod";
import { authenticateBearerToken } from "@/binzeo/auth/identity";
import { getPaymentRequestStatus, PaymentServiceError } from "@/binzeo/payments/service";
import { apiError, apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";
import { consumeRateLimit } from "@/common/security/rate-limit";

const idSchema = z.string().uuid();

export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const requestId = getRequestId(request);
  const auth = await authenticateBearerToken(request);
  if (!auth.ok) return apiError(requestId, auth.code, auth.message, auth.status);

  const rateLimit = await consumeRateLimit(auth.identity.supabase, request, "v1-payment-status", 60);
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many payment status requests. Try again later.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }

  const params = await context.params;
  const parsedId = idSchema.safeParse(params.requestId);
  if (!parsedId.success) return apiError(requestId, "PAYMENT_REQUEST_NOT_FOUND", "The payment request was not found.", 404);
  try {
    const data = await getPaymentRequestStatus(parsedId.data, auth.identity);
    return apiSuccess(data, requestId);
  } catch (error) {
    if (error instanceof PaymentServiceError) return apiError(requestId, error.code, error.message, error.status);
    console.error("[CENTRAL_PAYMENT_STATUS_ROUTE]", error instanceof Error ? error.name : "UNKNOWN");
    return apiError(requestId, "PAYMENT_SERVICE_UNAVAILABLE", "The payment service is temporarily unavailable.", 503);
  }
}
