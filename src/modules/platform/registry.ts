export type PlatformProjectKey = string;
export type PlatformClientType = "frontend" | "admin" | "mobile" | "service" | "integration";
export type PlatformProvider = "google" | "facebook" | "apple" | "smtp" | "imagekit" | "cloudinary" | "custom";

export type ProviderSecretRefs = {
  publicClientIdEnv?: string;
  secretEnvVar?: string;
  redirectUriEnv?: string;
};

export type PlatformClientDefinition = {
  key: string;
  name: string;
  type: PlatformClientType;
  status: "planned" | "active" | "suspended" | "archived";
  allowedOrigins: readonly string[];
  scopes: readonly string[];
};

export type PlatformProjectDefinition = {
  key: PlatformProjectKey;
  name: string;
  brandName: string;
  type: "platform" | "brand" | "product" | "internal";
  status: "planned" | "active" | "suspended" | "archived";
  databaseRef: string;
  features: readonly string[];
  clients: readonly PlatformClientDefinition[];
  providers: Readonly<Record<PlatformProvider, ProviderSecretRefs>>;
};

/**
 * Static server-side defaults for the currently active platform.
 *
 * The database migration creates the durable registry. This catalog is the
 * typed safety boundary for code paths that need to map a project/provider to
 * server-only environment variable names. It never contains secret values.
 * New brands should be added to the database first, then receive an explicit
 * typed adapter here before their server routes are enabled.
 */
export const PLATFORM_PROJECT_CATALOG: Readonly<Record<string, PlatformProjectDefinition>> = {
  binzeo: {
    key: "binzeo",
    name: "BINZEO Platform",
    brandName: "BINZEO",
    type: "platform",
    status: "active",
    databaseRef: "auth",
    features: ["identity", "administration", "privacy", "analytics"],
    clients: [
      {
        key: "auth",
        name: "BINZEO Identity",
        type: "frontend",
        status: "active",
        allowedOrigins: ["https://auth-binzeo.vercel.app"],
        scopes: ["identity", "profile", "security"],
      },
      {
        key: "admin",
        name: "BINZEO Admin",
        type: "admin",
        status: "active",
        allowedOrigins: ["https://admin-binzeo.vercel.app"],
        scopes: ["administration", "audit", "privacy"],
      },
    ],
    providers: {
      google: {
        publicClientIdEnv: "GOOGLE_CLIENT_ID",
        secretEnvVar: "GOOGLE_CLIENT_SECRET",
        redirectUriEnv: "GOOGLE_REDIRECT_URI",
      },
      facebook: {
        publicClientIdEnv: "FACEBOOK_CLIENT_ID",
        secretEnvVar: "FACEBOOK_CLIENT_SECRET",
        redirectUriEnv: "FACEBOOK_REDIRECT_URI",
      },
      apple: {},
      smtp: { secretEnvVar: "SMTP_PASS" },
      imagekit: { secretEnvVar: "IMAGEKIT_PRIVATE_KEY" },
      cloudinary: {},
      custom: {},
    },
  },
};

export function getPlatformProject(key: string): PlatformProjectDefinition | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) return undefined;
  return PLATFORM_PROJECT_CATALOG[key];
}

export function getPlatformClient(projectKey: string, clientKey: string): PlatformClientDefinition | undefined {
  return getPlatformProject(projectKey)?.clients.find((client) => client.key === clientKey);
}

export function getProviderSecretRefs(projectKey: string, provider: PlatformProvider): ProviderSecretRefs | undefined {
  return getPlatformProject(projectKey)?.providers[provider];
}

/** Public metadata only: no env names, provider refs or secret material. */
export function publicPlatformCatalog() {
  return Object.values(PLATFORM_PROJECT_CATALOG).map(({ key, name, brandName, type, status, features, clients }) => ({
    key,
    name,
    brandName,
    type,
    status,
    features: [...features],
    clients: clients.map(({ key: clientKey, name: clientName, type: clientType, status: clientStatus, allowedOrigins, scopes }) => ({
      key: clientKey,
      name: clientName,
      type: clientType,
      status: clientStatus,
      allowedOrigins: [...allowedOrigins],
      scopes: [...scopes],
    })),
  }));
}
