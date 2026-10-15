import { getAdminApiContext, getAdminDataClient } from "@/modules/admin/lib/admin";
import { fail, ok } from "@/modules/admin/lib/api/response";

export const dynamic = "force-dynamic";
const MAX_EVENTS = 10_000;

export async function GET() {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  try {
    const db = await getAdminDataClient(access);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 89);
    cutoff.setHours(0, 0, 0, 0);
    const cutoffISO = cutoff.toISOString();
    const countTables = ["profiles", "user_login_history", "user_activity_logs", "admin_activity_logs"] as const;
    const [counts, logins, userActivity, adminActivity, profiles] = await Promise.all([
      Promise.all(countTables.map((table) => db.from(table).select("id", { count: "exact", head: true }))),
      db.from("user_login_history").select("created_at,user_id").gte("created_at", cutoffISO).order("created_at", { ascending: false }).limit(MAX_EVENTS),
      db.from("user_activity_logs").select("created_at,user_id").gte("created_at", cutoffISO).order("created_at", { ascending: false }).limit(MAX_EVENTS),
      db.from("admin_activity_logs").select("created_at,user_id:admin_user_id").gte("created_at", cutoffISO).order("created_at", { ascending: false }).limit(MAX_EVENTS),
      db.from("profiles").select("created_at").gte("created_at", cutoffISO).order("created_at", { ascending: false }).limit(MAX_EVENTS),
    ]);
    const queryError = counts.find((item) => item.error)?.error ?? logins.error ?? userActivity.error ?? adminActivity.error ?? profiles.error;
    if (queryError) return fail("Dashboard analytics could not be loaded", 500, "DASHBOARD_SUMMARY_FAILED");
    return ok({
      counts: counts.map((item) => item.count ?? 0),
      login_rows: logins.data ?? [],
      user_activity_rows: userActivity.data ?? [],
      admin_activity_rows: adminActivity.data ?? [],
      profile_rows: profiles.data ?? [],
      event_limit: MAX_EVENTS,
    });
  } catch {
    return fail("Dashboard analytics could not be loaded", 500, "DASHBOARD_SUMMARY_FAILED");
  }
}
