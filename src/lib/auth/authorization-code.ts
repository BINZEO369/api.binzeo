import "server-only";
import { timingSafeEqual } from "node:crypto";

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(value.byteLength);
  result.set(value);
  return result;
}

export function createOpaqueCode(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function codeHash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Buffer.from(digest).toString("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getEncryptionKey(): Uint8Array<ArrayBuffer> {
  const value = process.env.CENTRAL_OAUTH_ENCRYPTION_KEY;
  if (!value) throw new Error("OAuth encryption key is not configured");
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) throw new Error("OAuth encryption key must be base64 for exactly 32 bytes");
  return ownedBytes(key);
}

export async function encryptSession(session: { access_token: string; refresh_token: string }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", getEncryptionKey(), { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: base64Url(iv), ciphertext: base64Url(new Uint8Array(ciphertext)) };
}

export async function decryptSession(ivText: string, ciphertextText: string): Promise<{ access_token: string; refresh_token: string }> {
  const iv = ownedBytes(Buffer.from(ivText, "base64url"));
  const ciphertext = ownedBytes(Buffer.from(ciphertextText, "base64url"));
  const key = await crypto.subtle.importKey("raw", getEncryptionKey(), { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!parsed || typeof parsed !== "object" || !("access_token" in parsed) || !("refresh_token" in parsed)) {
    throw new Error("Invalid encrypted OAuth session payload");
  }
  const session = parsed as { access_token: unknown; refresh_token: unknown };
  if (typeof session.access_token !== "string" || typeof session.refresh_token !== "string") {
    throw new Error("Invalid encrypted OAuth session payload");
  }
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}
