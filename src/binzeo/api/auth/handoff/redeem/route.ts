import { z } from "zod";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";
import { getRegisteredOAuthClient, isRegisteredRedirectUriAllowed } from "@/binzeo/auth/oauth-client-registry";
import { isApplicationHandoffToken, sha256ApplicationHandoffToken, verifyApplicationHandoffToken } from "@/binzeo/auth/application-handoff";
import { getServiceRoleKey } from "@/binzeo/config/env";
import { createPrivilegedClient, createPublicClient } from "@/common/database/supabase/clients";
import { consumeRateLimit } from "@/common/security/rate-limit";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { logAuthSessionShape } from "@/binzeo/auth/lib/session-diagnostics";


const clientIdPattern = /^(?:[a-z0-9][a-z0-9-]{0,62}:[a-z0-9][a-z0-9-]{0,62})$/;
const bodySchema = z.object({
  token: z.string().min(90).max(128),
  client_id: z.string().regex(clientIdPattern),
  redirect_uri: z.string().url().max(2048),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict();

async function validateClient(clientId: string, redirectUri: string): Promise<"allowed" | "not_found" | "redirect_mismatch" | "admin_client"> {
  try {
    const client = await getRegisteredOAuthClient(clientId);
    if (!client) return "not_found";
    if (client.client_type === "admin") return "admin_client";
    return isRegisteredRedirectUriAllowed(client, redirectUri) ? "allowed" : "redirect_mismatch";
  } catch (error) {
    console.error("[APPLICATION_HANDOFF_CLIENT_RESOLVE_ERROR]", error instanceof Error ? error.message : "unknown");
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return apiError(requestId, "INVALID_REQUEST", "Invalid application handoff request.", 400); }
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success || !isApplicationHandoffToken(parsedBody.success ? parsedBody.data.token : "")) {
    return apiError(requestId, "INVALID_REQUEST", "Invalid application handoff request.", 400);
  }
  const body = parsedBody.data;
  let callback: URL;
  try {
    callback = new URL(body.redirect_uri);
    if (callback.hash || (process.env.NODE_ENV === "production" && callback.protocol !== "https:")) {
      return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);
    }
  } catch {
    return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);
  }

  let publicClient;
  try { publicClient = createPublicClient(); }
  catch { return apiError(requestId, "SERVICE_NOT_CONFIGURED", "Authentication service is not configured.", 503); }
  const rate = await consumeRateLimit(publicClient, request, "application-handoff-redeem", 30);
  if (!rate.allowed) {
    if ("unavailable" in rate) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many application handoff attempts.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  let clientStatus: Awaited<ReturnType<typeof validateClient>>;
  try { clientStatus = await validateClient(body.client_id, body.redirect_uri); }
  catch { return apiError(requestId, "APPLICATION_HANDOFF_UNAVAILABLE", "Application sign-in is temporarily unavailable.", 503); }
  if (clientStatus === "not_found") return apiError(requestId, "OAUTH_CLIENT_NOT_FOUND", "This application is not registered for Central Auth sign-in.", 404);
  if (clientStatus === "admin_client") return apiError(requestId, "HANDOFF_NOT_SUPPORTED", "Administrative applications must use the secured authorization-code flow.", 403);
  if (clientStatus !== "allowed") return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);

  try {
    const privileged = createPrivilegedClient();
    const tokenHash = sha256ApplicationHandoffToken(body.token);
    const { data: candidate, error: lookupError } = await privileged
      .from("temporary_login_tokens")
      .select("user_id, expires_at, used_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (lookupError || !candidate || candidate.used_at || candidate.revoked_at || !candidate.user_id || !candidate.expires_at) {
      return apiError(requestId, "INVALID_APPLICATION_HANDOFF", "This sign-in handoff is invalid or expired. Please start again.", 401);
    }
    if (!verifyApplicationHandoffToken({
      token: body.token,
      userId: candidate.user_id,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      state: body.state,
      codeVerifier: body.code_verifier,
      storedExpiresAt: candidate.expires_at,
      signingKey: getServiceRoleKey(),
    })) {
      return apiError(requestId, "INVALID_APPLICATION_HANDOFF", "This sign-in handoff is invalid or expired. Please start again.", 401);
    }

    const { data: consumedRaw, error: consumeError } = await privileged
      .rpc("consume_temporary_login_token", { p_token_hash: tokenHash })
      .maybeSingle();
    const consumed = consumedRaw as { user_id: string; email: string; token_id?: string } | null;
    if (consumeError || !consumed?.user_id || !consumed.email || consumed.user_id !== candidate.user_id) {
      return apiError(requestId, "INVALID_APPLICATION_HANDOFF", "This sign-in handoff is invalid or expired. Please start again.", 401);
    }

    const { data: linkData, error: linkError } = await privileged.auth.admin.generateLink({
      type: "magiclink",
      email: consumed.email,
    });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      console.error("[APPLICATION_HANDOFF_MAGIC_LINK_ERROR]", linkError);
      return apiError(requestId, "APPLICATION_HANDOFF_FAILED", "The application session could not be created. Please sign in again.", 502);
    }

    const supabase = await createClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });
    if (sessionError || !sessionData.session || sessionData.user?.id !== consumed.user_id) {
      console.error("[APPLICATION_HANDOFF_SESSION_ERROR]", sessionError);
      return apiError(requestId, "APPLICATION_HANDOFF_FAILED", "The application session could not be created. Please sign in again.", 502);
    }

    logAuthSessionShape(request, "central_application_handoff", sessionData.session);
    return apiSuccess({
      user: { id: consumed.user_id, email: consumed.email },
      session: sessionData.session,
      login_method: "central_application_handoff",
    }, requestId);
  } catch (error) {
    console.error("[APPLICATION_HANDOFF_REDEEM_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "APPLICATION_HANDOFF_FAILED", "The application session could not be created. Please sign in again.", 502);
  }
}
