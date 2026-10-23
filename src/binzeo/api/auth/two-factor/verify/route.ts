import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { upsertUserDevice } from "@/binzeo/auth/lib/device-tracking";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";
import { sendLoginNotification } from "@/binzeo/auth/lib/email/two-factor";
import { getPublicSiteUrl } from "@/binzeo/auth/lib/email/transporter";
import { resolveRequestLocation } from "@/binzeo/auth/lib/request-location";
import { ok, fail } from "@/binzeo/auth/lib/api/response";
import { logAuthSessionShape } from "@/binzeo/auth/lib/session-diagnostics";

const schema = z.object({ challenge_id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
function requestIp(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "0.0.0.0"; }

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("Enter the 6-digit 2FA code", 422, "VALIDATION_ERROR");
    const admin = getSupabaseAdmin();
    const { data: challengeMeta } = await admin.from("two_factor_challenges").select("login_method").eq("id", parsed.data.challenge_id).maybeSingle();
    const { data: raw, error } = await admin.rpc("verify_two_factor_login_code", { target_challenge_id: parsed.data.challenge_id, submitted_code: parsed.data.code });
    const result = Array.isArray(raw) ? raw[0] : raw;
    if (error || !result?.valid || !result.user_id || !result.email) return fail("That 2FA code is invalid or expired", 401, "TWO_FACTOR_CODE_INVALID");
    const challengeLoginMethod = challengeMeta?.login_method;
    const loginMethod = challengeLoginMethod === "passkey" || challengeLoginMethod === "temporary_token"
      ? challengeLoginMethod
      : "password";

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: result.email });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) return fail("2FA verification succeeded, but the session could not be created", 502, "TWO_FACTOR_SESSION_FAILED");
    const supabase = await createClient();
    // Create a session for the requesting app; never revoke other app sessions here.
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({ token_hash: hashedToken, type: "email" });
    if (sessionError || !sessionData.session || sessionData.user?.id !== result.user_id) return fail("2FA verification succeeded, but the session could not be created", 502, "TWO_FACTOR_SESSION_FAILED");

    const ip = requestIp(req);
    const securityLocation = await resolveRequestLocation(req.headers, false);
    const { data: profile } = await admin.from("profiles").select("display_name, first_name, last_name").eq("id", result.user_id).maybeSingle();
    const device = await upsertUserDevice(supabase, result.user_id, req.headers, ip);
    await supabase.from("user_login_history").insert({ user_id: result.user_id, login_method: `${loginMethod}_2fa`, login_status: "success", ip_address: ip, device_id: device.id, user_agent: req.headers.get("user-agent") });
    await logUserActivity(supabase, req, { userId: result.user_id, activityType: `${loginMethod}_login_2fa_success`, description: `Signed in successfully with ${loginMethod} after email 2FA verification.`, deviceId: device.id, metadata: { challenge_id: parsed.data.challenge_id, login_method: loginMethod } });
    try { await sendLoginNotification({ userId: result.user_id, email: result.email, loginMethod: `${loginMethod} + email 2FA`, ipAddress: ip, userAgent: req.headers.get("user-agent"), siteUrl: getPublicSiteUrl(req.headers), context: { name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "), time: new Date().toUTCString(), ipAddress: securityLocation.ip, location: [securityLocation.city, securityLocation.region, securityLocation.country].filter(Boolean).join(", "), browser: req.headers.get("user-agent") } }); }
    catch (notificationError) { console.error("[TWO_FACTOR_NOTIFICATION_ERROR]", notificationError); }
    logAuthSessionShape(req, `${loginMethod}_2fa`, sessionData.session);
    return ok({ session: sessionData.session, user: { id: result.user_id, email: result.email }, login_method: `${loginMethod}_2fa` });
  } catch (error) {
    console.error("[TWO_FACTOR_VERIFY_ERROR]", error);
    return fail("Unable to complete 2FA verification", 500, "INTERNAL_ERROR");
  }
}
