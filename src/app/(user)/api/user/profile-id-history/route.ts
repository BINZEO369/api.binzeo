import { createClient } from "@/user/auth/lib/supabase/server";
import { ok, fail } from "@/user/auth/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("profile_id_history")
      .select("id, previous_binzeo_user_id, new_binzeo_user_id, change_reason, changed_at")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false });

    if (error) return fail(error.message, 400, "PROFILE_ID_HISTORY_FETCH_FAILED");
    return ok({ history: data ?? [] });
  } catch (err) {
    console.error("[PROFILE_ID_HISTORY_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
