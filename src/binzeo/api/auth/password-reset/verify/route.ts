import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/binzeo/auth/lib/api/response";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { getPublicSiteUrl } from "@/binzeo/auth/lib/email/transporter";
import { sendPasswordChangedEmailOnce } from "@/binzeo/auth/lib/password-security/service";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";
import { resolveRequestLocation } from "@/binzeo/auth/lib/request-location";

const schema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "Code must be exactly 6 digits"),
  new_password: z.string().min(8).max(72),
  confirm_password: z.string().min(8).max(72),
  purpose: z.enum(["reset", "change"]).default("reset"),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid password reset request", 422, "VALIDATION_ERROR");
    if (parsed.data.new_password !== parsed.data.confirm_password) {
      return fail("Passwords do not match.", 422, "PASSWORD_MISMATCH");
    }

    const sessionClient = await createClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (parsed.data.purpose === "change" && !user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await getSupabaseAdmin().rpc("verify_password_otp", {
      challenge_id: parsed.data.challenge_id,
      submitted_code: parsed.data.code,
      challenge_purpose: parsed.data.purpose,
    });
    if (error) {
      console.error("[PASSWORD_OTP_VERIFY_RPC_ERROR]", error);
      return fail("Password verification failed. Please try again.", 400, "PASSWORD_OTP_VERIFY_FAILED");
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.verified !== true) {
      return ok({ verified: false, reason: result?.reason ?? "verification_failed" });
    }
    if (parsed.data.purpose === "change" && result.user_id !== user?.id) {
      return fail("Verification challenge does not belong to this user.", 403, "FORBIDDEN");
    }

    const admin = getSupabaseAdmin();
    const { error: updateError } = await admin.auth.admin.updateUserById(result.user_id, {
      password: parsed.data.new_password,
    });
    if (updateError) {
      console.error("[PASSWORD_UPDATE_ERROR]", updateError);
      return fail("Unable to update password. Please try again.", 500, "PASSWORD_UPDATE_FAILED");
    }

    await logUserActivity(admin, req, {
      userId: result.user_id,
      activityType: parsed.data.purpose === "reset" ? "password_reset_completed" : "password_changed",
      description: parsed.data.purpose === "reset" ? "Password was reset successfully with email OTP." : "Password was changed successfully with email OTP.",
      metadata: { challenge_id: parsed.data.challenge_id, purpose: parsed.data.purpose },
    });

    let notificationSent = false;
    try {
      const { data: profile } = await admin.from("profiles").select("display_name, first_name, last_name").eq("id", result.user_id).maybeSingle();
      const securityLocation = await resolveRequestLocation(req.headers, false);
      const notification = await sendPasswordChangedEmailOnce({
        userId: result.user_id,
        email: result.email,
        challengeId: parsed.data.challenge_id,
        source: parsed.data.purpose,
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

    return ok({
      verified: true,
      reason: "password_changed",
      notification_sent: notificationSent,
    });
  } catch (error) {
    console.error("[PASSWORD_OTP_VERIFY_ERROR]", error);
    return fail("Unable to change password. Please try again.", 500, "INTERNAL_ERROR");
  }
}
