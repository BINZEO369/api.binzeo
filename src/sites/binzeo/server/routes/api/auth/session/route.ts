import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return fail("Unauthorized", 401, "UNAUTHORIZED");
    }

    const { data: verification } = await supabase
      .from("user_verification_records")
      .select("verification_status")
      .eq("user_id", user.id)
      .eq("verification_type", "email")
      .maybeSingle();
    if (verification?.verification_status !== "verified") {
      return fail("Email verification required", 403, "EMAIL_VERIFICATION_REQUIRED");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        `
        binzeo_user_id,
        first_name,
        middle_name,
        last_name,
        display_name,
        username,
        profile_photo_url,
        country_code,
        preferred_language,
        timezone,
        account_status
        `
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.account_status !== "active") {
      await supabase.auth.signOut();
      return fail("Account is not active", 403, "ACCOUNT_BLOCKED");
    }

    return ok({
      user: {
        id: user.id,
        email: user.email,
        email_confirmed: !!user.email_confirmed_at,
        last_sign_in: user.last_sign_in_at,
        created_at: user.created_at,
      },
      profile: profile ?? null,
    });
  } catch (err) {
    console.error("[SESSION_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
