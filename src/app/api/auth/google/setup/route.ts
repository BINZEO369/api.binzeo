import { NextResponse } from "next/server";
import { createClient } from "@/user/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/user/auth/lib/supabase/admin";
import { fail } from "@/user/auth/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return fail("Please continue with Google first", 401, "UNAUTHORIZED");

    const metadata = user.user_metadata ?? {};
    const isGoogleUser = metadata.auth_provider === "google" || Boolean(metadata.google_sub);
    if (!isGoogleUser) return fail("Google signup session required", 403, "GOOGLE_SIGNUP_REQUIRED");

    const { data: profile, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .select("first_name, last_name, username, date_of_birth, account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email ?? null },
        profile: profile ?? null,
        google_profile: {
          first_name: String(metadata.given_name ?? "").trim(),
          last_name: String(metadata.family_name ?? "").trim(),
        },
        google_verified: user.email_confirmed_at != null,
      },
    });
  } catch (err) {
    console.error("[GOOGLE_SETUP_ERROR]", err);
    return fail("Unable to load Google account setup", 500, "GOOGLE_SETUP_FAILED");
  }
}
