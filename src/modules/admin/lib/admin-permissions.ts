export const ADMIN_ROLE_OPTIONS = [
  { id: "super_admin", label: "Super Admin", description: "Full dashboard and data access" },
  { id: "analytics", label: "Analytics", description: "Read-only privacy, consent and visitor analytics tables" },
  { id: "support_admin", label: "Support Admin", description: "User support and account operations" },
  { id: "auditor", label: "Auditor", description: "Read-only audit review" },
  { id: "custom", label: "Custom", description: "Use only the permissions selected below" },
] as const;

export const ADMIN_PERMISSION_OPTIONS = [
  { id: "users.read", label: "Read user records", description: "Profiles and user directory" },
  { id: "users.manage", label: "Manage user accounts", description: "Status changes and user controls" },
  { id: "auth.read", label: "Read authentication metadata", description: "Account, login and verification metadata; no credentials" },
  { id: "database.read", label: "Read database tables", description: "Allowlisted application tables" },
  { id: "audit.read", label: "Read audit logs", description: "Administrative audit records" },
  { id: "marketing.send", label: "Email operations", description: "Marketing, birthday, occasion and template workflows" },
] as const;

export type AdminRole = typeof ADMIN_ROLE_OPTIONS[number]["id"];
export type AdminPermission = typeof ADMIN_PERMISSION_OPTIONS[number]["id"];
export const ADMIN_ROLE_IDS: readonly string[] = ADMIN_ROLE_OPTIONS.map((role) => role.id);
export const ADMIN_PERMISSION_IDS: readonly string[] = ADMIN_PERMISSION_OPTIONS.map((permission) => permission.id);

export function defaultPermissionsForRoles(roles: string[]): string[] {
  if (roles.includes("super_admin")) return [...ADMIN_PERMISSION_IDS];
  const defaults = new Set<string>();
  if (roles.includes("support_admin")) {
    ["users.read", "users.manage", "audit.read"].forEach((permission) => defaults.add(permission));
  }
  if (roles.includes("auditor")) defaults.add("audit.read");
  return [...defaults];
}
