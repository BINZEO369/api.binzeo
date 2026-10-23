import "server-only";
import type { AdminAccess, CentralIdentity } from "@/platform/auth/identity";
import { getAdminAccess } from "@/platform/auth/identity";

export function isSuperAdmin(access: AdminAccess): boolean {
  return access.roles.includes("super_admin");
}

export function hasPermission(access: AdminAccess, permission: string): boolean {
  return isSuperAdmin(access) || access.permissions.includes(permission);
}

export async function authorizeAdmin(
  identity: CentralIdentity,
  permission?: string,
): Promise<{ ok: true; access: AdminAccess } | { ok: false; code: string; message: string }> {
  const access = await getAdminAccess(identity);
  if (!access) return { ok: false, code: "ADMIN_REQUIRED", message: "An active admin account is required." };
  if (permission && !hasPermission(access, permission)) {
    return { ok: false, code: "PERMISSION_REQUIRED", message: `Permission ${permission} is required.` };
  }
  return { ok: true, access };
}
