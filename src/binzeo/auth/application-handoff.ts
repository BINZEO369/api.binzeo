import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const HANDOFF_TTL_MS = 60_000;
const HANDOFF_TOKEN_PATTERN = /^h1\.([A-Za-z0-9_-]{43})\.(\d{13})\.([A-Za-z0-9_-]{43})$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

type HandoffClaims = {
  nonce: string;
  expiresAtMs: number;
  userId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

export type ApplicationHandoffInput = {
  userId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  ipAddress: string;
  userAgent: string | null;
  signingKey: string;
  now?: number;
};

function claimsPayload(claims: HandoffClaims): string {
  return JSON.stringify([
    "binzeo-application-handoff-v1",
    claims.nonce,
    claims.expiresAtMs,
    claims.userId,
    claims.clientId,
    claims.redirectUri,
    claims.state,
    claims.codeChallenge,
  ]);
}

function signClaims(claims: HandoffClaims, signingKey: string): string {
  if (!signingKey) throw new Error("Application handoff signing key is not configured");
  return createHmac("sha256", signingKey).update(claimsPayload(claims)).digest("base64url");
}

export function createApplicationHandoffToken({
  userId,
  clientId,
  redirectUri,
  state,
  codeChallenge,
  ipAddress,
  userAgent,
  signingKey,
  now = Date.now(),
}: ApplicationHandoffInput) {
  if (!STATE_PATTERN.test(state) || !CHALLENGE_PATTERN.test(codeChallenge)) {
    throw new Error("Invalid state or PKCE challenge for application handoff");
  }
  const nonce = randomBytes(32).toString("base64url");
  const expiresAtMs = now + HANDOFF_TTL_MS;
  const claims: HandoffClaims = {
    nonce,
    expiresAtMs,
    userId,
    clientId,
    redirectUri,
    state,
    codeChallenge,
  };
  const signature = signClaims(claims, signingKey);
  const token = `h1.${nonce}.${expiresAtMs}.${signature}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return {
    token,
    expiresAtMs,
    record: {
      user_id: userId,
      token_hash: tokenHash,
      token_preview: `${token.slice(0, 8)}…${token.slice(-6)}`,
      duration_minutes: 1,
      expires_at: new Date(expiresAtMs).toISOString(),
      created_ip: ipAddress,
      created_user_agent: userAgent,
    },
  };
}

export function verifyApplicationHandoffToken(input: {
  token: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  storedExpiresAt: string;
  signingKey: string;
  now?: number;
}): boolean {
  const match = HANDOFF_TOKEN_PATTERN.exec(input.token);
  if (!match || !STATE_PATTERN.test(input.state) || !VERIFIER_PATTERN.test(input.codeVerifier)) return false;

  const [, nonce, expiresText, suppliedSignature] = match;
  const expiresAtMs = Number(expiresText);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= (input.now ?? Date.now())) return false;
  if (Date.parse(input.storedExpiresAt) !== expiresAtMs) return false;

  const codeChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  const claims: HandoffClaims = {
    nonce,
    expiresAtMs,
    userId: input.userId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge,
  };
  let expectedSignature: Buffer;
  let actualSignature: Buffer;
  try {
    expectedSignature = Buffer.from(signClaims(claims, input.signingKey), "base64url");
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return false;
  }
  return actualSignature.length === expectedSignature.length && timingSafeEqual(actualSignature, expectedSignature);
}

export function sha256ApplicationHandoffToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isApplicationHandoffToken(token: string): boolean {
  return HANDOFF_TOKEN_PATTERN.test(token);
}
