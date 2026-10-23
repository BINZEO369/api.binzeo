import { describe, expect, it } from "vitest";
import { getProject, publicProjectList, PROJECT_REGISTRY } from "@/platform/registry/project-registry";

describe("central project registry", () => {
  it("contains only the current auth and admin applications", () => {
    expect(Object.keys(PROJECT_REGISTRY).sort()).toEqual(["admin", "auth"]);
  });

  it("rejects unknown keys instead of accepting arbitrary database targets", () => {
    expect(getProject("jabiyen")).toBeUndefined();
    expect(getProject("https://attacker.example")).toBeUndefined();
  });

  it("maps both current applications to the same allowlisted database reference", () => {
    expect(getProject("auth")?.databaseRef).toBe("auth");
    expect(getProject("admin")?.databaseRef).toBe("auth");
  });

  it("exposes no secret values in public registry metadata", () => {
    const serialized = JSON.stringify(publicProjectList());
    expect(serialized).not.toContain("SERVICE_ROLE_KEY");
    expect(serialized).not.toContain("YOUR_PROJECT");
    expect(publicProjectList()).toHaveLength(2);
  });
});
