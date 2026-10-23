import { apiError, apiSuccess } from "@/platform/http/response";
import { getRequestId } from "@/platform/http/request-id";
import { authenticateBearerToken } from "@/platform/auth/identity";
import { consumeRateLimit } from "@/platform/security/rate-limit";


export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const result = await authenticateBearerToken(request);
  if (!result.ok) return apiError(requestId, result.code, result.message, result.status);

  const limit = await consumeRateLimit(result.identity.supabase, request, "v1-me", 120);
  if (!limit.allowed) {
    if ("unavailable" in limit) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many requests. Try again later.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  return apiSuccess({
    user: {
      id: result.identity.user.id,
      email: result.identity.user.email ?? null,
      phone: result.identity.user.phone ?? null,
      created_at: result.identity.user.created_at,
      email_verified: Boolean(result.identity.user.email_confirmed_at),
    },
    profile: result.identity.profile,
  }, requestId);
}
