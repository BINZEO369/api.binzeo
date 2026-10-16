import { isIP } from "node:net";
import { z } from "zod";
import { authenticateBearerToken } from "@/lib/auth/identity";
import { createPrivilegedClient } from "@/lib/supabase/clients";
import { requestIp } from "@/user/auth/lib/request-location";
import { apiError, apiSuccess } from "@/lib/http/response";
import { getRequestId } from "@/lib/http/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  project_key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  client_key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  event_type: z.enum(["linked", "login_started", "token_issued", "token_verified", "access_denied", "logout", "profile_synced"]),
  outcome: z.enum(["success", "failed", "denied"]).default("success"),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const identity = await authenticateBearerToken(request);
  if (!identity.ok) return apiError(requestId, identity.code, identity.message, identity.status);
  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(await request.json()); }
  catch { return apiError(requestId, "INVALID_REQUEST", "Invalid project access event.", 400); }

  try {
    const admin = createPrivilegedClient();
    const { data: project, error: projectError } = await admin.from("platform_projects").select("id,project_key,status").eq("project_key", body.project_key).maybeSingle();
    if (projectError || !project || project.status !== "active") return apiError(requestId, "PROJECT_NOT_ACTIVE", "The project is not enabled for Central identity access.", 403);
    const { data: client, error: clientError } = await admin.from("platform_clients").select("id,client_key,status").eq("project_id", project.id).eq("client_key", body.client_key).maybeSingle();
    if (clientError || !client || client.status !== "active") return apiError(requestId, "CLIENT_NOT_ACTIVE", "The project client is not enabled for Central identity access.", 403);

    const rawIp = requestIp(request.headers);
    const ip = isIP(rawIp) ? rawIp : null;
    const { error } = await admin.from("user_project_access_events").insert({
      user_id: identity.identity.user.id,
      project_id: project.id,
      client_id: client.id,
      event_type: body.event_type,
      outcome: body.outcome,
      ip_address: ip,
      user_agent: request.headers.get("user-agent"),
      request_id: requestId,
      metadata: body.metadata,
    });
    if (error) return apiError(requestId, "PROJECT_ACCESS_RECORD_FAILED", "The project access event could not be recorded.", 500);
    return apiSuccess({ recorded: true }, requestId);
  } catch (error) {
    console.error("[PROJECT_ACCESS_RECORD_ERROR]", error instanceof Error ? error.message : "unknown");
    return apiError(requestId, "PROJECT_ACCESS_RECORD_FAILED", "The project access event could not be recorded.", 500);
  }
}
