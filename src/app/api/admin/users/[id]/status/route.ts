import { NextRequest } from "next/server";
import { getAdminApiContext } from "@/modules/admin/lib/admin";
import { createAdminClient } from "@/modules/admin/lib/supabase/admin";
import { ok, fail } from "@/modules/admin/lib/api/response";

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canManageUsers(access: { roles?: unknown; permissions?: unknown } | null) {
  return Array.isArray(access?.roles) && access.roles.includes("super_admin") || Array.isArray(access?.permissions) && access.permissions.includes("users.manage");
}
function isSuperAdmin(access: { roles?: unknown } | null) {
  return Array.isArray(access?.roles) && access.roles.includes("super_admin");
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!canManageUsers(access)) return fail("User management permission required", 403, "USERS_MANAGE_REQUIRED");
  const { id } = await params;
  if (!UUID.test(id)) return fail("Invalid user id", 422, "VALIDATION_ERROR");
  let body: { status?: unknown; reason?: unknown; suspended_until?: unknown };
  try { body = await req.json(); } catch { return fail("Invalid JSON body", 422, "VALIDATION_ERROR"); }
  const status = body.status;
  if (status !== "active" && status !== "suspended") return fail("Only active or suspended status can be set here", 422, "VALIDATION_ERROR");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  const suspendedUntil = typeof body.suspended_until === "string" && body.suspended_until ? body.suspended_until : null;
  const admin = createAdminClient();
  const update = status === "suspended"
    ? { account_status: status, status_reason: reason, suspended_at: new Date().toISOString(), suspended_until: suspendedUntil, updated_at: new Date().toISOString() }
    : { account_status: status, status_reason: reason, suspended_at: null, suspended_until: null, updated_at: new Date().toISOString() };
  const { data: profile, error } = await admin.from("profiles").update(update as never).eq("id", id).select("id,binzeo_user_id,display_name,account_status,status_reason,suspended_at,suspended_until").maybeSingle();
  if (error || !profile) return fail(error?.message ?? "User not found", 400, "USER_STATUS_UPDATE_FAILED");
  await admin.from("admin_activity_logs").insert([{
    admin_user_id: user.id, action_type: status === "suspended" ? "user_suspended" : "user_reactivated", target_type: "user", target_id: id,
    description: `${status === "suspended" ? "Suspended" : "Reactivated"} user account`, metadata: { status, reason, suspended_until: suspendedUntil },
  }] as never);
  return ok({ profile });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!isSuperAdmin(access)) return fail("Only a super admin can permanently delete an account", 403, "SUPER_ADMIN_REQUIRED");
  const { id } = await params;
  if (!UUID.test(id)) return fail("Invalid user id", 422, "VALIDATION_ERROR");
  const body = await _req.json().catch(() => ({})) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_delete_user", { target_user_id: id, deleting_admin_id: user.id, deletion_reason: reason } as never);
  if (error) {
    const code = error.message.includes("super_admin_required") || error.message.includes("cannot_delete_super_admin") ? "SUPER_ADMIN_REQUIRED" : error.message.includes("self_deletion") ? "SELF_DELETION_NOT_ALLOWED" : "USER_DELETE_FAILED";
    return fail(error.message, 400, code);
  }
  return ok({ archived: data });
}
