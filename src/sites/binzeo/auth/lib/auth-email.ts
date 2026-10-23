import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function emailAlreadyExists(email: string) {
  const normalized = normalizeEmail(email);
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;
    const users = data.users ?? [];
    if (users.some((user) => normalizeEmail(user.email ?? "") === normalized)) return true;
    if (users.length < PAGE_SIZE) return false;
  }
  // Fail closed if the project has more users than the safety bound.
  throw new Error("EMAIL_LOOKUP_INCOMPLETE");
}
