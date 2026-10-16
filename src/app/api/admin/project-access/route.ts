import { getAdminApiContext, getAdminDataClient, hasAdminPermission } from "@/modules/admin/lib/admin";
import { fail, ok } from "@/modules/admin/lib/api/response";

export const dynamic = "force-dynamic";

type ProjectInfo = { project_key?: string };
type ProjectAccessRow = { platform_projects: ProjectInfo | ProjectInfo[] | null };
function first<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

export async function GET(request: Request) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!hasAdminPermission(access, "auth.read")) return fail("Authentication read permission required", 403, "AUTH_READ_REQUIRED");
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("user_id");
    const projectKey = url.searchParams.get("project_key");
    const db = await getAdminDataClient(access);
    let query = db.from("user_project_access_events").select("id,user_id,event_type,outcome,ip_address,country,region,city,device_name,device_type,operating_system,browser,user_agent,request_id,metadata,occurred_at,platform_projects(project_key,project_name,brand_name),platform_clients(client_key,client_name,client_type)").order("occurred_at", { ascending: false }).limit(500);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) return fail("Connected applications could not be loaded", 500, "PROJECT_ACCESS_FETCH_FAILED");
    const events = (data ?? []).filter((row: ProjectAccessRow) => {
      if (!projectKey) return true;
      const project = first(row.platform_projects);
      return project?.project_key === projectKey;
    });
    return ok({ events });
  } catch (error) {
    console.error("[ADMIN_PROJECT_ACCESS_GET_ERROR]", error);
    return fail("Connected applications could not be loaded", 500, "PROJECT_ACCESS_FETCH_FAILED");
  }
}
