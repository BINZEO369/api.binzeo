import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";
import { z } from "zod";

const consumeSchema = z.object({
  challenge_id: z.string().uuid(),
  submitted_challenge: z.string().min(1).max(512),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const parsed = consumeSchema.safeParse(await req.json());
    if (!parsed.success) return fail("Invalid passkey challenge request", 422, "VALIDATION_ERROR");

    const { data, error } = await supabase.rpc("consume_passkey_challenge", {
      challenge_id: parsed.data.challenge_id,
      submitted_challenge: parsed.data.submitted_challenge,
    });

    if (error) return fail(error.message, 400, "PASSKEY_CHALLENGE_CONSUME_FAILED");
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.valid) return fail("Invalid or expired passkey challenge", 400, "PASSKEY_CHALLENGE_INVALID");
    if (result.user_id !== user.id) return fail("Challenge does not belong to this user", 403, "FORBIDDEN");

    return ok({ valid: true, purpose: result.purpose, expires_at: result.expires_at });
  } catch (err) {
    console.error("[PASSKEY_CHALLENGE_CONSUME_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
