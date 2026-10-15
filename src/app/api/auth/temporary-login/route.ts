import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { upsertUserDevice } from "@/modules/identity/lib/device-tracking";
import { ok, fail } from "@/modules/identity/lib/api/response";
import { logUserActivity } from "@/modules/identity/lib/activity-log";
import { isTwoFactorEnabled } from "@/modules/identity/lib/two-factor/service";

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

    // A temporary token is a single factor. Never let it bypass an account's
    // configured second factor. The token is already consumed at this point,
    // so a denied attempt cannot be replayed after an attacker learns that 2FA
    // is enabled.
    if (await isTwoFactorEnabled(consumed.user_id)) {
      return fail("Two-factor authentication is required for this account. Sign in with your password and complete 2FA.", 403, "TWO_FACTOR_REQUIRED");
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
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });
    if (sessionError || !sessionData.session || sessionData.user?.id !== consumed.user_id) {
      console.error("[TEMPORARY_TOKEN_SESSION_ERROR]", sessionError);
      return fail("Temporary login could not be completed", 502, "TEMPORARY_LOGIN_FAILED");
    }

    const ip = requestIp(req);
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
    return ok({ user: { id: consumed.user_id, email: consumed.email }, login_method: "temporary_token" });
  } catch (err) {
    console.error("[TEMPORARY_LOGIN_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
