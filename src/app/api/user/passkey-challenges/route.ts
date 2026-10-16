import { NextRequest } from "next/server";
import { createClient } from "@/user/auth/lib/supabase/server";
import { ok, fail } from "@/user/auth/lib/api/response";
import { z } from "zod";

const issueSchema = z.object({
  purpose: z.enum(["registration", "authentication", "recovery"]).default("authentication"),
  duration_minutes: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(5),
});

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = issueSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid passkey challenge request", 422, "VALIDATION_ERROR");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase.rpc("issue_passkey_challenge", {
      target_user_id: user.id,
      challenge_purpose: parsed.data.purpose,
      p_duration_minutes: parsed.data.duration_minutes,
      request_ip: requestIp(req),
    });

    if (error) return fail(error.message, 400, "PASSKEY_CHALLENGE_ISSUE_FAILED");
    const challenge = Array.isArray(data) ? data[0] : data;
    if (!challenge) return fail("Could not issue passkey challenge", 400, "PASSKEY_CHALLENGE_ISSUE_FAILED");

    return ok({
      challenge_id: challenge.challenge_id,
      challenge: challenge.challenge,
      expires_at: challenge.expires_at,
      duration_minutes: challenge.duration_minutes,
    }, 201);
  } catch (err) {
    console.error("[PASSKEY_CHALLENGE_ISSUE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
