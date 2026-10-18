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
};

export function parseRegisteredOAuthClientId(clientId: string) {
  const match = REGISTERED_CLIENT_ID.exec(clientId);
  return match ? { projectKey: match[1], clientKey: match[2] } : null;
}

export function isRegisteredRedirectUriAllowed(
  client: Pick<RegisteredOAuthClient, "redirect_uris">,
  redirectUri: string,
): boolean {
  // Deliberately compare the complete URI byte-for-byte; no origin-only or prefix match.
  return client.redirect_uris.some((registered) => registered === redirectUri);
}

export async function getRegisteredOAuthClient(clientId: string): Promise<RegisteredOAuthClient | null> {
  const parsed = parseRegisteredOAuthClientId(clientId);
  if (!parsed) return null;

  const admin = createPrivilegedClient();
  const { data: project, error: projectError } = await admin
    .from("platform_projects")
    .select("id,project_key,project_name,brand_name,status")
    .eq("project_key", parsed.projectKey)
    .maybeSingle();
  if (projectError) throw new Error("OAuth project lookup failed");
  if (!project || project.status !== "active") return null;

  const { data: client, error: clientError } = await admin
    .from("platform_clients")
    .select("client_key,client_name,client_type,status,redirect_uris")
    .eq("project_id", project.id)
    .eq("client_key", parsed.clientKey)
    .maybeSingle();
  if (clientError) throw new Error("OAuth client lookup failed");
  if (!client || client.status !== "active") return null;

  return {
    client_id: `${project.project_key}:${client.client_key}`,
    client_name: client.client_name,
    client_type: client.client_type,
    project_key: project.project_key,
    project_name: project.project_name,
    brand_name: project.brand_name,
    redirect_uris: Array.isArray(client.redirect_uris)
      ? client.redirect_uris.filter((uri: unknown): uri is string => typeof uri === "string")
      : [],
  };
}
