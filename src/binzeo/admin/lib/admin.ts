import "server-only";
import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { authenticateBearerToken } from "@/binzeo/auth/identity";
import { createUserScopedClient } from "@/common/database/supabase/clients";
import { createClient } from "@/binzeo/admin/lib/supabase/server";
import { createAdminClient } from "@/binzeo/admin/lib/supabase/admin";

export type AdminContext = {
  user: { id: string; email?: string };
  profile: Record<string, unknown> | null;
  access: { roles: string[]; permissions: string[]; is_active: boolean };
};

type AdminAccess = { roles: string[]; permissions: string[]; is_active: boolean };

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

/**
 * Resolve an admin from either a forwarded Supabase SSR cookie or a verified
 * bearer token. The cookie is never trusted by itself: Supabase auth.getUser()
 * validates it against the configured identity project.
 */
export async function getAdminApiContext(request?: Request) {
  const incomingHeaders = request?.headers ?? await headers();
  const authorization = incomingHeaders.get("authorization");
  let supabase = await createClient();
  let user: User | null = null;

  if (authorization) {
    const identityRequest = request ?? new Request("https://central-api.invalid", { headers: { authorization } });
    const identity = await authenticateBearerToken(identityRequest);
    if (!identity.ok) return { supabase, user: null, access: null };
    supabase = identity.identity.supabase;
    user = identity.identity.user;
  } else {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  }

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
    } satisfies AdminAccess,
  };
}

/** Use only after an active admin and permission checks have succeeded. */
export async function getAdminDataClient(access: { roles: string[] }, userClient?: Awaited<ReturnType<typeof createClient>>) {
  if (access.roles.includes("super_admin")) return createAdminClient();
  const authorization = (await headers()).get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (match) return createUserScopedClient(match[1]);
  return userClient ?? createClient();
}

/**
 * Obtain the server-only service-role client only after validating the user's
 * session and requested permission. Never return this client to a browser.
 */
export async function getAdminServiceContext(request: Request, permission: string) {
  const context = await getAdminApiContext(request);
  if (!context.user || !context.access || !hasAdminPermission(context.access, permission)) return null;
  const admin = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>;
  return { ...context, admin };
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
