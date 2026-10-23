import { NextRequest } from "next/server";

export const COOKIE_CONSENT_VERSION = "2026-10-14.1";
export const COOKIE_CONSENT_COOKIE = "binzeo_consent";
export const ANALYTICS_SESSION_COOKIE = "binzeo_session_id";
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const ANALYTICS_SESSION_MAX_AGE_SECONDS = 30 * 60;

export type CookiePreferences = {
  necessary_enabled: true;
  functional_enabled: boolean;
  analytics_enabled: boolean;
  experience_enabled: boolean;
  marketing_enabled: boolean;
  cross_site_enabled: boolean;
  precise_location_enabled: boolean;
  raw_ip_enabled: boolean;
  device_diagnostics_enabled: boolean;
  fingerprint_enabled: boolean;
};

export type StoredConsent = {
  version: string;
  visitor_id: string;
  saved_at: string;
  method: "accept_all" | "reject_optional" | "save_settings";
  preferences: CookiePreferences;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPTIONAL_KEYS = [
  "functional_enabled",
  "analytics_enabled",
  "experience_enabled",
  "marketing_enabled",
  "cross_site_enabled",
  "precise_location_enabled",
  "raw_ip_enabled",
  "device_diagnostics_enabled",
  "fingerprint_enabled",
] as const;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseConsentCookie(value: string | undefined): StoredConsent | null {
  if (!value || value.length > 2048) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const preferences = parsed.preferences as Record<string, unknown> | null;
    if (
      typeof parsed.version !== "string" ||
      typeof parsed.saved_at !== "string" ||
      !isUuid(parsed.visitor_id) ||
      !["accept_all", "reject_optional", "save_settings"].includes(String(parsed.method)) ||
      !preferences ||
      preferences.necessary_enabled !== true ||
      OPTIONAL_KEYS.some((key) => typeof preferences[key] !== "boolean")
    ) return null;
    return {
      version: parsed.version,
      visitor_id: parsed.visitor_id,
      saved_at: parsed.saved_at,
      method: parsed.method as StoredConsent["method"],
      preferences: {
        necessary_enabled: true,
        functional_enabled: preferences.functional_enabled as boolean,
        analytics_enabled: preferences.analytics_enabled as boolean,
        experience_enabled: preferences.experience_enabled as boolean,
        marketing_enabled: preferences.marketing_enabled as boolean,
        cross_site_enabled: preferences.cross_site_enabled as boolean,
        precise_location_enabled: preferences.precise_location_enabled as boolean,
        raw_ip_enabled: preferences.raw_ip_enabled as boolean,
        device_diagnostics_enabled: preferences.device_diagnostics_enabled as boolean,
        fingerprint_enabled: preferences.fingerprint_enabled as boolean,
      },
    };
  } catch {
    return null;
  }
}

export function encodeConsentCookie(consent: StoredConsent): string {
  return Buffer.from(JSON.stringify(consent), "utf8").toString("base64url");
}

export function consentStatus(preferences: CookiePreferences, previous?: CookiePreferences | null): "accepted" | "rejected" | "partial" | "withdrawn" {
  const optional = OPTIONAL_KEYS.map((key) => preferences[key]);
  if (optional.every(Boolean)) return "accepted";
  if (optional.every((value) => !value)) {
    const previouslyAllowed = previous ? OPTIONAL_KEYS.some((key) => previous[key]) : false;
    return previouslyAllowed ? "withdrawn" : "rejected";
  }
  return "partial";
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      const allowedHosts = [
        request.headers.get("x-forwarded-host"),
        request.headers.get("host"),
        request.nextUrl.host,
      ]
        .flatMap((value) => value?.split(",") ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const allowedProtocols = [
        request.headers.get("x-forwarded-proto"),
        request.nextUrl.protocol,
      ]
        .flatMap((value) => value?.split(",") ?? [])
        .map((value) => value.trim().replace(/:$/, "").toLowerCase())
        .filter(Boolean);
      return allowedHosts.includes(parsedOrigin.host.toLowerCase()) && allowedProtocols.includes(parsedOrigin.protocol.replace(/:$/, "").toLowerCase());
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

type Bucket = { count: number; resetAt: number };
const requestBuckets = new Map<string, Bucket>();

/** Per-instance burst guard; does not persist or log the client IP. */
export function allowPrivacyRequest(request: NextRequest, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (requestBuckets.size > 2000) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
    }
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const bucketKey = `${forwarded}:${key}`;
  const current = requestBuckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
