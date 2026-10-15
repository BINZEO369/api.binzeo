import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;
const RESERVED = new Set(["admin", "api", "auth", "dashboard", "signin", "signup", "support", "security", "help", "www"]);

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function isValidUsername(value: string) {
  const normalized = normalizeUsername(value);
  return USERNAME_PATTERN.test(normalized) && !RESERVED.has(normalized);
}

export async function usernameExists(username: string) {
  const normalized = normalizeUsername(username);
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("id")
    .eq("username", normalized)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function suggestUsernames(input: string) {
  const base = normalizeUsername(input).replace(/[^a-z0-9_]/g, "").replace(/^[^a-z]+/, "").slice(0, 24) || "user";
  const candidates = [base, ...Array.from({ length: 9 }, (_, index) => `${base}${index + 1}`)];
  const { data, error } = await getSupabaseAdmin().from("profiles").select("username").in("username", candidates);
  if (error) throw error;
  const used = new Set((data ?? []).map((row) => String(row.username).toLowerCase()));
  return candidates.filter((candidate) => !used.has(candidate) && !RESERVED.has(candidate)).slice(0, 5);
}
