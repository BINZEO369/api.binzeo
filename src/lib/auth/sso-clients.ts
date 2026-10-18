import "server-only";

export type SsoClientId = "admin" | "jabiyen";

const CURRENT_JABIYEN_CALLBACKS = [
  "https://jabiyen-website.vercel.app/auth/callback",
] as const;

export function expectedSsoCallback(clientId: SsoClientId): string | null {
  const configuredBase = clientId === "admin" ? process.env.ADMIN_APP_URL : null;

  if (configuredBase) {
    try {
      const url = new URL(configuredBase);
      if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
      return `${url.origin}/auth/callback`;
    } catch {
      return null;
    }
  }

  if (clientId === "jabiyen") return CURRENT_JABIYEN_CALLBACKS[0];
  return null;
}

export function isRegisteredSsoCallback(clientId: SsoClientId, redirectUri: string): boolean {
  const expected = expectedSsoCallback(clientId);
  if (expected === redirectUri) return true;
  if (clientId === "jabiyen") return (CURRENT_JABIYEN_CALLBACKS as readonly string[]).includes(redirectUri);
  return false;
}
