/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { fail, ok } from "@/binzeo/auth/lib/api/response";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { allowPrivacyRequest } from "@/binzeo/auth/lib/privacy-consent";
import { collectPrivacyVisitorMetadata } from "@/binzeo/auth/lib/privacy-visitor-metadata";
import {
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_VERSION,
  CONSENT_MAX_AGE_SECONDS,
  consentStatus,
  encodeConsentCookie,
  isSameOriginRequest,
  parseConsentCookie,
  type CookiePreferences,
  type StoredConsent,
} from "@/binzeo/auth/lib/privacy-consent";


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

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function secureCookie(request: NextRequest) {
  return request.nextUrl.protocol === "https:";
}

export async function GET(request: NextRequest) {
  const stored = parseConsentCookie(request.cookies.get(COOKIE_CONSENT_COOKIE)?.value);
  const current = stored?.version === COOKIE_CONSENT_VERSION ? stored : null;
  return noStore(ok({
    consent: current ? { version: current.version, saved_at: current.saved_at, preferences: current.preferences } : null,
  }));
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return noStore(fail("Same-origin request required", 403, "CONSENT_ORIGIN_FORBIDDEN"));
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return noStore(fail("Request body is too large", 413, "CONSENT_BODY_TOO_LARGE"));
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) {
    return noStore(fail("Request body is too large", 413, "CONSENT_BODY_TOO_LARGE"));
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return noStore(fail("A valid JSON body is required", 400, "CONSENT_INVALID_JSON"));
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStore(fail("A JSON object is required", 422, "CONSENT_INVALID_BODY"));
  }
  if (!allowPrivacyRequest(request, "consent", 20, 60 * 60 * 1000)) {
    return noStore(fail("Too many consent changes; please try again later", 429, "CONSENT_RATE_LIMITED"));
  }

  const input = body as Record<string, unknown>;
  const method = input.method;
  if (method !== "accept_all" && method !== "reject_optional" && method !== "save_settings") {
    return noStore(fail("Choose a valid consent action", 422, "CONSENT_METHOD_INVALID"));
  }
  if (!input.preferences || typeof input.preferences !== "object" || Array.isArray(input.preferences)) {
    return noStore(fail("Consent preferences are required", 422, "CONSENT_PREFERENCES_REQUIRED"));
  }
  const supplied = input.preferences as Record<string, unknown>;
  if (supplied.necessary_enabled !== true || OPTIONAL_KEYS.some((key) => typeof supplied[key] !== "boolean")) {
    return noStore(fail("Necessary cookies must remain enabled and every optional category must be selected explicitly", 422, "CONSENT_PREFERENCES_INVALID"));
  }
  const preferences: CookiePreferences = {
    necessary_enabled: true,
    functional_enabled: supplied.functional_enabled as boolean,
    analytics_enabled: supplied.analytics_enabled as boolean,
    experience_enabled: supplied.experience_enabled as boolean,
    marketing_enabled: supplied.marketing_enabled as boolean,
    cross_site_enabled: supplied.cross_site_enabled as boolean,
    precise_location_enabled: supplied.precise_location_enabled as boolean,
    raw_ip_enabled: supplied.raw_ip_enabled as boolean,
    device_diagnostics_enabled: supplied.device_diagnostics_enabled as boolean,
    fingerprint_enabled: supplied.fingerprint_enabled as boolean,
  };
  if (method === "accept_all" && OPTIONAL_KEYS.some((key) => !preferences[key])) {
    return noStore(fail("Accept all must enable all optional categories", 422, "CONSENT_ACTION_MISMATCH"));
  }
  if (method === "reject_optional" && OPTIONAL_KEYS.some((key) => preferences[key])) {
    return noStore(fail("Reject optional must disable all optional categories", 422, "CONSENT_ACTION_MISMATCH"));
  }

  const previous = parseConsentCookie(request.cookies.get(COOKIE_CONSENT_COOKIE)?.value);
  const visitorId = previous?.visitor_id ?? randomUUID();
  const status = consentStatus(preferences, previous?.preferences);
  let error: { code?: string; message?: string } | null = null;
  try {
    const metadata = preferences.analytics_enabled ? collectPrivacyVisitorMetadata(request.headers) : null;
    const admin = getSupabaseAdmin();
    const sessionClient = await createClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    const result = await (admin as any).rpc("record_cookie_consent_with_metadata", {
      p_visitor_id: visitorId,
      p_consent_version: COOKIE_CONSENT_VERSION,
      p_consent_status: status,
      p_consent_method: method,
      p_preferences: preferences,
      p_ip_address_hash: metadata?.ipAddressHash ?? null,
      p_country_code: metadata?.countryCode ?? null,
      p_user_agent_hash: metadata?.userAgentHash ?? null,
    });
    error = result.error;
    if (!error) {
      const sensitiveConsent = {
        precise_location_consent: preferences.precise_location_enabled,
        raw_ip_consent: preferences.raw_ip_enabled,
        device_diagnostics_consent: preferences.device_diagnostics_enabled,
        fingerprint_consent: preferences.fingerprint_enabled,
      };
      const latest = await (admin as any).from("consent_records").select("id").eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const recordResult = latest.data?.id ? await (admin as any).from("consent_records").update(sensitiveConsent).eq("id", latest.data.id) : { error: latest.error };
      if (latest.error || recordResult.error) error = latest.error ?? recordResult.error;
    }
    if (!error && user?.id) {
      const latest = await (admin as any).from("consent_records").select("id").eq("visitor_id", visitorId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const preferenceResult = await (admin as any).from("consent_preferences").update({ user_id: user.id }).eq("visitor_id", visitorId);
      const recordResult = latest.data?.id
        ? await (admin as any).from("consent_records").update({ user_id: user.id }).eq("id", latest.data.id)
        : { error: latest.error };
      if (latest.error || preferenceResult.error || recordResult.error) {
        console.error("[COOKIE_CONSENT_USER_LINK_FAILED]", { latest: latest.error?.message, preference: preferenceResult.error?.message, record: recordResult.error?.message });
        error = latest.error ?? preferenceResult.error ?? recordResult.error;
      }
    }
  } catch (caught) {
    console.error("[COOKIE_CONSENT_CONFIG_ERROR]", caught);
    return noStore(fail("Consent storage is temporarily unavailable", 503, "CONSENT_STORE_FAILED"));
  }
  if (error) {
    console.error("[COOKIE_CONSENT_STORE_FAILED]", { code: error.code, message: error.message });
    return noStore(fail("Your choices could not be saved. No optional analytics will run until they are saved.", 503, "CONSENT_STORE_FAILED"));
  }

  const consent: StoredConsent = {
    version: COOKIE_CONSENT_VERSION,
    visitor_id: visitorId,
    saved_at: new Date().toISOString(),
    method,
    preferences,
  };
  const response = noStore(ok({
    saved: true,
    version: consent.version,
    saved_at: consent.saved_at,
    preferences: consent.preferences,
  }));
  response.cookies.set(COOKIE_CONSENT_COOKIE, encodeConsentCookie(consent), {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: CONSENT_MAX_AGE_SECONDS,
  });
  response.cookies.set("binzeo_session_id", "", {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
