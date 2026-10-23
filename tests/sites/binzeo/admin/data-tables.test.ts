import { describe, expect, it } from "vitest";
import { DATA_TABLES, getTableDefinition } from "@/sites/binzeo/admin/data-tables";
import { getPrivacyAnalyticsColumns, PRIVACY_ANALYTICS_COLUMNS } from "@/sites/binzeo/admin/privacy-analytics/columns";
import { getPrivacyAnalyticsTable, PRIVACY_ANALYTICS_TABLES } from "@/sites/binzeo/admin/privacy-analytics/tables";

describe("admin data table allowlists", () => {
  it("has unique slugs and only resolves registered tables", () => {
    const slugs = DATA_TABLES.map((table) => table.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(getTableDefinition("profiles")?.table).toBe("profiles");
    expect(getTableDefinition("profiles")?.columns).toContain("binzeo_user_id");
    expect(getTableDefinition("unknown-client-table")).toBeUndefined();
  });

  it("keeps credential/challenge bytes out of the table browser projection", () => {
    const passkeyChallenge = getTableDefinition("passkey-challenges");
    const temporaryTokens = getTableDefinition("temporary-login-tokens");
    expect(passkeyChallenge?.columns).not.toContain("challenge");
    expect(passkeyChallenge?.columns).not.toContain("challenge_hash");
    expect(temporaryTokens?.columns).not.toContain("token_hash");
    expect(temporaryTokens?.columns).not.toContain("token_preview");
  });

  it("requires both a registered privacy table and a non-empty central column projection", () => {
    expect(new Set(PRIVACY_ANALYTICS_TABLES.map((table) => table.name)).size).toBe(PRIVACY_ANALYTICS_TABLES.length);
    for (const table of PRIVACY_ANALYTICS_TABLES) {
      expect(getPrivacyAnalyticsTable(table.name)).toBeDefined();
      expect(getPrivacyAnalyticsColumns(table.name).length).toBeGreaterThan(0);
      expect(PRIVACY_ANALYTICS_COLUMNS[table.name]).toEqual(getPrivacyAnalyticsColumns(table.name));
    }
    expect(getPrivacyAnalyticsTable("not-registered")).toBeUndefined();
    expect(getPrivacyAnalyticsColumns("not-registered")).toEqual([]);
  });
});
