import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";
import { z } from "zod";

const durationSchema = z.object({
  duration_minutes: z.union([
    z.literal(1), z.literal(2), z.literal(5), z.literal(1440), z.literal(4320), z.literal(7200),
  ]),
});

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const { data, error } = await supabase
      .from("temporary_login_tokens")
      .select("id, token_preview, duration_minutes, expires_at, used_at, revoked_at, created_ip, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return fail(error.message, 400, "TEMPORARY_TOKENS_FETCH_FAILED");
    return ok({ tokens: data ?? [] });
  } catch (err) {
    console.error("[TEMPORARY_TOKENS_GET_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data: verification } = await supabase
      .from("user_verification_records")
      .select("verification_status")
      .eq("user_id", user.id)
      .eq("verification_type", "email")
      .maybeSingle();
    if (verification?.verification_status !== "verified") {
      return fail("Verify your email before creating a temporary login token", 403, "EMAIL_VERIFICATION_REQUIRED");
    }

    const parsed = durationSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("Choose a valid token duration", 422, "VALIDATION_ERROR");

    const { count, error: countError } = await supabase
      .from("temporary_login_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    if (countError) return fail(countError.message, 400, "TEMPORARY_TOKEN_LIMIT_CHECK_FAILED");
    if ((count ?? 0) >= 10) return fail("Revoke an existing token before creating another", 429, "TEMPORARY_TOKEN_LIMIT");

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tokenPreview = `${token.slice(0, 8)}…${token.slice(-6)}`;
    const expiresAt = new Date(Date.now() + parsed.data.duration_minutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from("temporary_login_tokens")
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        token_preview: tokenPreview,
        duration_minutes: parsed.data.duration_minutes,
        expires_at: expiresAt,
        created_ip: requestIp(req),
        created_user_agent: req.headers.get("user-agent"),
      })
      .select("id, token_preview, duration_minutes, expires_at, created_at")
      .single();
    if (error) return fail(error.message, 400, "TEMPORARY_TOKEN_CREATE_FAILED");
    return ok({ token, token_record: data, one_time: true }, 201);
  } catch (err) {
    console.error("[TEMPORARY_TOKENS_POST_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
