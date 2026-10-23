import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/binzeo/auth/lib/api/response";
import { NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { base64UrlFromBytea, webauthnConfig } from "@/binzeo/auth/lib/webauthn";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_passkeys")
      .select("id, device_name, authenticator_type, transports, aaguid, is_discoverable, is_backed_up, last_used_at, expires_at, revoked_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 400, "PASSKEYS_FETCH_FAILED");
    return ok({ passkeys: data ?? [] });
  } catch (err) {
    console.error("[PASSKEYS_GET_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const { data: existing, error: existingError } = await supabase
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if (existingError) return fail(existingError.message, 400, "PASSKEYS_FETCH_FAILED");
    const { data: challenge, error: challengeError } = await supabase.rpc("issue_passkey_challenge", {
      target_user_id: user.id,
      challenge_purpose: "registration",
      p_duration_minutes: 5,
      request_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    if (challengeError) return fail(challengeError.message, 400, "PASSKEY_CHALLENGE_ISSUE_FAILED");
    const issued = Array.isArray(challenge) ? challenge[0] : challenge;
    if (!issued?.challenge_id || !issued.challenge) return fail("Could not issue passkey challenge", 400, "PASSKEY_CHALLENGE_ISSUE_FAILED");
    const { rpID } = webauthnConfig(req);
    const options = await generateRegistrationOptions({
      rpName: "BINZEO",
      rpID,
      userID: Buffer.from(user.id.replace(/-/g, ""), "hex"),
      userName: user.email,
      userDisplayName: user.user_metadata?.display_name ?? user.email,
      challenge: issued.challenge,
      attestationType: "none",
      // Device passkeys are protected by the operating system: Face ID,
      // fingerprint, Windows Hello, Android screen lock, or device PIN.
      // A discoverable credential lets the user sign in without an email.
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      excludeCredentials: (existing ?? []).map((item) => ({
        id: base64UrlFromBytea(item.credential_id),
        transports: item.transports ?? [],
      })),
    });
    return ok({ challenge_id: issued.challenge_id, options }, 201);
  } catch (err) {
    console.error("[PASSKEY_OPTIONS_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
