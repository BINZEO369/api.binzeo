import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/binzeo/auth/lib/api/response";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { getPublicSiteUrl } from "@/binzeo/auth/lib/email/transporter";
import { sendPasswordChangedEmailOnce } from "@/binzeo/auth/lib/password-security/service";
import { PASSWORD_OTP_EXPIRY_SECONDS } from "@/binzeo/auth/lib/password-security/config";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";
import { resolveRequestLocation } from "@/binzeo/auth/lib/request-location";

const schema = z.object({
  challenge_id: z.string().uuid(),
  new_password: z.string().min(8).max(72),
  confirm_password: z.string().min(8).max(72),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid password request", 422, "VALIDATION_ERROR");
    if (parsed.data.new_password !== parsed.data.confirm_password) return fail("Passwords do not match.", 422, "PASSWORD_MISMATCH");

    const sessionClient = await createClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user?.email) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const admin = getSupabaseAdmin();
    const { data: challenge, error: challengeError } = await admin
      .from("password_reset_challenges")
      .select("id, user_id, email, purpose, verified_at, password_changed_at, expires_at")
      .eq("id", parsed.data.challenge_id)
      .maybeSingle();
    if (challengeError) {
      console.error("[PASSWORD_CHANGE_CHALLENGE_LOOKUP_ERROR]", challengeError);
      return fail("Unable to verify the password change session.", 500, "CHALLENGE_LOOKUP_FAILED");
    }
    if (!challenge || challenge.user_id !== user.id || challenge.purpose !== "change") return fail("Invalid password verification session.", 403, "INVALID_CHALLENGE");
    if (!challenge.verified_at) return fail("Verify the email code before choosing a new password.", 400, "OTP_NOT_VERIFIED");
    if (challenge.password_changed_at) return fail("This password verification session has already been used.", 409, "CHALLENGE_ALREADY_USED");

    const verifiedAt = new Date(challenge.verified_at).getTime();
    if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt > PASSWORD_OTP_EXPIRY_SECONDS * 1000) {
      return fail("Your verified code has expired. Request a new code.", 400, "VERIFICATION_EXPIRED");
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: parsed.data.new_password });
    if (updateError) {
      console.error("[PASSWORD_CHANGE_UPDATE_ERROR]", updateError);
      return fail("Unable to update password. Please try again.", 500, "PASSWORD_UPDATE_FAILED");
    }

    const { error: markError } = await admin
      .from("password_reset_challenges")
      .update({ password_changed_at: new Date().toISOString() })
      .eq("id", parsed.data.challenge_id)
      .is("password_changed_at", null);
    if (markError) console.error("[PASSWORD_CHANGE_MARK_USED_ERROR]", markError);

    await logUserActivity(admin, req, {
      userId: user.id,
      activityType: "password_changed",
      description: "Password was changed successfully after email OTP verification.",
      metadata: { challenge_id: parsed.data.challenge_id, purpose: "change" },
    });

    let notificationSent = false;
    try {
      const { data: profile } = await admin.from("profiles").select("display_name, first_name, last_name").eq("id", user.id).maybeSingle();
      const securityLocation = await resolveRequestLocation(req.headers, false);
      const notification = await sendPasswordChangedEmailOnce({
        userId: user.id,
        email: user.email,
        challengeId: parsed.data.challenge_id,
        source: "change",
        siteUrl: getPublicSiteUrl(req.headers),
        context: {
          name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          time: new Date().toUTCString(),
          ipAddress: securityLocation.ip,
          location: [securityLocation.city, securityLocation.region, securityLocation.country].filter(Boolean).join(", "),
          browser: req.headers.get("user-agent"),
        },
      });
      notificationSent = notification.sent || notification.alreadySent === true;
    } catch (notificationError) {
      console.error("[PASSWORD_CHANGED_MAIL_ERROR]", notificationError);
    }

    return ok({ changed: true, notification_sent: notificationSent });
  } catch (error) {
    console.error("[PASSWORD_CHANGE_COMPLETE_ERROR]", error);
    return fail("Unable to change password. Please try again.", 500, "INTERNAL_ERROR");
  }
}
