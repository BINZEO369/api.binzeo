import { createHash, randomBytes } from "node:crypto";

type HandoffTokenInput = {
  userId: string;
  ipAddress: string;
  userAgent: string | null;
  now?: number;
};

export function isPasskeyHandoffOriginAllowed(
  requestOrigin: string | null,
  expectedOrigin: string,
) {
  if (!requestOrigin) return false;
  try {
    return requestOrigin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export function createPasskeyHandoffToken({
  userId,
  ipAddress,
  userAgent,
  now = Date.now(),
}: HandoffTokenInput) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return {
    token,
    record: {
      user_id: userId,
      token_hash: tokenHash,
      token_preview: `${token.slice(0, 8)}…${token.slice(-6)}`,
      duration_minutes: 1,
      expires_at: new Date(now + 60_000).toISOString(),
      created_ip: ipAddress,
      created_user_agent: userAgent,
    },
  };
}
