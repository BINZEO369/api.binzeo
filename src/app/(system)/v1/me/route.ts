import { apiError, apiSuccess } from "@/lib/http/response";
import { getRequestId } from "@/lib/http/request-id";
import { authenticateBearerToken } from "@/lib/auth/identity";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      email_verified: Boolean(result.identity.user.email_confirmed_at),
    },
    profile: result.identity.profile,
  }, requestId);
}
