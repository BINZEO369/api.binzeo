import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getIdentityEnv, getServiceRoleKey } from "@/lib/env";

export function createPublicClient(): SupabaseClient {
  const { AUTH_SUPABASE_URL, AUTH_SUPABASE_ANON_KEY } = getIdentityEnv();
  return createClient(AUTH_SUPABASE_URL, AUTH_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export function createUserScopedClient(accessToken: string): SupabaseClient {
  const { AUTH_SUPABASE_URL, AUTH_SUPABASE_ANON_KEY } = getIdentityEnv();
  return createClient(AUTH_SUPABASE_URL, AUTH_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Call only after server-side role/permission checks have succeeded. */
export function createPrivilegedClient(): SupabaseClient {
  const { AUTH_SUPABASE_URL } = getIdentityEnv();
  return createClient(AUTH_SUPABASE_URL, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
