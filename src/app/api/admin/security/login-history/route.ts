import { getAdminApiContext, getAdminDataClient, hasAdminPermission } from "@/modules/admin/lib/admin";
import { fail, ok } from "@/modules/admin/lib/api/response";

export const dynamic = "force-dynamic";
export async function GET() {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!hasAdminPermission(access, "auth.read")) return fail("Authentication read permission required", 403, "AUTH_READ_REQUIRED");
  try {
    const db = await getAdminDataClient(access);
    const { data, error } = await db.from("user_login_history").select("id,user_id,login_method,login_status,ip_address,country,city,login_at").order("login_at", { ascending: false }).limit(200);
    if (error) return fail("Login history could not be loaded", 500, "LOGIN_HISTORY_FAILED");
    return ok({ events: data ?? [] });
  } catch {
    return fail("Login history could not be loaded", 500, "LOGIN_HISTORY_FAILED");
  }
}
