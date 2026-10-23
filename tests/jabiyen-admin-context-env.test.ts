import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "JABIYEN_SUPABASE_URL",
  "JABIYEN_SUPABASE_SERVICE_ROLE_KEY",
  "JABIYEN_SUPABASE_ANON_KEY",
] as const;
const previousValues = new Map<string, string | undefined>();

for (const name of envNames) previousValues.set(name, process.env[name]);

afterEach(() => {
  for (const name of envNames) {
    const value = previousValues.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.resetModules();
});

describe("JABIYEN admin database configuration", () => {
  it("does not require database secrets while importing build-time modules", async () => {
    for (const name of envNames) delete process.env[name];
    vi.resetModules();

    const context = await import("../src/admin/jabiyen/admin-context");

    expect(context.supabase).toBeDefined();
    expect(() => context.supabase.from("orders")).toThrow("JABIYEN database environment is not configured");
    expect(() => context.createJabiyenAuthClient()).toThrow("JABIYEN database environment is not configured");
  });
});
