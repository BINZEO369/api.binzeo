/**
 * Restrict personal profile and address mutations to the first-party Central
 * Auth application. JABIYEN and other clients may still read these records.
 * In production, an absent Origin is rejected rather than treated as trusted.
 */
export function isCentralAuthManagementOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  const trustedOrigins = new Set<string>();
  trustedOrigins.add("https://auth-binzeo.vercel.app");
  const configuredAuthUrl = process.env.AUTH_APP_URL?.trim();
  if (configuredAuthUrl) {
    try {
      trustedOrigins.add(new URL(configuredAuthUrl).origin);
    } catch {
      return false;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    trustedOrigins.add("http://localhost:3000");
    trustedOrigins.add("http://127.0.0.1:3000");
  }

  return trustedOrigins.has(origin);
}
