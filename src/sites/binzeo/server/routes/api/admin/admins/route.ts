import { NextRequest } from "next/server";
import { getAdminApiContext, isSuperAdmin } from "@/sites/binzeo/admin/lib/admin";
import { createAdminClient } from "@/sites/binzeo/admin/lib/supabase/admin";
import { ok, fail } from "@/sites/binzeo/admin/lib/api/response";
import { ADMIN_PERMISSION_IDS, ADMIN_ROLE_IDS, defaultPermissionsForRoles } from "@/sites/binzeo/admin/lib/admin-permissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!isSuperAdmin(access)) return fail("Super admin access required", 403, "SUPER_ADMIN_REQUIRED");

  const admin = createAdminClient();
  const [{ data: profiles, error: profilesError }, { data: assignments, error: assignmentsError }, { data: authResult, error: authError }] = await Promise.all([
    admin.from("profiles").select("id,binzeo_user_id,display_name,username,account_status,created_at").order("created_at", { ascending: false }).limit(1000),
    admin.from("admin_access").select("user_id,roles,permissions,is_active,assigned_by,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (profilesError || assignmentsError || authError) {
    const error = profilesError ?? assignmentsError ?? authError;
    return fail(error?.message ?? "Could not load admin access", 500, "ADMIN_ASSIGNMENTS_LOAD_FAILED");
  }
  const emailById = new Map((authResult?.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null]));
  const profileRows = (profiles ?? []) as unknown as Array<{ id: string; binzeo_user_id: string | null; display_name: string | null; username: string | null; account_status: string | null; created_at: string }>;
  const candidates = profileRows.map((profile) => ({ ...profile, email: emailById.get(profile.id) ?? null }));
  return ok({ candidates, assignments: assignments ?? [], roles: ADMIN_ROLE_IDS, permissions: ADMIN_PERMISSION_IDS });
}

export async function POST(request: NextRequest) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!isSuperAdmin(access)) return fail("Super admin access required", 403, "SUPER_ADMIN_REQUIRED");

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return fail("Invalid JSON body", 422, "VALIDATION_ERROR"); }

  const targetUserId = body.user_id;
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : typeof body.role === "string" ? [body.role] : [];
  const isActive = body.is_active === undefined ? true : body.is_active;
  if (typeof targetUserId !== "string" || !UUID.test(targetUserId) || !roles.length || roles.some((role) => typeof role !== "string" || !ADMIN_ROLE_IDS.includes(role))) {
    return fail("A valid user_id and at least one supported role are required", 422, "VALIDATION_ERROR");
  }
  if (typeof isActive !== "boolean") return fail("is_active must be a boolean", 422, "VALIDATION_ERROR");

  const rawPermissions = body.permissions === undefined ? defaultPermissionsForRoles(roles as string[]) : body.permissions;
  if (!Array.isArray(rawPermissions) || rawPermissions.some((permission) => typeof permission !== "string" || !ADMIN_PERMISSION_IDS.includes(permission))) {
    return fail("One or more permissions are not supported", 422, "VALIDATION_ERROR");
  }
  const permissions = roles.includes("super_admin") ? [...ADMIN_PERMISSION_IDS] : [...new Set(rawPermissions as string[])];
  if (targetUserId === user.id && (!isActive || !roles.includes("super_admin"))) {
    return fail("You cannot disable or remove your own super admin access", 409, "SELF_LOCKOUT_PREVENTED");
  }

  const admin = createAdminClient();
  const [{ data: target, error: targetError }, { data: previous, error: previousError }] = await Promise.all([
    admin.from("profiles").select("id,display_name,binzeo_user_id").eq("id", targetUserId).maybeSingle(),
    admin.from("admin_access").select("roles,is_active").eq("user_id", targetUserId).maybeSingle(),
  ]);
  const targetProfile = target as unknown as { display_name: string | null; binzeo_user_id: string | null } | null;
  const previousAssignment = previous as unknown as { roles: string[]; is_active: boolean } | null;
  if (targetError || !targetProfile) return fail(targetError?.message ?? "User profile not found", 404, "USER_NOT_FOUND");
  if (previousError) return fail(previousError.message, 500, "ADMIN_ASSIGNMENT_LOAD_FAILED");

  const previouslySuperAdmin = previousAssignment?.is_active && Array.isArray(previousAssignment.roles) && previousAssignment.roles.includes("super_admin");
  const remainsSuperAdmin = isActive && roles.includes("super_admin");
  if (previouslySuperAdmin && !remainsSuperAdmin) {
    const { count, error } = await admin.from("admin_access").select("user_id", { count: "exact", head: true }).eq("is_active", true).contains("roles", ["super_admin"]);
    if (error) return fail(error.message, 500, "SUPER_ADMIN_COUNT_FAILED");
    if ((count ?? 0) <= 1) return fail("At least one active super admin must remain", 409, "LAST_SUPER_ADMIN_PROTECTED");
  }

  const assignmentPayload = {
    user_id: targetUserId,
    roles,
    permissions,
    is_active: isActive,
    assigned_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const { data: assignment, error } = await admin.from("admin_access").upsert([assignmentPayload] as never, { onConflict: "user_id" }).select("user_id,roles,permissions,is_active,assigned_by,created_at,updated_at").single();
  if (error) return fail(error.message, 400, "ADMIN_ASSIGNMENT_FAILED");

  const label = targetProfile.display_name ?? targetProfile.binzeo_user_id ?? targetUserId;
  const { error: auditError } = await admin.from("admin_activity_logs").insert([{
    admin_user_id: user.id,
    action_type: isActive ? (previousAssignment ? "admin_access_updated" : "admin_assigned") : "admin_access_deactivated",
    target_type: "user",
    target_id: targetUserId,
    description: `${isActive ? "Updated" : "Deactivated"} admin access for ${label}`,
    metadata: { roles, permissions, is_active: isActive },
  }] as never);
  return ok({ assignment, audit_recorded: !auditError, audit_warning: auditError?.message ?? null });
}
