import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/sites/binzeo/auth/lib/api/response";
import { getPublicSiteUrl, buildPasswordResetEmail, EMAIL_FROM, transporter } from "@/sites/binzeo/auth/lib/email/transporter";
import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";
import { markPasswordOtpEmail } from "@/sites/binzeo/auth/lib/password-security/service";
import { PASSWORD_OTP_EXPIRY_SECONDS } from "@/sites/binzeo/auth/lib/password-security/config";
import { logUserActivity } from "@/sites/binzeo/auth/lib/activity-log";
import { resolveRequestLocation } from "@/sites/binzeo/auth/lib/request-location";

const schema = z.object({ email: z.string().trim().email().max(320) });

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
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("Enter a valid email address.", 422, "VALIDATION_ERROR");

    const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
    const securityLocation = await resolveRequestLocation(req.headers, false);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("issue_password_otp", {
      target_user_id: null,
      target_email: parsed.data.email,
      challenge_purpose: "reset",
      request_ip: requestIp,
    });

    if (error) {
      const limited = rateLimitFailure(error.message);
      if (limited) return limited;
      console.error("[PASSWORD_RESET_ISSUE_ERROR]", error);
      return fail("Unable to start password reset. Please try again.", 500, "PASSWORD_RESET_FAILED");
    }

    const challenge = Array.isArray(data) ? data[0] : data;
    // Always return the same accepted response for unknown emails.
    if (!challenge?.challenge_id || !challenge?.verification_code) {
      return ok({ accepted: true, message: "If an account exists for that email, a verification code has been sent." });
    }

    try {
      const { data: profile } = await admin.from("profiles").select("display_name, first_name, last_name").eq("id", String(challenge.resolved_user_id)).maybeSingle();
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
        to: String(challenge.resolved_email),
        subject: content.subject,
        html: content.html,
      });
      await markPasswordOtpEmail(String(challenge.challenge_id), true);
      await logUserActivity(admin, req, {
        userId: String(challenge.resolved_user_id),
        activityType: "password_reset_requested",
        description: "Requested a password reset verification code.",
        metadata: { challenge_id: String(challenge.challenge_id), purpose: "reset" },
      });
    } catch (mailError) {
      console.error("[PASSWORD_RESET_MAIL_ERROR]", mailError);
      await markPasswordOtpEmail(
        String(challenge.challenge_id),
        false,
        mailError instanceof Error ? mailError.message : "Password reset email failed",
      );
      return fail("Unable to send the password reset email.", 502, "PASSWORD_RESET_MAIL_FAILED");
    }

    return ok({
      accepted: true,
      challenge_id: String(challenge.challenge_id),
      expires_at: challenge.expires_at ?? null,
      message: "If an account exists for that email, a verification code has been sent.",
    });
  } catch (error) {
    console.error("[PASSWORD_RESET_REQUEST_ERROR]", error);
    return fail("Unable to start password reset. Please try again.", 500, "INTERNAL_ERROR");
  }
}
