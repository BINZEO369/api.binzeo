import { getAdminApiContext, getAdminDataClient, hasAdminPermission } from "@/modules/admin/lib/admin";
import { ok, fail } from "@/modules/admin/lib/api/response";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!hasAdminPermission(access, "users.read")) return fail("User read permission required", 403, "USERS_READ_REQUIRED");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80).replace(/[(),%_]/g, " ");
  const status = url.searchParams.get("status");
  if (status && !["active", "suspended"].includes(status)) return fail("Invalid account status", 400, "ACCOUNT_STATUS_INVALID");
  const db = await getAdminDataClient(access);
  let query = db.from("profiles").select("id,binzeo_user_id,display_name,username,profile_photo_url,account_status,country_code,preferred_language,suspended_at,created_at").order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("account_status", status);
  if (q) query = query.or(`binzeo_user_id.ilike.%${q}%,display_name.ilike.%${q}%,username.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return fail("User list could not be loaded", 500, "USERS_FETCH_FAILED");
  return ok({ users: data ?? [] });
}
