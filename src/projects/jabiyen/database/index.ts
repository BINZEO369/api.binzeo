import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let publicClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function getJabiyenPublicDatabase() {
  if (!publicClient) {
    const url = process.env.JABIYEN_SUPABASE_URL;
    const key = process.env.JABIYEN_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("JABIYEN public database is not configured");
    publicClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return publicClient;
}

export function getJabiyenAdminDatabase() {
  if (!adminClient) {
    const url = process.env.JABIYEN_SUPABASE_URL;
    const key = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("JABIYEN admin database is not configured");
    adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return adminClient;
}
