import { NextRequest } from "next/server";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";
import { getPublicSiteUrl } from "@/sites/binzeo/auth/lib/email/transporter";
import { sendWelcomeEmailOnce } from "@/sites/binzeo/auth/lib/email/welcome";
import { logUserActivity } from "@/sites/binzeo/auth/lib/activity-log";
import { resolveRequestLocation } from "@/sites/binzeo/auth/lib/request-location";

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

    const { data: currentVerification } = await supabase
      .from("user_verification_records")
      .select("verification_status")
      .eq("user_id", user.id)
      .eq("verification_type", "email")
      .maybeSingle();
    if (currentVerification?.verification_status === "verified") {
      return fail("Your email is already verified", 409, "ALREADY_VERIFIED");
    }
    const { data: profile } = await supabase.from("profiles").select("display_name, first_name, last_name").eq("id", user.id).maybeSingle();
    const securityLocation = await resolveRequestLocation(req.headers, false);

    const body = await req.json();
    const challengeId = body?.challenge_id;
    const code = body?.code;

    // Validation
    if (!challengeId || typeof challengeId !== "string") {
      return fail("Missing challenge_id", 422, "VALIDATION_ERROR");
    }

    if (!code || typeof code !== "string") {
      return fail("Missing code", 422, "VALIDATION_ERROR");
    }

    if (!/^\d{6}$/.test(code)) {
      return fail(
        "Code must be exactly 6 digits",
        422,
        "INVALID_CODE_FORMAT"
      );
    }

    // UUID format check (basic)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        challengeId
      )
    ) {
      return fail("Invalid challenge_id format", 422, "INVALID_UUID");
    }

    // Supabase RPC কল — verify
    const { data, error } = await supabase.rpc(
      "verify_email_verification_code",
      {
        challenge_id: challengeId,
        submitted_code: code,
      }
    );

    if (error) {
      console.error("[OTP_VERIFY_RPC_ERROR]", error);
      return fail(error.message, 400, "OTP_VERIFY_FAILED");
    }

    const result = Array.isArray(data) ? data[0] : data;

    const verified = result?.verified === true;
    if (verified && result?.user_id !== user.id) {
      return fail("Verification challenge does not belong to this user", 403, "FORBIDDEN");
    }

    if (verified && user.email) {
      try {
        await sendWelcomeEmailOnce({
          userId: user.id,
          email: user.email,
          siteUrl: getPublicSiteUrl(req.headers),
          context: {
            name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
            time: new Date().toUTCString(),
            ipAddress: securityLocation.ip,
            location: [securityLocation.city, securityLocation.region, securityLocation.country].filter(Boolean).join(", "),
            browser: req.headers.get("user-agent"),
          },
        });
      } catch (welcomeError) {
        console.error("[WELCOME_EMAIL_ERROR]", welcomeError);
      }
    }

    const reason: string = result?.reason ?? (verified ? "verified" : "verification_failed");

    await logUserActivity(supabase, req, {
      userId: user.id,
      activityType: verified ? "email_verified" : "email_verification_failed",
      description: verified ? "Email address verified successfully." : "Email verification code was not accepted.",
      metadata: { challenge_id: challengeId, reason },
    });

    return ok({
      verified,
      reason,
    });
  } catch (err) {
    console.error("[OTP_VERIFY_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
