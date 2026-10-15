import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/response";
import { getRequestId } from "@/lib/http/request-id";
import { authenticateBearerToken } from "@/lib/auth/identity";
import { codeHash, decryptSession, safeEqual, sha256Base64Url } from "@/lib/auth/authorization-code";
import { createPrivilegedClient, createPublicClient } from "@/lib/supabase/clients";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  client_id: z.literal("admin"),
  redirect_uri: z.string().url(),
  code: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict();

function expectedAdminCallback(): string | null {
  const base = process.env.ADMIN_APP_URL;
  if (!base) return null;
  try { return `${new URL(base).origin}/auth/callback`; }
  catch { return null; }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(await request.json()); }
  catch { return apiError(requestId, "INVALID_REQUEST", "Invalid token request.", 400); }

  let publicClient;
  try { publicClient = createPublicClient(); }
  catch { return apiError(requestId, "SERVICE_NOT_CONFIGURED", "Authentication service is not configured.", 503); }
  const rate = await consumeRateLimit(publicClient, request, "oauth-token", 30);
  if (!rate.allowed) {
    if ("unavailable" in rate) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many token exchange attempts.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const expectedRedirect = expectedAdminCallback();
  if (!expectedRedirect || body.redirect_uri !== expectedRedirect) return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);

  try {
    const privileged = createPrivilegedClient();
    const hash = await codeHash(body.code);
    const { data: candidate, error: lookupError } = await privileged
      .from("api_authorization_codes")
      .select("code_hash,user_id,client_id,redirect_uri,code_challenge,session_ciphertext,session_iv,expires_at,consumed_at")
      .eq("code_hash", hash)
      .eq("client_id", body.client_id)
      .eq("redirect_uri", expectedRedirect)
      .maybeSingle();
    if (lookupError || !candidate || candidate.consumed_at || new Date(candidate.expires_at).getTime() <= Date.now()) {
      return apiError(requestId, "INVALID_AUTHORIZATION_CODE", "The authorization code is invalid or expired.", 400);
    }

    const calculatedChallenge = await sha256Base64Url(body.code_verifier);
    if (!safeEqual(calculatedChallenge, candidate.code_challenge)) return apiError(requestId, "PKCE_VERIFICATION_FAILED", "The authorization code verifier is invalid.", 400);

    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await privileged
      .from("api_authorization_codes")
      .update({ consumed_at: consumedAt })
      .eq("code_hash", hash)
      .is("consumed_at", null)
      .gt("expires_at", consumedAt)
      .select("user_id,session_ciphertext,session_iv")
      .maybeSingle();
    if (consumeError || !consumed) return apiError(requestId, "INVALID_AUTHORIZATION_CODE", "The authorization code has already been used or expired.", 400);

    const session = await decryptSession(consumed.session_iv, consumed.session_ciphertext);
    const verified = await authenticateBearerToken(new Request(request.url, { headers: { Authorization: `Bearer ${session.access_token}` } }));
    if (!verified.ok || verified.identity.user.id !== consumed.user_id) {
      return apiError(requestId, "SESSION_NO_LONGER_VALID", "The account session is no longer valid. Please sign in again.", 401);
    }
    // A refresh token is only returned after the access token is re-validated for the same user.
    return apiSuccess({ session }, requestId);
  } catch (error) {
    console.error("[OAUTH_TOKEN_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "TOKEN_EXCHANGE_UNAVAILABLE", "Token exchange is temporarily unavailable.", 503);
  }
}
