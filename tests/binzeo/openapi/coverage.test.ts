import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import document from "@/binzeo/openapi.generated.json";

const routeRoot = path.resolve(process.cwd(), "src/app");
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const paths = document.paths as Record<string, Record<string, unknown>>;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : entry.name === "route.ts" ? [target] : [];
  });
}

function specPath(file: string) {
  const relative = path.relative(routeRoot, path.dirname(file)).split(path.sep)
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  const apiIndex = relative.indexOf("api");
  const routeSegments = apiIndex >= 0 ? relative.slice(apiIndex + 1) : relative;
  const segments = routeSegments.map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}"));
  if (apiIndex < 0 && segments[0] !== "v1") return null;
  if (apiIndex < 0 || segments[0] === "v1") return `/${segments.join("/")}`;
  return `/v1${segments.length ? `/${segments.join("/")}` : ""}`;
}

function exportedMethods(source: string) {
  const found = new Set<string>();
  for (const method of methods) {
    if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source)
      || new RegExp(`export\\s+const\\s+${method}\\s*=`).test(source)) found.add(method);
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/i).at(-1);
      if (methods.includes(name as (typeof methods)[number])) found.add(name!);
    }
  }
  return found;
}

describe("OpenAPI route coverage", () => {
  it("documents every central API route and exported method", () => {
    for (const file of walk(routeRoot)) {
      const source = readFileSync(file, "utf8");
      const route = specPath(file);
      if (!route) continue;
      expect(paths).toHaveProperty(route);
      for (const method of exportedMethods(source)) expect(paths[route]).toHaveProperty(method.toLowerCase());
    }
    expect(paths).not.toHaveProperty("/v1/v1/projects/jabiyen/public/{path}");
    expect(paths["/v1/projects/jabiyen/public/{path}"]).toHaveProperty("get");
    expect(paths["/v1/projects/jabiyen/admin/{path}"]).toHaveProperty("post");
    expect(paths["/v1/payments/checkout-sessions"].post).toHaveProperty("security");
    expect(paths["/v1/payments/requests/{requestId}"].get).toHaveProperty("security");
    expect(paths["/v1/payments/stripe/webhook"].post).not.toHaveProperty("security");
  });
});
