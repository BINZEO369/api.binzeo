import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let adminClient: ReturnType<typeof createSupabaseClient> | null = null;

/** Server-only client. Never import this module from a client component. */
export function createAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.AUTH_SUPABASE_URL;
  const serviceRoleKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin management");
  }
  adminClient = createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
