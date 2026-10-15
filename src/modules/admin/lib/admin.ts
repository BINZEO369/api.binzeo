import { notFound, redirect } from "next/navigation";
import { createClient } from "@/modules/admin/lib/supabase/server";
import { createAdminClient } from "@/modules/admin/lib/supabase/admin";

export type AdminContext = {
  user: { id: string; email?: string };
  profile: Record<string, unknown> | null;
  access: { roles: string[]; permissions: string[]; is_active: boolean };
};

export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: access } = await supabase.from("admin_access").select("roles, permissions, is_active").eq("user_id", user.id).maybeSingle();
  if (!access?.is_active) redirect("/login?error=not_admin");
  const { data: profile } = await supabase.from("profiles").select("id, binzeo_user_id, display_name, username, profile_photo_url, account_status").eq("id", user.id).maybeSingle();
  return {
    user: { id: user.id, email: user.email },
    profile,
    access: {
      roles: Array.isArray(access.roles) ? access.roles : [],
      permissions: Array.isArray(access.permissions) ? access.permissions : [],
      is_active: access.is_active,
    },
  };
}

export async function getAdminApiContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, access: null };
  const { data: access } = await supabase.from("admin_access").select("roles, permissions, is_active").eq("user_id", user.id).maybeSingle();
  if (!access?.is_active) return { supabase, user: null, access: null };
  return {
    supabase,
    user,
    access: {
      roles: Array.isArray(access.roles) ? access.roles : [],
      permissions: Array.isArray(access.permissions) ? access.permissions : [],
      is_active: access.is_active,
    },
  };
}

/**
 * Use only after requireAdmin/getAdminApiContext succeeds. The service-role client
 * is returned only for an active super_admin and must never be sent to the browser.
 */
export async function getAdminDataClient(access: { roles: string[] }) {
  if (access.roles.includes("super_admin")) return createAdminClient();
  return createClient();
}

export function isSuperAdmin(access: { roles?: unknown } | null | undefined): boolean {
  return Array.isArray(access?.roles) && access.roles.includes("super_admin");
}

export function canReadPrivacyAnalytics(access: { roles: string[] } | null | undefined): boolean {
  return isSuperAdmin(access) || Boolean(access?.roles.includes("analytics"));
}

export async function requirePrivacyAnalyticsAdmin(): Promise<AdminContext> {
  const context = await requireAdmin();
  if (!canReadPrivacyAnalytics(context.access)) notFound();
  return context;
}

export function hasAdminPermission(access: { roles: string[]; permissions: string[] }, permission: string): boolean {
  return isSuperAdmin(access) || access.permissions.includes(permission);
}

export async function requireAdminPermission(permission: string): Promise<AdminContext> {
  const context = await requireAdmin();
  if (!hasAdminPermission(context.access, permission)) notFound();
  return context;
}
