import "server-only";
import { createPrivilegedClient } from "@/lib/supabase/clients";

const CLIENT_SLUG = "[a-z0-9][a-z0-9-]{0,62}";
const REGISTERED_CLIENT_ID = new RegExp(`^(${CLIENT_SLUG}):(${CLIENT_SLUG})$`);

export type RegisteredOAuthClient = {
  client_id: string;
  client_name: string;
  client_type: string;
  project_key: string;
  project_name: string;
  brand_name: string;
  redirect_uris: string[];
  logo_url: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function brandingLogoUrl(value: unknown): unknown {
  const record = asRecord(value);
  const branding = asRecord(record?.branding);
  return branding?.logo_url ?? record?.logo_url;
}

function httpsOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function approvedLogoUrl(candidate: unknown, approvedOrigins: Set<string>): string | null {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 2048) {
    return null;
  }
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !approvedOrigins.has(url.origin)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseRegisteredOAuthClientId(clientId: string) {
  const match = REGISTERED_CLIENT_ID.exec(clientId);
  return match ? { projectKey: match[1], clientKey: match[2] } : null;
}

export function isRegisteredRedirectUriAllowed(
  client: Pick<RegisteredOAuthClient, "redirect_uris">,
  redirectUri: string,
): boolean {
  // Deliberately compare the complete URI byte-for-byte; no origin-only or prefix match.
  if (!client.redirect_uris.some((registered) => registered === redirectUri)) return false;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const localDevelopmentHttp = process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol === "https:" || (url.protocol === "http:" && localDevelopmentHttp);
}

export async function getRegisteredOAuthClient(clientId: string): Promise<RegisteredOAuthClient | null> {
  const parsed = parseRegisteredOAuthClientId(clientId);
  if (!parsed) return null;

  const admin = createPrivilegedClient();
  const { data: project, error: projectError } = await admin
    .from("platform_projects")
    .select("id,project_key,project_name,brand_name,status,allowed_origins,metadata")
    .eq("project_key", parsed.projectKey)
    .maybeSingle();
  if (projectError) throw new Error("OAuth project lookup failed");
  if (!project || project.status !== "active") return null;

  const { data: client, error: clientError } = await admin
    .from("platform_clients")
    .select("client_key,client_name,client_type,status,redirect_uris,allowed_origins,public_config")
    .eq("project_id", project.id)
    .eq("client_key", parsed.clientKey)
    .maybeSingle();
  if (clientError) throw new Error("OAuth client lookup failed");
  if (!client || client.status !== "active") return null;

  const redirectUris = Array.isArray(client.redirect_uris)
    ? client.redirect_uris.filter((uri: unknown): uri is string => typeof uri === "string")
    : [];
  const approvedOrigins = new Set<string>();
  for (const origin of [
    ...(Array.isArray(project.allowed_origins) ? project.allowed_origins : []),
    ...(Array.isArray(client.allowed_origins) ? client.allowed_origins : []),
    ...redirectUris,
  ]) {
    const parsedOrigin = httpsOrigin(origin);
    if (parsedOrigin) approvedOrigins.add(parsedOrigin);
  }
  const clientLogoUrl = approvedLogoUrl(brandingLogoUrl(client.public_config), approvedOrigins);
  const projectLogoUrl = approvedLogoUrl(brandingLogoUrl(project.metadata), approvedOrigins);

  return {
    client_id: `${project.project_key}:${client.client_key}`,
    client_name: client.client_name,
    client_type: client.client_type,
    project_key: project.project_key,
    project_name: project.project_name,
    brand_name: project.brand_name,
    redirect_uris: redirectUris,
    logo_url: clientLogoUrl ?? projectLogoUrl,
  };
}
