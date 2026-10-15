import { createClient } from "@/modules/identity/lib/supabase/server";
import { fail, ok } from "@/modules/identity/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("login_limit_exceeded")
      .select(
        "id, account_email, user_id, request_ip, window_date, account_attempts, ip_attempts, daily_limit, blocked_count, first_blocked_at, last_blocked_at",
      )
      .order("last_blocked_at", { ascending: false })
      .limit(100);

    if (error) return fail("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
    return ok({ records: data ?? [] });
  } catch (error) {
    console.error("[ADMIN_LOGIN_LIMITS_GET_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
