import { NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { byteaFromBase64Url, webauthnConfig } from "@/sites/binzeo/auth/lib/webauthn";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

const schema = z.object({
  challenge_id: z.string().uuid(),
  challenge: z.string().min(16).max(512),
  response: z.unknown(),
  device_name: z.string().trim().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("Invalid passkey registration", 422, "VALIDATION_ERROR");
    const { rpID, origin } = webauthnConfig(req);
    const verification = await verifyRegistrationResponse({
      response: parsed.data.response as RegistrationResponseJSON,
      expectedChallenge: parsed.data.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified) return fail("Passkey registration was not verified", 400, "PASSKEY_REGISTRATION_FAILED");
    const { data: consumed, error: consumeError } = await supabase.rpc("consume_passkey_challenge", {
      challenge_id: parsed.data.challenge_id,
      submitted_challenge: parsed.data.challenge,
    });
    const challenge = Array.isArray(consumed) ? consumed[0] : consumed;
    if (consumeError || !challenge?.valid || challenge.user_id !== user.id || challenge.purpose !== "registration") {
      return fail("Passkey challenge is invalid or expired", 400, "PASSKEY_CHALLENGE_INVALID");
    }
    const info = verification.registrationInfo;
    const credentialId = info.credential.id;
    const { data, error } = await supabase.from("user_passkeys").insert({
      user_id: user.id,
      credential_id: byteaFromBase64Url(credentialId),
      public_key: `\\x${Buffer.from(info.credential.publicKey).toString("hex")}`,
      sign_count: info.credential.counter,
      // The registration options require a platform authenticator. SimpleWebAuthn
      // reports backup state as singleDevice/multiDevice, while the BINZEO schema
      // stores the authenticator family as platform/cross_platform.
      authenticator_type: "platform",
      device_name: parsed.data.device_name ?? "This device",
      transports: (parsed.data.response as RegistrationResponseJSON).response.transports ?? [],
      aaguid: info.aaguid,
      is_discoverable: true,
      is_backed_up: info.credentialBackedUp,
      metadata: {
        authenticator_attachment: "platform",
        credential_device_type: info.credentialDeviceType,
        credential_backed_up: info.credentialBackedUp,
      },
    }).select("id, device_name, authenticator_type, is_backed_up, created_at").single();
    if (error) return fail(error.message, 400, "PASSKEY_SAVE_FAILED");
    return ok({ passkey: data }, 201);
  } catch (err) {
    console.error("[PASSKEY_REGISTER_ERROR]", err);
    return fail("Passkey registration failed", 400, "PASSKEY_REGISTRATION_FAILED");
  }
}
