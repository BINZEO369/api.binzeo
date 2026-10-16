import { describe, expect, it } from "vitest";
import {
  getPlatformClient,
  getPlatformProject,
  getProviderSecretRefs,
  publicPlatformCatalog,
} from "@/modules/platform/registry";

describe("platform project catalog", () => {
  it("models BINZEO as a platform with frontend and admin clients", () => {
    expect(getPlatformProject("binzeo")?.clients.map((client) => client.key)).toEqual(["auth", "admin"]);
    expect(getPlatformClient("binzeo", "admin")?.type).toBe("admin");
  });

  it("rejects arbitrary project keys and unsafe provider lookups", () => {
    expect(getPlatformProject("https://attacker.example")).toBeUndefined();
    expect(getPlatformProject("JABIYEN")).toBeUndefined();
    expect(getProviderSecretRefs("binzeo", "google")?.secretEnvVar).toBe("GOOGLE_CLIENT_SECRET");
  });

  it("never exposes provider environment references in public metadata", () => {
    const serialized = JSON.stringify(publicPlatformCatalog());
    expect(serialized).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(serialized).not.toContain("FACEBOOK_CLIENT_SECRET");
    expect(serialized).toContain("BINZEO Platform");
  });
});
