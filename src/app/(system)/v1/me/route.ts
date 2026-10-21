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

  const [{ data: profile }, { data: addresses }] = await Promise.all([
    result.identity.supabase
      .from("profiles")
      .select("id,binzeo_user_id,first_name,middle_name,last_name,display_name,username,date_of_birth,gender,profile_photo_url,country_code,preferred_language,timezone,account_status,created_at,updated_at")
      .eq("id", result.identity.user.id)
      .maybeSingle(),
    result.identity.supabase
      .from("user_addresses")
      .select("id,address_type,address_line_1,address_line_2,address_line_3,country_code,state_province,district,city,area,postal_code,latitude,longitude,is_primary,created_at,updated_at,location_accuracy_meters,location_source")
      .eq("user_id", result.identity.user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return apiSuccess({
    user: {
      id: result.identity.user.id,
      email: result.identity.user.email ?? null,
      phone: result.identity.user.phone ?? null,
      email_verified: Boolean(result.identity.user.email_confirmed_at),
    },
    profile: profile ?? result.identity.profile,
    address: addresses?.[0] ?? null,
  }, requestId);
}
