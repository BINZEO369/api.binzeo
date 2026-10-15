export type ProjectKey = "auth" | "admin";

export type ProjectDefinition = {
  key: ProjectKey;
  name: string;
  status: "active";
  purpose: "identity" | "administration";
  databaseRef: "auth";
  env: { url: string; anonKey: string; serviceRoleKey: string };
  allowedOrigins: readonly string[];
  features: readonly string[];
};

const authOrigins = ["https://auth-binzeo.vercel.app"] as const;
const adminOrigins = ["https://admin-binzeo.vercel.app"] as const;

/**
 * This is an allowlist, not an authorization mechanism. User permissions are
 * always derived from a verified identity and database policy.
 * Secret values are loaded at runtime from server-only environment variables.
 */
export const PROJECT_REGISTRY: Readonly<Record<ProjectKey, ProjectDefinition>> = {
  auth: {
    key: "auth",
    name: "BINZEO Identity",
    status: "active",
    purpose: "identity",
    databaseRef: "auth",
    env: {
      url: "AUTH_SUPABASE_URL",
      anonKey: "AUTH_SUPABASE_ANON_KEY",
      serviceRoleKey: "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    },
    allowedOrigins: authOrigins,
    features: ["central_identity", "signup", "login", "profile", "security"],
  },
  admin: {
    key: "admin",
    name: "BINZEO Admin",
    status: "active",
    purpose: "administration",
    databaseRef: "auth",
    env: {
      url: "AUTH_SUPABASE_URL",
      anonKey: "AUTH_SUPABASE_ANON_KEY",
      serviceRoleKey: "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    },
    allowedOrigins: adminOrigins,
    features: ["user_management", "admin_console", "audit"],
  },
};

export function getProject(key: string): ProjectDefinition | undefined {
  return Object.hasOwn(PROJECT_REGISTRY, key)
    ? PROJECT_REGISTRY[key as ProjectKey]
    : undefined;
}

export function publicProjectList() {
  return Object.values(PROJECT_REGISTRY).map(({ key, name, status, purpose, allowedOrigins, features }) => ({
    key,
    name,
    status,
    purpose,
    allowedOrigins: [...allowedOrigins],
    features: [...features],
  }));
}
