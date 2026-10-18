import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/response";
import { getRequestId } from "@/lib/http/request-id";
import { authenticateBearerToken } from "@/lib/auth/identity";
import { authorizeAdmin } from "@/lib/auth/admin-access";
import { codeHash, createOpaqueCode, encryptSession } from "@/lib/auth/authorization-code";
import { getRegisteredOAuthClient, isRegisteredRedirectUriAllowed } from "@/lib/auth/oauth-client-registry";
import { createPrivilegedClient, createPublicClient } from "@/lib/supabase/clients";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isRegisteredSsoCallback } from "@/lib/auth/sso-clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clientIdPattern = /^(?:admin|jabiyen|[a-z0-9][a-z0-9-]{0,62}:[a-z0-9][a-z0-9-]{0,62})$/;
const bodySchema = z.object({
  client_id: z.string().regex(clientIdPattern),
  redirect_uri: z.string().url().max(2048),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  refresh_token: z.string().min(16).max(4096),
}).strict();

function expectedAdminCallback(): string {
  const base = process.env.ADMIN_APP_URL;
  if (!base) throw new Error("Admin callback is not configured");
  const url = new URL(base);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Admin callback must use HTTPS");
  return `${url.origin}/auth/callback`;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(await request.json()); }
  catch { return apiError(requestId, "INVALID_REQUEST", "Invalid authorization request.", 400); }

  let publicClient;
  try { publicClient = createPublicClient(); }
  catch { return apiError(requestId, "SERVICE_NOT_CONFIGURED", "Authentication service is not configured.", 503); }
  const rate = await consumeRateLimit(publicClient, request, "oauth-authorize", 20);
  if (!rate.allowed) {
    if ("unavailable" in rate) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many authorization attempts.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const auth = await authenticateBearerToken(request);
  if (!auth.ok) return apiError(requestId, auth.code, auth.message, auth.status);

  let redirectUri: string;
  if (body.client_id === "admin") {
    const permission = await authorizeAdmin(auth.identity);
    if (!permission.ok) return apiError(requestId, permission.code, permission.message, 403);
    try { redirectUri = expectedAdminCallback(); }
    catch { return apiError(requestId, "CLIENT_NOT_CONFIGURED", "The admin client is not configured.", 503); }
    if (body.redirect_uri !== redirectUri) return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);
  } else if (body.client_id === "jabiyen") {
    if (!isRegisteredSsoCallback("jabiyen", body.redirect_uri)) {
      return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);
    }
    redirectUri = body.redirect_uri;
  } else {
    try {
      const client = await getRegisteredOAuthClient(body.client_id);
      if (!client) return apiError(requestId, "OAUTH_CLIENT_NOT_FOUND", "This application is not registered for Central Auth sign-in.", 404);
      if (!isRegisteredRedirectUriAllowed(client, body.redirect_uri)) {
        return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);
      }
      if (client.client_type === "admin") {
        const permission = await authorizeAdmin(auth.identity);
        if (!permission.ok) return apiError(requestId, permission.code, permission.message, 403);
      }
      redirectUri = body.redirect_uri;
    } catch (error) {
      console.error("[OAUTH_CLIENT_RESOLVE_ERROR]", error instanceof Error ? error.message : "unknown");
      return apiError(requestId, "AUTHORIZATION_UNAVAILABLE", "Application sign-in is temporarily unavailable.", 503);
    }
  }

  try {
    const code = createOpaqueCode();
    const encrypted = await encryptSession({ access_token: auth.identity.accessToken, refresh_token: body.refresh_token });
    const hash = await codeHash(code);
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const privileged = createPrivilegedClient();
    await privileged.from("api_authorization_codes").delete().lt("expires_at", new Date().toISOString());
    const { error } = await privileged.from("api_authorization_codes").insert({
      code_hash: hash,
      user_id: auth.identity.user.id,
      client_id: body.client_id,
      redirect_uri: redirectUri,
      code_challenge: body.code_challenge,
      session_ciphertext: encrypted.ciphertext,
      session_iv: encrypted.iv,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[OAUTH_CODE_INSERT_ERROR]", { code: error.code });
      return apiError(requestId, "AUTHORIZATION_UNAVAILABLE", "Sign-in could not be completed. Please retry.", 503);
    }
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", body.state);
    return apiSuccess({ redirect_url: callback.toString(), expires_in: 120 }, requestId);
  } catch (error) {
    console.error("[OAUTH_AUTHORIZE_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "AUTHORIZATION_UNAVAILABLE", "Sign-in could not be completed. Please retry.", 503);
  }
}
