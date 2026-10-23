import { describe, expect, it } from "vitest";
import { isRegisteredRedirectUriAllowed, parseRegisteredOAuthClientId } from "@/binzeo/auth/oauth-client-registry";

describe("registered Central OAuth clients", () => {
  it("parses project-scoped client IDs", () => {
    expect(parseRegisteredOAuthClientId("jabiyen:website")).toEqual({ projectKey: "jabiyen", clientKey: "website" });
    expect(parseRegisteredOAuthClientId("jabiyen:sub-site-2")).toEqual({ projectKey: "jabiyen", clientKey: "sub-site-2" });
  });

  it("rejects malformed or unscoped client IDs", () => {
    for (const clientId of ["admin", "jabiyen", "jabiyen:website:admin", "JABIYEN:website", "jabiyen:website/other", "jabiyen:"]) {
      expect(parseRegisteredOAuthClientId(clientId)).toBeNull();
    }
  });

  it("allows only an exact registered callback, never an origin or prefix match", () => {
    const client = { redirect_uris: ["https://jabiyen-website.vercel.app/auth/callback"] };
    expect(isRegisteredRedirectUriAllowed(client, "https://jabiyen-website.vercel.app/auth/callback")).toBe(true);
    expect(isRegisteredRedirectUriAllowed(client, "https://jabiyen-website.vercel.app/auth/callback/evil")).toBe(false);
    expect(isRegisteredRedirectUriAllowed(client, "https://jabiyen-website.vercel.app/other")).toBe(false);
    expect(isRegisteredRedirectUriAllowed(client, "https://attacker.example/auth/callback")).toBe(false);
  });

  it("rejects insecure registered callbacks outside local development", () => {
    const remoteHttp = { redirect_uris: ["http://shop.example.com/auth/callback"] };
    const localHttp = { redirect_uris: ["http://localhost:3000/auth/callback"] };
    expect(isRegisteredRedirectUriAllowed(remoteHttp, "http://shop.example.com/auth/callback")).toBe(false);
    expect(isRegisteredRedirectUriAllowed(localHttp, "http://localhost:3000/auth/callback")).toBe(true);
  });
});
