import { z } from "zod";
import { apiError, apiSuccess } from "@/platform/http/response";
import { getRequestId } from "@/platform/http/request-id";
import { authenticateBearerToken } from "@/platform/auth/identity";
import { getRegisteredOAuthClient, isRegisteredRedirectUriAllowed } from "@/platform/auth/oauth-client-registry";
import { createApplicationHandoffToken } from "@/platform/auth/application-handoff";
import { createPrivilegedClient, createPublicClient } from "@/platform/database/supabase/clients";
import { getServiceRoleKey } from "@/platform/env";
import { consumeRateLimit } from "@/platform/security/rate-limit";


const clientIdPattern = /^(?:[a-z0-9][a-z0-9-]{0,62}:[a-z0-9][a-z0-9-]{0,62})$/;
const bodySchema = z.object({
  client_id: z.string().regex(clientIdPattern),
  redirect_uri: z.string().url().max(2048),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

function requestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "0.0.0.0";
}

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

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return apiError(requestId, "INVALID_REQUEST", "Invalid application handoff request.", 400); }
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
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
  const rate = await consumeRateLimit(publicClient, request, "application-handoff-issue", 20);
  if (!rate.allowed) {
    if ("unavailable" in rate) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many application handoff attempts.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const auth = await authenticateBearerToken(request);
  if (!auth.ok) return apiError(requestId, auth.code, auth.message, auth.status);

  let clientStatus: Awaited<ReturnType<typeof validateClient>>;
  try { clientStatus = await validateClient(body.client_id, body.redirect_uri); }
  catch { return apiError(requestId, "APPLICATION_HANDOFF_UNAVAILABLE", "Application sign-in is temporarily unavailable.", 503); }
  if (clientStatus === "not_found") return apiError(requestId, "OAUTH_CLIENT_NOT_FOUND", "This application is not registered for Central Auth sign-in.", 404);
  if (clientStatus === "admin_client") return apiError(requestId, "HANDOFF_NOT_SUPPORTED", "Administrative applications must use the secured authorization-code flow.", 403);
  if (clientStatus !== "allowed") return apiError(requestId, "REDIRECT_URI_MISMATCH", "The redirect URI is not allowlisted.", 400);

  try {
    const handoff = createApplicationHandoffToken({
      userId: auth.identity.user.id,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      state: body.state,
      codeChallenge: body.code_challenge,
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
      signingKey: getServiceRoleKey(),
    });
    const privileged = createPrivilegedClient();
    const { error } = await privileged.from("temporary_login_tokens").insert(handoff.record);
    if (error) {
      console.error("[APPLICATION_HANDOFF_INSERT_ERROR]", { code: error.code });
      return apiError(requestId, "APPLICATION_HANDOFF_UNAVAILABLE", "Sign-in could not be completed. Please retry.", 503);
    }

    callback.hash = new URLSearchParams({ handoff_token: handoff.token, state: body.state }).toString();
    return apiSuccess({ redirect_url: callback.toString(), expires_in: 60 }, requestId);
  } catch (error) {
    console.error("[APPLICATION_HANDOFF_ISSUE_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "APPLICATION_HANDOFF_UNAVAILABLE", "Sign-in could not be completed. Please retry.", 503);
  }
}
