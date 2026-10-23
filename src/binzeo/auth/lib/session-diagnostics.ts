import type { NextRequest } from "next/server";

/** Log session field shape only; never log access/refresh token values or user identifiers. */
export function logAuthSessionShape(
  request: NextRequest,
  method: string,
  session: unknown,
) {
  const value =
    session && typeof session === "object" && !Array.isArray(session)
      ? (session as Record<string, unknown>)
      : null;
  const accessToken = value?.access_token ?? value?.accessToken;
  const refreshToken = value?.refresh_token ?? value?.refreshToken;

  console.info("[AUTH_SESSION_SHAPE]", {
    requestId: request.headers.get("x-request-id"),
    method,
    sessionType: session === null ? "null" : typeof session,
    accessTokenType: typeof accessToken,
    accessTokenLength: typeof accessToken === "string" ? accessToken.length : null,
    refreshTokenType: typeof refreshToken,
    refreshTokenLength: typeof refreshToken === "string" ? refreshToken.length : null,
  });
}
