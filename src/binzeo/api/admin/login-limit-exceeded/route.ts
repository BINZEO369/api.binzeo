import { getAdminApiContext, hasAdminPermission } from "@/binzeo/admin/lib/admin";
import { fail, ok } from "@/binzeo/auth/lib/api/response";

export async function GET(request: Request) {
  try {
    const context = await getAdminApiContext(request);
    if (!context.user || !context.access) return fail("An active admin session is required", 401, "ADMIN_REQUIRED");
    if (!hasAdminPermission(context.access, "auth.read")) return fail("Authentication metadata permission required", 403, "AUTH_READ_REQUIRED");

    const { data, error } = await context.supabase
      .from("login_limit_exceeded")
      .select("id, account_email, user_id, request_ip, window_date, account_attempts, ip_attempts, daily_limit, blocked_count, first_blocked_at, last_blocked_at")
      .order("last_blocked_at", { ascending: false })
      .limit(100);

    if (error) return fail("Login protection records could not be loaded", 500, "LOGIN_LIMITS_FETCH_FAILED");
    return ok({ records: data ?? [] });
  } catch (error) {
    console.error("[ADMIN_LOGIN_LIMITS_GET_ERROR]", error instanceof Error ? error.name : "unknown");
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
