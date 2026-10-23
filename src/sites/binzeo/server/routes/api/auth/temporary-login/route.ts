import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { upsertUserDevice } from "@/sites/binzeo/auth/lib/device-tracking";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";
import { logUserActivity } from "@/sites/binzeo/auth/lib/activity-log";
import { isTwoFactorEnabled, issueAndSendTwoFactorCode } from "@/sites/binzeo/auth/lib/two-factor/service";
import { logAuthSessionShape } from "@/sites/binzeo/auth/lib/session-diagnostics";

const tokenSchema = z.object({ token: z.string().min(20).max(256) });

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

export async function POST(req: NextRequest) {
  try {
    const parsed = tokenSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("Enter a valid temporary login token", 422, "VALIDATION_ERROR");

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const admin = getSupabaseAdmin();
    const { data: consumedRaw, error: consumeError } = await admin
      .rpc("consume_temporary_login_token", { p_token_hash: tokenHash })
      .maybeSingle();
    const consumed = consumedRaw as { user_id: string; email: string; token_id: string } | null;
    if (consumeError || !consumed?.user_id || !consumed.email) {
      return fail("This temporary login token is invalid, expired, revoked, or already used", 401, "TEMPORARY_TOKEN_INVALID");
    }

    const ip = requestIp(req);
    if (await isTwoFactorEnabled(consumed.user_id)) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("id", consumed.user_id)
        .maybeSingle();
      try {
        const challenge = await issueAndSendTwoFactorCode({
          admin,
          req,
          userId: consumed.user_id,
          email: consumed.email,
          loginMethod: "temporary_token",
          context: {
            name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
            time: new Date().toUTCString(),
            ipAddress: ip,
            browser: req.headers.get("user-agent"),
          },
        });
        return ok({
          requires_two_factor: true,
          challenge_id: challenge.challengeId,
          user: { id: consumed.user_id, email: consumed.email },
          login_method: "temporary_token",
        });
      } catch (twoFactorError) {
        console.error("[TEMPORARY_LOGIN_2FA_EMAIL_ERROR]", twoFactorError);
        return fail("Unable to send the 2FA verification code", 502, "TWO_FACTOR_EMAIL_FAILED");
      }
    }

    const origin = req.headers.get("origin") ?? process.env.AUTH_APP_URL;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: consumed.email,
      options: origin ? { redirectTo: `${origin}/signin` } : undefined,
    });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      console.error("[TEMPORARY_TOKEN_MAGIC_LINK_ERROR]", linkError);
      return fail("Temporary login could not be completed", 502, "TEMPORARY_LOGIN_FAILED");
    }

    const supabase = await createClient();
    // Return a session for the requesting app; do not revoke other app sessions.
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });
    if (sessionError || !sessionData.session || sessionData.user?.id !== consumed.user_id) {
      console.error("[TEMPORARY_TOKEN_SESSION_ERROR]", sessionError);
      return fail("Temporary login could not be completed", 502, "TEMPORARY_LOGIN_FAILED");
    }

    const device = await upsertUserDevice(supabase, consumed.user_id, req.headers, ip);
    const { error: historyError } = await supabase.from("user_login_history").insert({
      user_id: consumed.user_id,
      login_method: "temporary_token",
      login_status: "success",
      ip_address: ip,
      device_id: device.id,
      user_agent: req.headers.get("user-agent"),
    });
    if (historyError) console.error("[TEMPORARY_LOGIN_HISTORY_ERROR]", historyError);
    await logUserActivity(supabase, req, {
      userId: consumed.user_id,
      activityType: "temporary_token_login_success",
      description: "Signed in successfully with a temporary login token.",
      deviceId: device.id,
      metadata: { login_method: "temporary_token" },
    });
    logAuthSessionShape(req, "temporary_token", sessionData.session);
    return ok({
      user: { id: consumed.user_id, email: consumed.email },
      session: sessionData.session,
      login_method: "temporary_token",
    });
  } catch (err) {
    console.error("[TEMPORARY_LOGIN_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
