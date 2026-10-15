import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import document from "@/openapi.generated.json";

const routeRoot = path.resolve(process.cwd(), "src/app/api");
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const paths = document.paths as Record<string, Record<string, unknown>>;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : entry.name === "route.ts" ? [target] : [];
  });
}

function specPath(file: string) {
  const relative = path.relative(routeRoot, path.dirname(file)).split(path.sep).filter(Boolean);
  const segments = relative.map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}"));
  return `/v1${segments.length ? `/${segments.join("/")}` : ""}`;
}

describe("OpenAPI route coverage", () => {
  it("documents every central API route and exported method", () => {
    for (const file of walk(routeRoot)) {
      const source = readFileSync(file, "utf8");
      const route = specPath(file);
      expect(paths).toHaveProperty(route);
      for (const method of methods) {
        if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source)) {
          expect(paths[route]).toHaveProperty(method.toLowerCase());
        }
      }
    }
  });
});
