import { NextRequest } from "next/server";
import { fail, ok } from "@/user/auth/lib/api/response";
import { createClient } from "@/user/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/user/auth/lib/supabase/admin";
import { getPublicSiteUrl, buildPasswordResetEmail, EMAIL_FROM, transporter } from "@/user/auth/lib/email/transporter";
import { markPasswordOtpEmail } from "@/user/auth/lib/password-security/service";
import { PASSWORD_OTP_EXPIRY_SECONDS } from "@/user/auth/lib/password-security/config";
import { logUserActivity } from "@/user/auth/lib/activity-log";
import { resolveRequestLocation } from "@/user/auth/lib/request-location";

function rateLimitFailure(message: string) {
  const lower = message.toLowerCase();
  if (lower.startsWith("password_otp_cooldown:")) {
    const seconds = Number.parseInt(message.split(":")[1] ?? "60", 10);
    return fail("Please wait before requesting another password code.", 429, "PASSWORD_OTP_COOLDOWN", {
      retry_after_seconds: Number.isFinite(seconds) ? seconds : 60,
    });
  }
  if (lower.includes("password_otp_hourly_limit")) {
    return fail("Too many password-code requests. Please try again later.", 429, "PASSWORD_OTP_HOURLY_LIMIT", {
      retry_after_seconds: 3600,
    });
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
    const securityLocation = await resolveRequestLocation(req.headers, false);
    const { data, error } = await getSupabaseAdmin().rpc("issue_password_otp", {
      target_user_id: user.id,
      target_email: user.email,
      challenge_purpose: "change",
      request_ip: requestIp,
    });
    if (error) {
      const limited = rateLimitFailure(error.message);
      if (limited) return limited;
      console.error("[PASSWORD_CHANGE_ISSUE_ERROR]", error);
      return fail("Unable to start password change. Please try again.", 500, "PASSWORD_CHANGE_FAILED");
    }

    const challenge = Array.isArray(data) ? data[0] : data;
    if (!challenge?.challenge_id || !challenge?.verification_code) {
      return fail("Unable to create a password-change challenge.", 500, "NO_CHALLENGE");
    }

    try {
      const { data: profile } = await getSupabaseAdmin().from("profiles").select("display_name, first_name, last_name").eq("id", user.id).maybeSingle();
      const content = buildPasswordResetEmail(
        String(challenge.verification_code),
        PASSWORD_OTP_EXPIRY_SECONDS,
        getPublicSiteUrl(req.headers),
        {
          name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          time: new Date().toUTCString(),
          ipAddress: securityLocation.ip || requestIp,
          location: [securityLocation.city, securityLocation.region, securityLocation.country].filter(Boolean).join(", "),
          browser: req.headers.get("user-agent"),
        },
      );
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: user.email,
        subject: content.subject,
        html: content.html,
      });
      await markPasswordOtpEmail(String(challenge.challenge_id), true);
      await logUserActivity(getSupabaseAdmin(), req, {
        userId: user.id,
        activityType: "password_change_requested",
        description: "Requested a password-change verification code.",
        metadata: { challenge_id: String(challenge.challenge_id), purpose: "change" },
      });
    } catch (mailError) {
      console.error("[PASSWORD_CHANGE_MAIL_ERROR]", mailError);
      await markPasswordOtpEmail(
        String(challenge.challenge_id),
        false,
        mailError instanceof Error ? mailError.message : "Password change email failed",
      );
      return fail("Unable to send the password verification email.", 502, "PASSWORD_CHANGE_MAIL_FAILED");
    }

    return ok({
      challenge_id: String(challenge.challenge_id),
      expires_at: challenge.expires_at ?? null,
      message: "A password verification code has been sent to your email.",
    });
  } catch (error) {
    console.error("[PASSWORD_CHANGE_REQUEST_ERROR]", error);
    return fail("Unable to start password change. Please try again.", 500, "INTERNAL_ERROR");
  }
}
