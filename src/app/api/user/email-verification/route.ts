import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { transporter, EMAIL_FROM, buildOtpEmail, getPublicSiteUrl } from "@/modules/identity/lib/email/transporter";
import { ok, fail } from "@/modules/identity/lib/api/response";
import { otpRateLimitResponse } from "@/modules/identity/lib/otp-rate-limit";
import { logUserActivity } from "@/modules/identity/lib/activity-log";
import { resolveRequestLocation } from "@/modules/identity/lib/request-location";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return fail("Unauthorized", 401, "UNAUTHORIZED");
    }

    if (!user.email) {
      return fail("User has no email", 400, "NO_EMAIL");
    }

    const { data: verification } = await supabase
      .from("user_verification_records")
      .select("verification_status")
      .eq("user_id", user.id)
      .eq("verification_type", "email")
      .maybeSingle();
    if (verification?.verification_status === "verified") {
      return fail("Your email is already verified", 409, "ALREADY_VERIFIED");
    }

    // Request IP বের করা
    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "0.0.0.0";
    const { data: profile } = await supabase.from("profiles").select("display_name, first_name, last_name").eq("id", user.id).maybeSingle();
    const securityLocation = await resolveRequestLocation(req.headers, false);

    // Supabase RPC কল — challenge তৈরি
    const { data, error } = await supabase.rpc(
      "issue_email_verification_code",
      {
        target_user_id: user.id,
        request_ip: requestIp,
      }
    );

    if (error) {
      console.error("[OTP_ISSUE_RPC_ERROR]", error);
      const limited = otpRateLimitResponse(error.message);
      if (limited) {
        return fail(limited.message, limited.status, limited.code, {
          retry_after_seconds: limited.retryAfter,
        });
      }
      return fail(error.message, 400, "OTP_ISSUE_FAILED");
    }

    // RPC response থেকে challenge_id এবং code বের করা
    // ⚠️ structure আপনার RPC function এর উপর নির্ভর করে
    const challenge = Array.isArray(data) ? data[0] : data;

    if (!challenge) {
      return fail("Failed to create challenge", 500, "NO_CHALLENGE");
    }

    const challengeId: string =
      challenge.challenge_id ?? challenge.id ?? challenge.challengeId;
    const code: string =
      challenge.code ?? challenge.verification_code ?? challenge.otp;

    if (!challengeId || !code) {
      console.error("[OTP_ISSUE_SHAPE]", challenge);
      return fail(
        "Challenge response missing fields",
        500,
        "INVALID_CHALLENGE_SHAPE"
      );
    }

    // Gmail SMTP দিয়ে OTP email পাঠানো
    try {
      const email = buildOtpEmail(String(code), 300, getPublicSiteUrl(req.headers), {
        name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
        time: new Date().toUTCString(),
        ipAddress: securityLocation.ip || requestIp,
        location: [securityLocation.city, securityLocation.region, securityLocation.country].filter(Boolean).join(", "),
        browser: req.headers.get("user-agent"),
      });
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: user.email,
        subject: email.subject,
        html: email.html,
      });
    } catch (mailErr) {
      console.error("[OTP_MAIL_SEND_ERROR]", mailErr);
      return fail("Failed to send verification email", 502, "MAIL_SEND_FAILED");
    }

    await logUserActivity(supabase, req, {
      userId: user.id,
      activityType: "email_verification_requested",
      description: "Requested an email verification code.",
      metadata: { challenge_id: challengeId, expires_at: challenge.expires_at ?? null },
    });

    // ⚠️ IMPORTANT: ক্লায়েন্টকে code রিটার্ন করবেন না — শুধু challenge_id
    return ok({
      challenge_id: challengeId,
      expires_at: challenge.expires_at ?? null,
      message: "Verification code sent to your email",
    });
  } catch (err) {
    console.error("[OTP_ISSUE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
