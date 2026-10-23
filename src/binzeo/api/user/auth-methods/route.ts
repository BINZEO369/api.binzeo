import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/binzeo/auth/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_auth_methods")
      .select(
        "id, provider, auth_method, provider_email, first_seen_at, signup_at, last_sign_in_at, login_count, last_event, metadata, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 400, "AUTH_METHODS_FETCH_FAILED");
    return ok({ auth_methods: data ?? [] });
  } catch (err) {
    console.error("[AUTH_METHODS_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
