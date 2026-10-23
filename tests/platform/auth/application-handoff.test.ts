import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createApplicationHandoffToken,
  isApplicationHandoffToken,
  sha256ApplicationHandoffToken,
  verifyApplicationHandoffToken,
} from "@/platform/auth/application-handoff";

const signingKey = "test-only-handoff-signing-key";
const codeVerifier = "A".repeat(43);
const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
const baseInput = {
  userId: "user-123",
  clientId: "storefront:website",
  redirectUri: "https://shop.example.com/auth/callback",
  state: "S".repeat(43),
  codeChallenge,
  ipAddress: "203.0.113.4",
  userAgent: "test-agent",
  signingKey,
  now: Date.parse("2026-10-17T04:00:00.000Z"),
};

describe("Central application handoff", () => {
  it("stores only the token hash and expires after one minute", () => {
    const handoff = createApplicationHandoffToken(baseInput);
    expect(isApplicationHandoffToken(handoff.token)).toBe(true);
    expect(handoff.record.user_id).toBe(baseInput.userId);
    expect(handoff.record.token_hash).toBe(sha256ApplicationHandoffToken(handoff.token));
    expect(handoff.record.token_preview).not.toBe(handoff.token);
    expect(handoff.record.token_preview).toBe(`${handoff.token.slice(0, 8)}…${handoff.token.slice(-6)}`);
    expect(handoff.record.duration_minutes).toBe(1);
    expect(handoff.record.expires_at).toBe("2026-10-17T04:01:00.000Z");
    expect(handoff.expiresAtMs).toBe(Date.parse(handoff.record.expires_at));
    expect(handoff.record.created_ip).toBe(baseInput.ipAddress);
    expect(handoff.record.created_user_agent).toBe(baseInput.userAgent);
  });

  it("accepts a matching user, client, callback, state and PKCE verifier", () => {
    const handoff = createApplicationHandoffToken(baseInput);
    expect(verifyApplicationHandoffToken({
      token: handoff.token,
      userId: baseInput.userId,
      clientId: baseInput.clientId,
      redirectUri: baseInput.redirectUri,
      state: baseInput.state,
      codeVerifier,
      storedExpiresAt: handoff.record.expires_at,
      signingKey,
      now: baseInput.now + 30_000,
    })).toBe(true);
  });

  it.each([
    ["user", { userId: "another-user" }],
    ["client", { clientId: "another:website" }],
    ["callback", { redirectUri: "https://attacker.example/callback" }],
    ["state", { state: "T".repeat(43) }],
    ["verifier", { codeVerifier: "B".repeat(43) }],
    ["stored expiry", { storedExpiresAt: "2026-10-17T04:02:00.000Z" }],
    ["signing key", { signingKey: "different-key" }],
  ])("rejects a mismatched %s", (_label, overrides) => {
    const handoff = createApplicationHandoffToken(baseInput);
    expect(verifyApplicationHandoffToken({
      token: handoff.token,
      userId: baseInput.userId,
      clientId: baseInput.clientId,
      redirectUri: baseInput.redirectUri,
      state: baseInput.state,
      codeVerifier,
      storedExpiresAt: handoff.record.expires_at,
      signingKey,
      now: baseInput.now + 10_000,
      ...overrides,
    })).toBe(false);
  });

  it("rejects expired, malformed and tampered tickets", () => {
    const handoff = createApplicationHandoffToken(baseInput);
    const verify = (token: string, now = baseInput.now + 10_000) => verifyApplicationHandoffToken({
      token,
      userId: baseInput.userId,
      clientId: baseInput.clientId,
      redirectUri: baseInput.redirectUri,
      state: baseInput.state,
      codeVerifier,
      storedExpiresAt: handoff.record.expires_at,
      signingKey,
      now,
    });
    expect(verify(handoff.token, baseInput.now + 60_000)).toBe(false);
    const signatureStart = handoff.token.lastIndexOf(".") + 1;
    const firstSignatureCharacter = handoff.token[signatureStart];
    const tamperedSignature = `${handoff.token.slice(0, signatureStart)}${firstSignatureCharacter === "A" ? "B" : "A"}${handoff.token.slice(signatureStart + 1)}`;
    expect(verify(tamperedSignature)).toBe(false);
    expect(verify("not-a-handoff-token")).toBe(false);
  });

  it("rejects malformed state or PKCE challenge at issue time", () => {
    expect(() => createApplicationHandoffToken({ ...baseInput, state: "short" })).toThrow();
    expect(() => createApplicationHandoffToken({ ...baseInput, codeChallenge: "invalid" })).toThrow();
  });
});
