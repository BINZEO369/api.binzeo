import "server-only";

export const JABIYEN_PROJECT_KEY = "jabiyen" as const;
export const JABIYEN_DATABASE_URL = process.env.JABIYEN_SUPABASE_URL;
export const JABIYEN_PUBLIC_ORIGINS = [
  "https://www.jayenware.shop",
  "https://jayenware.shop",
] as const;

export function requireJabiyenDatabaseUrl() {
  if (!JABIYEN_DATABASE_URL) throw new Error("JABIYEN_SUPABASE_URL is not configured");
  return JABIYEN_DATABASE_URL;
}
