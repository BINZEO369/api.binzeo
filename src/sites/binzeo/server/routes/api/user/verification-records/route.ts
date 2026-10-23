import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_verification_records")
      .select(
        "id, verification_type, verification_status, source_of_truth, verified_at, last_requested_at, expires_at, attempt_count, metadata, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 400, "VERIFICATION_FETCH_FAILED");
    return ok({ verifications: data ?? [] });
  } catch (err) {
    console.error("[VERIFICATION_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
