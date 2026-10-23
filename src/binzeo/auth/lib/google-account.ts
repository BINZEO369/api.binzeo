import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { sendWelcomeEmailOnce, getWelcomeSiteUrl } from "@/binzeo/auth/lib/email/welcome";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";

export type GoogleIdentity = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
};

export async function completeGoogleAccount(user: GoogleIdentity, req: NextRequest) {
  if (!user.email || !user.email_confirmed_at) throw new Error("Verified Google email is required");

  const admin = getSupabaseAdmin();
  const metadata = user.user_metadata ?? {};
  const givenName = String(metadata.given_name ?? "").trim();
  const familyName = String(metadata.family_name ?? "").trim();
  const emailName = user.email.split("@")[0] ?? "Google user";
  const googleName = String(metadata.name ?? `${givenName} ${familyName}`).trim();
  const displayName = googleName || emailName || "Google user";
  const googlePhoto = String(metadata.picture ?? "").trim() || null;

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id, first_name, last_name, display_name, profile_photo_url, account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  const wasIncomplete = existing?.account_status !== "active";
  const firstName = String(existing?.first_name ?? givenName).trim() || null;
  const lastName = String(existing?.last_name ?? familyName).trim() || null;
  const { data: savedProfile, error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      display_name: existing?.display_name || displayName,
      profile_photo_url: existing?.profile_photo_url || googlePhoto,
      account_status: "active",
      status_reason: "google_oauth_verified",
      terms_accepted: true,
      terms_version: "2026-10-02",
      privacy_accepted: true,
      privacy_version: "2026-10-02",
      consent_date: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("id, binzeo_user_id")
    .maybeSingle();
  if (profileError || !savedProfile) throw profileError ?? new Error("Google profile could not be created");

  const completedAt = new Date().toISOString();
  const { data: updatedAuth, error: authError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...metadata,
      auth_provider: "google",
      signup_flow: "google_complete",
      google_signup_completed_at: completedAt,
    },
  });
  if (authError || !updatedAuth.user) throw authError ?? new Error("Google account metadata could not be updated");

  const { error: verificationError } = await admin.from("user_verification_records").upsert({
    user_id: user.id,
    verification_type: "email",
    verification_status: "verified",
    source_of_truth: "google_oauth",
    verified_at: completedAt,
    expires_at: null,
    attempt_count: 0,
    updated_at: completedAt,
  }, { onConflict: "user_id,verification_type" });
  if (verificationError) throw verificationError;

  if (wasIncomplete) {
    try {
      await sendWelcomeEmailOnce({
        userId: user.id,
        email: user.email,
        siteUrl: getWelcomeSiteUrl(req.headers),
        context: {
          name: displayName,
          time: new Date().toUTCString(),
          browser: req.headers.get("user-agent"),
        },
      });
    } catch (welcomeError) {
      console.error("[GOOGLE_WELCOME_EMAIL_ERROR]", welcomeError);
    }
  }

  await logUserActivity(admin, req, {
    userId: user.id,
    activityType: wasIncomplete ? "account_created" : "google_login_success",
    description: wasIncomplete
      ? "BINZEO account created and verified with Google OAuth."
      : "Signed in successfully with Google OAuth.",
    metadata: { signup_method: "google", binzeo_user_id: savedProfile.binzeo_user_id ?? null },
  });

  return { profile: savedProfile, wasIncomplete };
}
