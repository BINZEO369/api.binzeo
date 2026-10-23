import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeRoot = path.join(root, "src/app");
const output = path.join(root, "src/binzeo/openapi.generated.json");
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(target));
    else if (entry.name === "route.ts") found.push(target);
  }
  return found;
}

function apiPath(file) {
  const relative = path.relative(routeRoot, path.dirname(file)).split(path.sep)
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  const apiIndex = relative.indexOf("api");
  const routeSegments = apiIndex >= 0 ? relative.slice(apiIndex + 1) : relative;
  const segments = routeSegments.map((segment) => segment
    .replace(/^\[\.\.\.(.+)\]$/, "{$1}")
    .replace(/^\[(.+)\]$/, "{$1}"));
  if (apiIndex < 0 && segments[0] !== "v1") return null;
  if (apiIndex < 0 || segments[0] === "v1") return `/${segments.join("/")}`;
  return `/v1${segments.length ? `/${segments.join("/")}` : ""}`;
}

function exportedMethods(source) {
  const found = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) found.add(match[1]);
  for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)) found.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g)) {
    for (const item of match[1].split(",")) {
      const exportedName = item.trim().split(/\s+as\s+/i).at(-1);
      if (methods.has(exportedName)) found.add(exportedName);
    }
  }
  return [...found];
}

function tagFor(route) {
  if (route.startsWith("/v1/projects/jabiyen/admin/")) return "jabiyen-admin";
  if (route.startsWith("/v1/projects/jabiyen/public/")) return "jabiyen-public";
  return route.split("/").filter(Boolean)[1] ?? "system";
}

function needsBearer(route) {
  if (route === "/v1/auth/token") return false;
  if (route === "/v1/payments/stripe/webhook") return false;
  if (route.startsWith("/v1/payments/")) return true;
  if (route === "/v1/projects/jabiyen/admin/admin/login") return false;
  if (route.startsWith("/v1/projects/jabiyen/admin/")) return true;
  if (route.startsWith("/v1/projects/jabiyen/public/")) return false;
  if (["/v1/auth/login", "/v1/auth/signup", "/v1/auth/check-email", "/v1/auth/check-username", "/v1/auth/google", "/v1/auth/google/callback", "/v1/auth/google/complete", "/v1/auth/google/setup", "/v1/auth/passkey/options", "/v1/auth/passkey/verify", "/v1/auth/password-reset/request", "/v1/auth/password-reset/verify", "/v1/auth/temporary-login", "/v1/auth/two-factor/verify", "/v1/auth/authorize"].includes(route)) return route === "/v1/auth/authorize";
  if (route.startsWith("/v1/public/")) return false;
  if (["/v1/countries", "/v1/sectors", "/v1/privacy/events", "/v1/privacy/consent"].includes(route)) return false;
  return route === "/v1/me" || route.startsWith("/v1/me/") || route.startsWith("/v1/admin/") || route.startsWith("/v1/user/") || route.startsWith("/v1/profile/") || route.startsWith("/v1/internal/");
}

const paths = {};
const files = (await walk(routeRoot)).sort();
for (const file of files) {
  const source = await readFile(file, "utf8");
  const route = apiPath(file);
  if (!route) continue;
  const exported = exportedMethods(source);
  if (!exported.length) throw new Error(`No HTTP method export found in route adapter: ${path.relative(root, file)}`);
  paths[route] ??= {};
  for (const method of exported) {
    if (!methods.has(method)) continue;
    const security = needsBearer(route) ? [{ bearerAuth: [] }] : [];
    paths[route][method.toLowerCase()] = {
      operationId: `${method.toLowerCase()}_${route.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      tags: [tagFor(route)],
      summary: `${method} ${route}`,
      ...(security.length ? { security } : {}),
      responses: {
        "200": { description: "Request succeeded." },
        "400": { description: "Invalid request." },
        "401": { description: "Authentication required or invalid." },
        "403": { description: "Permission denied." },
        "429": { description: "Rate limit exceeded." },
        "500": { description: "Unexpected server error." },
      },
    };
  }
}

paths["/v1/health"] = { get: { operationId: "get_health", tags: ["system"], summary: "Liveness check", responses: { "200": { description: "Service is running." } } } };
paths["/v1/me"] = { get: { operationId: "get_me", tags: ["identity"], summary: "Verified current user and allowlisted profile", security: [{ bearerAuth: [] }], responses: { "200": { description: "Current user profile." }, "401": { description: "Authentication required." }, "403": { description: "Account inactive or unverified." } } } };
paths["/v1/openapi"] = { get: { operationId: "get_openapi", tags: ["system"], summary: "OpenAPI specification", responses: { "200": { description: "OpenAPI document." } } } };

const document = {
  openapi: "3.1.0",
  info: {
    title: "BINZEO Central API",
    version: "1.0.0",
    description: "Central, versioned backend contract for BINZEO identity, user, privacy, and administration services.",
  },
  servers: [{ url: "/" }],
  paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Supabase JWT" } } },
};
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Generated ${Object.keys(paths).length} OpenAPI paths from ${files.length} route files.`);
