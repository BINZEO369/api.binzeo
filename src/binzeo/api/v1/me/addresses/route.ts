import { apiError, apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";
import { authenticateBearerToken } from "@/binzeo/auth/identity";
import { consumeRateLimit } from "@/common/security/rate-limit";


export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const result = await authenticateBearerToken(request);
  if (!result.ok) {
    return apiError(requestId, result.code, result.message, result.status);
  }

  const limit = await consumeRateLimit(result.identity.supabase, request, "v1-me-addresses", 60);
  if (!limit.allowed) {
    if ("unavailable" in limit) {
      return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    }
    return apiError(requestId, "RATE_LIMITED", "Too many requests. Try again later.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const { data, error } = await result.identity.supabase
    .from("user_addresses")
    .select("id,address_type,address_line_1,address_line_2,address_line_3,country_code,state_province,district,city,area,postal_code,is_primary,created_at,updated_at")
    .eq("user_id", result.identity.user.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[ME_ADDRESSES_GET_ERROR]", { code: error.code ?? "unknown" });
    return apiError(requestId, "ADDRESSES_FETCH_FAILED", "Account addresses are temporarily unavailable.", 503);
  }

  return apiSuccess({ addresses: data ?? [] }, requestId);
}
