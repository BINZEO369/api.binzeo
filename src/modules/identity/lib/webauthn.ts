import { isoBase64URL } from "@simplewebauthn/server/helpers";

function forwardedOrigin(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!forwardedHost) return new URL(req.url).origin;
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${forwardedProto}://${forwardedHost.split(",")[0]?.trim()}`;
}

export function webauthnConfig(req: Request) {
  const origin = forwardedOrigin(req).replace(/\/+$/, "");
  const requestHost = new URL(origin).hostname;
  const configuredOrigin = process.env.AUTH_APP_URL?.trim();
  const configuredRpId = process.env.WEBAUTHN_RP_ID?.trim();
  const configuredHost = configuredRpId || (configuredOrigin ? new URL(configuredOrigin).hostname : "");
  const configuredHostApplies = Boolean(
    configuredHost &&
      (requestHost === configuredHost || requestHost.endsWith(`.${configuredHost}`)),
  );
  // WebAuthn only accepts an RP ID equal to the current host or its parent.
  // This keeps binzeo.com working while also supporting Vercel aliases.
  const rpID = configuredHostApplies ? configuredHost : requestHost;
  return { origin, rpID };
}

export function byteaFromBase64Url(value: string) {
  return `\\x${Buffer.from(value, "base64url").toString("hex")}`;
}

export function base64UrlFromBytea(value: unknown) {
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    return isoBase64URL.fromBuffer(Buffer.from(hex, "hex"));
  }
  if (value instanceof Uint8Array) return isoBase64URL.fromBuffer(value as Uint8Array<ArrayBuffer>);
  return "";
}
