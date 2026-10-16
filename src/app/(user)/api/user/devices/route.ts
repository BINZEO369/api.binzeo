import { createClient } from "@/user/auth/lib/supabase/server";
import { ok, fail } from "@/user/auth/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_devices")
      .select("id, device_id, device_name, device_type, operating_system, os_version, browser, browser_version, app_version, last_seen_at, is_trusted, created_at")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 400, "DEVICES_FETCH_FAILED");
    return ok({ devices: data ?? [] });
  } catch (err) {
    console.error("[DEVICES_GET_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
