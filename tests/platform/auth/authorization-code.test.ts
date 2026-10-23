import { beforeEach, describe, expect, it } from "vitest";
import { codeHash, createOpaqueCode, decryptSession, encryptSession, safeEqual, sha256Base64Url } from "@/platform/auth/authorization-code";

beforeEach(() => {
  process.env.CENTRAL_OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("central SSO code primitives", () => {
  it("creates high-entropy URL-safe authorization codes and stable hashes", async () => {
    const code = createOpaqueCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await codeHash(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(await codeHash(code)).toBe(await codeHash(code));
  });

  it("encrypts and decrypts session tokens without storing them in plain text", async () => {
    const session = { access_token: "access-token-test", refresh_token: "refresh-token-test" };
    const encrypted = await encryptSession(session);
    expect(encrypted.ciphertext).not.toContain(session.access_token);
    expect(await decryptSession(encrypted.iv, encrypted.ciphertext)).toEqual(session);
  });

  it("rejects tampering with encrypted session payload", async () => {
    const encrypted = await encryptSession({ access_token: "a", refresh_token: "b" });
    const first = encrypted.ciphertext[0] === "A" ? "B" : "A";
    const tampered = `${first}${encrypted.ciphertext.slice(1)}`;
    await expect(decryptSession(encrypted.iv, tampered)).rejects.toThrow();
  });

  it("computes a URL-safe PKCE challenge and compares in constant time", async () => {
    const challenge = await sha256Base64Url("a-valid-verifier-with-more-than-forty-three-characters");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(safeEqual(challenge, challenge)).toBe(true);
    expect(safeEqual(challenge, `${challenge}x`)).toBe(false);
  });
});
