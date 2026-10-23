import { z } from "zod";
import { apiError, apiSuccess } from "@/platform/http/response";
import { getRequestId } from "@/platform/http/request-id";
import { authenticateBearerToken } from "@/platform/auth/identity";
import { authorizeAdmin } from "@/platform/auth/admin-access";
import { codeHash, createOpaqueCode, encryptSession } from "@/platform/auth/authorization-code";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { createPrivilegedClient, createPublicClient } from "@/platform/database/supabase/clients";
import { consumeRateLimit } from "@/platform/security/rate-limit";


function expectedAdminCallback(): string | null {
  const base = process.env.ADMIN_APP_URL;
  if (!base) return null;
  try { return `${new URL(base).origin}/auth/callback`; }
  catch { return null; }
}

const bodySchema = z.object({
  client_id: z.enum(["admin"]),
  redirect_uri: z.string().url(),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
}).strict();

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(await request.json()); }
  catch { return apiError(requestId, "INVALID_REQUEST", "Invalid authorization request.", 400); }
  const expectedRedirect = expectedAdminCallback();
  if (!expectedRedirect || body.redirect_uri !== expectedRedirect) {
    return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);
  }
  let publicClient;
  try { publicClient = createPublicClient(); }
  catch { return apiError(requestId, "SERVICE_NOT_CONFIGURED", "Authentication service is not configured.", 503); }
  const rate = await consumeRateLimit(publicClient, request, "oauth-authorize-session", 20);
  if (!rate.allowed) {
    if ("unavailable" in rate) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many authorization attempts.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.refresh_token) {
    return apiError(requestId, "SESSION_REQUIRED", "A verified Central Auth session is required.", 401);
  }
  const auth = await authenticateBearerToken(new Request(request.url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  }));
  if (!auth.ok) return apiError(requestId, auth.code, auth.message, auth.status);
  if (body.client_id === "admin") {
    const permission = await authorizeAdmin(auth.identity);
    if (!permission.ok) return apiError(requestId, permission.code, permission.message, 403);
  }

  try {
    const code = createOpaqueCode();
    const encrypted = await encryptSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    const hash = await codeHash(code);
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const privileged = createPrivilegedClient();
    await privileged.from("api_authorization_codes").delete().lt("expires_at", new Date().toISOString());
    const { error } = await privileged.from("api_authorization_codes").insert({
      code_hash: hash,
      user_id: auth.identity.user.id,
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
      code_challenge: body.code_challenge,
      session_ciphertext: encrypted.ciphertext,
      session_iv: encrypted.iv,
      expires_at: expiresAt,
    });
    if (error) return apiError(requestId, "AUTHORIZATION_UNAVAILABLE", "Sign-in could not be completed. Please retry.", 503);
    const callback = new URL(body.redirect_uri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", body.state);
    return apiSuccess({ redirect_url: callback.toString(), expires_in: 120 }, requestId);
  } catch (error) {
    console.error("[OAUTH_SESSION_AUTHORIZE_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "AUTHORIZATION_UNAVAILABLE", "Sign-in could not be completed. Please retry.", 503);
  }
}
