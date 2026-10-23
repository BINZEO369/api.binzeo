import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";
import { createPublicClient } from "@/common/database/supabase/clients";
import { consumeRateLimit } from "@/common/security/rate-limit";
import { getRegisteredOAuthClient, isRegisteredRedirectUriAllowed } from "@/binzeo/auth/oauth-client-registry";


function adminCallback(): string | null {
  const base = process.env.ADMIN_APP_URL;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return `${url.origin}/auth/callback`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const clientId = request.nextUrl.searchParams.get("client_id") ?? "";
  const redirectUri = request.nextUrl.searchParams.get("redirect_uri") ?? "";
  if (!clientId || clientId.length > 128 || !redirectUri || redirectUri.length > 2048) {
    return apiError(requestId, "INVALID_REQUEST", "Invalid application sign-in request.", 400);
  }

  let publicClient;
  try { publicClient = createPublicClient(); }
  catch { return apiError(requestId, "SERVICE_NOT_CONFIGURED", "Authentication service is not configured.", 503); }
  const rate = await consumeRateLimit(publicClient, request, "oauth-client-metadata", 30);
  if (!rate.allowed) {
    if ("unavailable" in rate) return apiError(requestId, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.", 503);
    return apiError(requestId, "RATE_LIMITED", "Too many application sign-in requests.", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  try {
    if (clientId === "admin") {
      if (redirectUri !== adminCallback()) {
        return apiError(requestId, "REDIRECT_URI_MISMATCH", "The return address is not registered for this application.", 400);
      }
      return apiSuccess({ client_id: "admin", client_name: "BINZEO Admin", brand_name: "BINZEO", project_name: "BINZEO Admin", logo_url: "https://auth-binzeo.vercel.app/logo.svg" }, requestId);
    }
    const client = await getRegisteredOAuthClient(clientId);
    if (!client) return apiError(requestId, "OAUTH_CLIENT_NOT_FOUND", "This application is not registered for Central Auth sign-in.", 404);
    if (!isRegisteredRedirectUriAllowed(client, redirectUri)) {
      return apiError(requestId, "REDIRECT_URI_MISMATCH", "The return address is not registered for this application.", 400);
    }
    return apiSuccess({
      client_id: client.client_id,
      client_name: client.client_name,
      brand_name: client.brand_name,
      project_name: client.project_name,
      logo_url: client.logo_url,
    }, requestId);
  } catch (error) {
    console.error("[OAUTH_CLIENT_METADATA_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "AUTHORIZATION_UNAVAILABLE", "Application sign-in details are temporarily unavailable.", 503);
  }
}
