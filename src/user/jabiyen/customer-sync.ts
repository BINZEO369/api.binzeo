import "server-only";
import { createClient } from "@supabase/supabase-js";

type CentralUser = {
  id: string;
  email?: string | null;
};

type CentralProfile = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  username?: string | null;
  date_of_birth?: string | null;
  country_code?: string | null;
  account_status?: string | null;
};

let client: ReturnType<typeof createClient> | null = null;

function getJabiyenAdmin() {
  const url = process.env.JABIYEN_SUPABASE_URL;
  const key = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

/**
 * Mirrors Central Auth identity data into JABIYEN's application profile.
 * Central Auth remains the only source of authentication and credentials.
 */
export async function syncJabiyenCustomer(
  user: CentralUser,
  profile: CentralProfile | null | undefined,
) {
  const admin = getJabiyenAdmin();
  if (!admin) {
    console.warn("[JABIYEN_CUSTOMER_SYNC_SKIPPED] JABIYEN service credentials are not configured");
    return { synced: false, skipped: true };
  }

  const firstName = profile?.first_name?.trim() ?? "";
  const lastName = profile?.last_name?.trim() ?? "";
  const displayName = profile?.display_name?.trim() || [firstName, lastName].filter(Boolean).join(" ");
  const { error } = await admin.from("customer_profiles").upsert(
    {
      central_user_id: user.id,
      email: user.email ?? null,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      username: profile?.username ?? null,
      date_of_birth: profile?.date_of_birth ?? null,
      country_code: profile?.country_code ?? null,
      account_status: profile?.account_status ?? "active",
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "central_user_id" },
  );
  if (error) throw error;
  return { synced: true, skipped: false };
}
