import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPublicSiteUrl } from "@/sites/binzeo/auth/lib/email/transporter";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/^['"]|['"]$/g, "");
  const authOrigin = getPublicSiteUrl(req.headers);
  const expectedRedirectUri = new URL("/api/auth/google/callback", authOrigin).toString();
  const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  const redirectUri = configuredRedirectUri ? new URL(configuredRedirectUri).toString() : expectedRedirectUri;
  if (redirectUri !== expectedRedirectUri) {
    return NextResponse.redirect(new URL("/signin?error=google_redirect_mismatch", authOrigin));
  }
  if (!clientId) {
    return NextResponse.redirect(new URL("/signin?error=google_not_configured", authOrigin));
  }

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("access_type", "online");
  // Keep account selection and the explicit Google consent/Continue step.
  // `select_account` alone can immediately continue for an already-approved account.
  authorizationUrl.searchParams.set("prompt", "select_account consent");

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("binzeo_google_oauth_state", `${state}.${encodeURIComponent(next)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("binzeo_google_oauth_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
