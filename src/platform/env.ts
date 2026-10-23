import "server-only";
import { z } from "zod";

const identityEnvSchema = z.object({
  AUTH_SUPABASE_URL: z.string().url(),
  AUTH_SUPABASE_ANON_KEY: z.string().min(1),
});

export function getIdentityEnv() {
  const parsed = identityEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Identity service is not configured: ${missing}`);
  }
  return parsed.data;
}

export function getServiceRoleKey() {
  const value = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Privileged database operation is not configured");
  return value;
}

export function getAllowedOrigins(): Set<string> {
  const values = (process.env.API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = new Set(values);

  // Current deployed app origins; future/custom origins are added through Vercel env.
  origins.add("https://auth-binzeo.vercel.app");
  origins.add("https://admin-binzeo.vercel.app");
  origins.add("https://jabiyen-website.vercel.app");
  origins.add("https://jabiyen-admin.vercel.app");
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid API_ALLOWED_ORIGINS entry: ${origin}`);
    }
    if (parsed.origin !== origin || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")) {
      throw new Error(`Invalid API_ALLOWED_ORIGINS entry: ${origin}`);
    }
  }
  return origins;
}
