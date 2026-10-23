import { handleStripeWebhook, PaymentServiceError } from "@/binzeo/payments/service";
import { apiError, apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";

const MAX_WEBHOOK_BYTES = 1_000_000;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return apiError(requestId, "WEBHOOK_TOO_LARGE", "The webhook payload is too large.", 413);
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return apiError(requestId, "INVALID_WEBHOOK_CONTENT_TYPE", "The webhook content type is invalid.", 400);
  }

  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    if (rawBody.byteLength > MAX_WEBHOOK_BYTES) return apiError(requestId, "WEBHOOK_TOO_LARGE", "The webhook payload is too large.", 413);
    const result = await handleStripeWebhook(rawBody, request.headers.get("stripe-signature"));
    return apiSuccess(result, requestId);
  } catch (error) {
    if (error instanceof PaymentServiceError) return apiError(requestId, error.code, error.message, error.status);
    console.error("[CENTRAL_STRIPE_WEBHOOK_ROUTE]", error instanceof Error ? error.name : "UNKNOWN");
    return apiError(requestId, "WEBHOOK_PROCESSING_FAILED", "The Stripe event could not be processed.", 503);
  }
}
