import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const { data, error, count } = await supabase
      .from("user_login_history")
      .select("*, user_devices(device_name, device_type, operating_system, os_version, browser, browser_version)", { count: "exact" })
      .eq("user_id", user.id)
      .order("login_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return fail(error.message, 400, "LOGIN_HISTORY_FETCH_FAILED");
    return ok({
      history: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[LOGIN_HISTORY_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
