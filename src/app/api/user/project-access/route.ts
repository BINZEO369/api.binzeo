import { createClient } from "@/modules/identity/lib/supabase/server";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import { fail, ok } from "@/modules/identity/lib/api/response";

export const dynamic = "force-dynamic";

type ProjectInfo = { project_key?: string; project_name?: string; brand_name?: string };
type ClientInfo = { client_key?: string; client_name?: string; client_type?: string };
type ProjectAccessRow = { id: string; event_type: string; outcome: string; ip_address: string | null; city: string | null; occurred_at: string; platform_projects: ProjectInfo | ProjectInfo[] | null; platform_clients: ClientInfo | ClientInfo[] | null };
function first<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    // The registry tables are intentionally service-role-only. Authentication is
    // established above with the user's cookie, then the read remains scoped to
    // that authenticated user ID while using the server-side join client.
    const { data, error } = await getSupabaseAdmin()
      .from("user_project_access_events")
      .select("id,event_type,outcome,ip_address,country,region,city,device_name,device_type,operating_system,browser,request_id,occurred_at,platform_projects(project_key,project_name,brand_name),platform_clients(client_key,client_name,client_type)")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) return fail("Connected applications could not be loaded", 500, "PROJECT_ACCESS_FETCH_FAILED");

    const events = (data ?? []) as unknown as ProjectAccessRow[];
    const applications = Object.values(events.reduce<Record<string, { project_key: string; project_name: string; brand_name: string; client_key: string | null; client_name: string | null; last_used_at: string; last_ip: string | null; last_city: string | null; event_count: number }>>((acc, row) => {
      const project = first(row.platform_projects);
      const client = first(row.platform_clients);
      const key = `${project?.project_key ?? "unknown"}:${client?.client_key ?? "unknown"}`;
      const current = acc[key];
      if (!current) {
        acc[key] = { project_key: project?.project_key ?? "unknown", project_name: project?.project_name ?? "Unknown application", brand_name: project?.brand_name ?? "Unknown", client_key: client?.client_key ?? null, client_name: client?.client_name ?? null, last_used_at: row.occurred_at, last_ip: row.ip_address, last_city: row.city, event_count: 1 };
      } else {
        current.event_count += 1;
        if (new Date(row.occurred_at).getTime() > new Date(current.last_used_at).getTime()) { current.last_used_at = row.occurred_at; current.last_ip = row.ip_address; current.last_city = row.city; }
      }
      return acc;
    }, {}));

    return ok({ applications, events });
  } catch (error) {
    console.error("[PROJECT_ACCESS_GET_ERROR]", error);
    return fail("Connected applications could not be loaded", 500, "PROJECT_ACCESS_FETCH_FAILED");
  }
}
