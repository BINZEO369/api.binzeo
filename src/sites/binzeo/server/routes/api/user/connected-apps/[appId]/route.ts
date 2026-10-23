import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

export async function DELETE(_req: Request, { params }: { params: Promise<{ appId: string }> }) {
  try {
    const { appId } = await params;
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const { data, error } = await db.from("user_connected_apps").update({ disconnected_at: new Date().toISOString(), revoked_at: new Date().toISOString(), scopes: [], updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("app_id", appId).is("disconnected_at", null).select("id,app_id,scopes,connected_at,disconnected_at,revoked_at").maybeSingle();
    if (error) return fail(error.message, 400, "APP_DISCONNECT_FAILED");
    if (!data) return fail("Connection not found", 404, "CONNECTION_NOT_FOUND");
    return ok({ connection: data });
  } catch (error) {
    console.error("[CONNECTED_APPS_DELETE_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
