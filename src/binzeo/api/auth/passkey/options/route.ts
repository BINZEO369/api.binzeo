import { NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { webauthnConfig } from "@/binzeo/auth/lib/webauthn";
import { ok, fail } from "@/binzeo/auth/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("issue_passkey_challenge", {
      target_user_id: null,
      challenge_purpose: "authentication",
      p_duration_minutes: 5,
      request_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    if (error) return fail(error.message, 400, "PASSKEY_CHALLENGE_ISSUE_FAILED");
    const challenge = Array.isArray(data) ? data[0] : data;
    if (!challenge?.challenge_id || !challenge.challenge) return fail("Could not issue passkey challenge", 400, "PASSKEY_CHALLENGE_ISSUE_FAILED");
    const { rpID } = webauthnConfig(req);
    const options = await generateAuthenticationOptions({
      rpID,
      challenge: challenge.challenge,
      userVerification: "required",
    });
    // The browser receives options.challenge after SimpleWebAuthn converts the
    // server challenge to Base64URL. Return that exact value to verification;
    // sending the raw database challenge causes every valid assertion to fail.
    return ok({ challenge_id: challenge.challenge_id, challenge: options.challenge, options }, 201);
  } catch (err) {
    console.error("[PASSKEY_AUTH_OPTIONS_ERROR]", err);
    return fail("Passkey login is unavailable", 500, "PASSKEY_LOGIN_FAILED");
  }
}
