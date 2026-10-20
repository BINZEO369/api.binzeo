import "server-only";
import { isIP } from "node:net";
import { createPrivilegedClient } from "@/lib/supabase/clients";
import { getRequestId } from "@/lib/http/request-id";
import { parseRegisteredOAuthClientId } from "@/lib/auth/oauth-client-registry";
import { requestIp } from "@/user/auth/lib/request-location";
import { parseUserAgent } from "@/user/auth/lib/device-tracking";

export type ProjectAccessEventType =
  | "linked"
  | "login_started"
  | "token_issued"
  | "token_verified"
  | "access_denied"
  | "logout"
  | "profile_synced";

type RecordProjectAccessEventInput = {
  userId: string;
  clientId: string;
  eventType: ProjectAccessEventType;
  request: Request;
  metadata?: Record<string, unknown>;
};

type ProjectClientReference = { projectKey: string; clientKey: string };

function coordinate(headers: Headers, name: string, min: number, max: number): number | null {
  const raw = headers.get(name)?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function locationHeader(headers: Headers, names: string[], maxLength = 120): string | null {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value.slice(0, maxLength);
  }
  return null;
}

function resolveProjectClient(clientId: string): ProjectClientReference | null {
  if (clientId === "admin") return { projectKey: "binzeo", clientKey: "admin" };
  // The legacy JABIYEN SSO client is separately constrained to its exact
  // HTTPS callback by isRegisteredSsoCallback before any caller reaches here.
  if (clientId === "jabiyen") return { projectKey: "jabiyen", clientKey: "website" };
  const parsed = parseRegisteredOAuthClientId(clientId);
  return parsed ? { projectKey: parsed.projectKey, clientKey: parsed.clientKey } : null;
}

/**
 * Record a successful Central Auth application handoff. Callers must first
 * validate the registered client and its exact callback URI. The bare legacy
 * JABIYEN client is allowed only by its hard-coded callback registry.
 * Authentication is intentionally not failed if audit persistence is down.
 */
export async function recordProjectAccessEvent({
  userId,
  clientId,
  eventType,
  request,
  metadata = {},
}: RecordProjectAccessEventInput): Promise<void> {
  const requestId = getRequestId(request);
  const reference = resolveProjectClient(clientId);
  if (!reference) {
    console.warn("[PROJECT_ACCESS_EVENT_SKIPPED]", { requestId, clientId, reason: "unmapped_client" });
    return;
  }

  try {
    const admin = createPrivilegedClient();
    const { data: project, error: projectError } = await admin
      .from("platform_projects")
      .select("id")
      .eq("project_key", reference.projectKey)
      .maybeSingle();
    if (projectError || !project) {
      console.warn("[PROJECT_ACCESS_EVENT_SKIPPED]", { requestId, clientId, reason: projectError?.code ?? "project_not_found" });
      return;
    }

    const { data: client, error: clientError } = await admin
      .from("platform_clients")
      .select("id")
      .eq("project_id", project.id)
      .eq("client_key", reference.clientKey)
      .maybeSingle();
    if (clientError || !client) {
      console.warn("[PROJECT_ACCESS_EVENT_SKIPPED]", { requestId, clientId, reason: clientError?.code ?? "client_not_found" });
      return;
    }

    const rawIp = requestIp(request.headers);
    const ipAddress = isIP(rawIp) ? rawIp : null;
    const device = parseUserAgent(request.headers);
    const countryHeader = locationHeader(request.headers, ["x-vercel-ip-country", "cf-ipcountry"], 2);
    const country = countryHeader && /^[A-Za-z]{2}$/.test(countryHeader) ? countryHeader.toUpperCase() : null;
    const city = locationHeader(request.headers, ["x-vercel-ip-city", "x-client-city"]);
    const region = locationHeader(request.headers, ["x-vercel-ip-country-region", "x-client-region"]);
    const latitude = coordinate(request.headers, "x-vercel-ip-latitude", -90, 90);
    const longitude = coordinate(request.headers, "x-vercel-ip-longitude", -180, 180);
    const hasProxyLocation = Boolean(country || city || region || latitude !== null || longitude !== null);
    const { error } = await admin.from("user_project_access_events").insert({
      user_id: userId,
      project_id: project.id,
      client_id: client.id,
      event_type: eventType,
      outcome: "success",
      ip_address: ipAddress,
      country,
      region,
      city,
      latitude,
      longitude,
      location_source: hasProxyLocation ? "proxy" : null,
      device_name: device.userAgent ? device.deviceName : null,
      device_type: device.userAgent ? device.deviceType : null,
      operating_system: device.userAgent ? device.operatingSystem : null,
      os_version: device.userAgent ? device.osVersion : null,
      browser: device.userAgent ? device.browser : null,
      browser_version: device.userAgent ? device.browserVersion : null,
      user_agent: device.userAgent,
      request_id: requestId,
      metadata,
    });
    if (error) {
      console.error("[PROJECT_ACCESS_EVENT_INSERT_ERROR]", { requestId, clientId, code: error.code });
    }
  } catch (error) {
    console.error("[PROJECT_ACCESS_EVENT_ERROR]", {
      requestId,
      clientId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
