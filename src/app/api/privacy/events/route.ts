/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { fail, ok } from "@/modules/identity/lib/api/response";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { collectPrivacyVisitorMetadata } from "@/modules/identity/lib/privacy-visitor-metadata";
import { ANALYTICS_SESSION_COOKIE, ANALYTICS_SESSION_MAX_AGE_SECONDS, COOKIE_CONSENT_COOKIE, COOKIE_CONSENT_VERSION, allowPrivacyRequest, isSameOriginRequest, isUuid, parseConsentCookie } from "@/modules/identity/lib/privacy-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore<T extends Response>(response: T): T { response.headers.set("Cache-Control", "private, no-store, max-age=0"); return response; }
function cleanText(value: unknown, max: number): string | null { return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : null; }
function boundedNumber(value: unknown, min: number, max: number): number | null { const number = typeof value === "number" ? value : Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null; }
function clientText(value: unknown, max: number): string | null { return typeof value === "string" && value.length <= max ? value : null; }
function sanitizePagePath(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048 || !input.startsWith("/") || input.startsWith("//")) return null;
  let path: string;
  try { const parsed = new URL(input, "https://path.invalid"); if (parsed.origin !== "https://path.invalid") return null; path = parsed.pathname; } catch { return null; }
  path = path.replace(/\/u\/[^/]+(?=\/|$)/i, "/u/:profile").replace(/\/profile\/by-username\/[^/]+(?=\/|$)/i, "/profile/by-username/:username").replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi, "/:id").replace(/\/[a-f0-9]{32,}(?=\/|$)/gi, "/:token");
  return path.length <= 255 && !path.includes("?") && !path.includes("#") ? path : null;
}
function sanitizeReferrerOrigin(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  try { const url = new URL(input); return url.protocol === "https:" || url.protocol === "http:" ? url.origin.slice(0, 255) : null; } catch { return null; }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return noStore(fail("Same-origin request required", 403, "TRACKING_ORIGIN_FORBIDDEN"));
  const consent = parseConsentCookie(request.cookies.get(COOKIE_CONSENT_COOKIE)?.value);
  if (!consent || consent.version !== COOKIE_CONSENT_VERSION || consent.preferences.analytics_enabled !== true) return noStore(fail("Analytics consent is required", 403, "ANALYTICS_CONSENT_REQUIRED"));
  if (!allowPrivacyRequest(request, `analytics:${consent.visitor_id}`, 90, 60 * 1000)) return noStore(fail("Too many analytics events", 429, "ANALYTICS_RATE_LIMITED"));
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8192) return noStore(fail("Request body is too large", 413, "ANALYTICS_BODY_TOO_LARGE"));
  let body: unknown;
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 8192) return noStore(fail("Request body is too large", 413, "ANALYTICS_BODY_TOO_LARGE")); body = JSON.parse(raw); } catch { return noStore(fail("A valid JSON body is required", 400, "ANALYTICS_INVALID_JSON")); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return noStore(fail("A JSON object is required", 422, "ANALYTICS_INVALID_BODY"));

  const input = body as Record<string, unknown>;
  const eventType = input.event_type === "engagement" ? "engagement" : "page_view";
  const pagePath = sanitizePagePath(input.page_path);
  const pageViewId = isUuid(input.page_view_id) ? input.page_view_id : null;
  if (!pagePath || !pageViewId) return noStore(fail("A safe page path and valid page-view ID are required", 422, "ANALYTICS_PAGE_VIEW_INVALID"));

  const sessionId = isUuid(request.cookies.get(ANALYTICS_SESSION_COOKIE)?.value) ? request.cookies.get(ANALYTICS_SESSION_COOKIE)!.value : randomUUID();
  const pageTitle = cleanText(input.page_title, 255);
  const referrerOrigin = sanitizeReferrerOrigin(input.referrer_origin);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const metadata = collectPrivacyVisitorMetadata(request.headers);
  const sensitiveExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const locationData = consent.preferences.precise_location_enabled ? {
    gps_latitude: boundedNumber(input.gps_latitude, -90, 90),
    gps_longitude: boundedNumber(input.gps_longitude, -180, 180),
    gps_accuracy_meters: boundedNumber(input.gps_accuracy_meters, 0, 100000),
    gps_altitude_meters: boundedNumber(input.gps_altitude_meters, -1000, 100000),
    gps_heading: boundedNumber(input.gps_heading, 0, 360),
    gps_speed_mps: boundedNumber(input.gps_speed_mps, 0, 1000),
    gps_captured_at: clientText(input.gps_captured_at, 40),
    location_permission_status: clientText(input.location_permission_status, 32),
    location_source: clientText(input.location_source, 64),
  } : {};
  const deviceData = consent.preferences.device_diagnostics_enabled ? {
    screen_width: boundedNumber(input.screen_width, 1, 10000), screen_height: boundedNumber(input.screen_height, 1, 10000),
    viewport_width: boundedNumber(input.viewport_width, 1, 10000), viewport_height: boundedNumber(input.viewport_height, 1, 10000),
    device_pixel_ratio: boundedNumber(input.device_pixel_ratio, 0.1, 20), touch_points: boundedNumber(input.touch_points, 0, 100),
    hardware_concurrency: boundedNumber(input.hardware_concurrency, 1, 512), device_memory_gb: boundedNumber(input.device_memory_gb, 0, 1024),
    network_type: clientText(input.network_type, 32), network_downlink_mbps: boundedNumber(input.network_downlink_mbps, 0, 100000),
    webgl_vendor: clientText(input.webgl_vendor, 255), webgl_renderer: clientText(input.webgl_renderer, 255),
  } : {};
  const fingerprintData = consent.preferences.fingerprint_enabled ? { device_fingerprint_hash: /^[0-9a-f]{64}$/i.test(String(input.device_fingerprint_hash ?? "")) ? String(input.device_fingerprint_hash) : null } : {};
  const sensitiveData = {
    ...(consent.preferences.raw_ip_enabled ? { raw_ip_address: metadata.rawIpAddress, ip_version: metadata.ipVersion } : {}),
    ...locationData, ...deviceData, ...fingerprintData,
    sensitive_data_expires_at: sensitiveExpiry,
  };

  try {
    const admin = getSupabaseAdmin();
    if (eventType === "engagement") {
      const scrollDepth = boundedNumber(input.scroll_depth_percent, 0, 100);
      const seconds = boundedNumber(input.time_on_page_seconds, 0, 86400);
      const duration = seconds === null ? 0 : Math.floor(seconds);
      const { error: pageError } = await (admin as any).from("page_views").update({
        page_title: pageTitle,
        scroll_depth_percent: scrollDepth,
        time_on_page_seconds: duration,
        ...sensitiveData,
      }).eq("page_view_id", pageViewId).eq("visitor_id", consent.visitor_id).eq("session_id", sessionId);
      const { error: sessionError } = await (admin as any).from("visitor_sessions").update({
        session_duration_seconds: duration,
        updated_at: new Date().toISOString(),
        ...sensitiveData,
      }).eq("session_id", sessionId).eq("visitor_id", consent.visitor_id);
      if (pageError || sessionError) return noStore(fail("Page engagement could not be stored", 503, "ANALYTICS_ENGAGEMENT_FAILED"));
      return noStore(ok({ accepted: true, event_type: eventType }));
    }

    const optional = Object.values(consent.preferences).filter((value) => typeof value === "boolean");
    const { error } = await (admin as any).rpc("record_first_party_page_view_enriched", {
      p_visitor_id: consent.visitor_id,
      p_session_id: sessionId,
      p_page_view_id: pageViewId,
      p_page_path: pagePath,
      p_referrer_origin: referrerOrigin,
      p_country_code: metadata.countryCode,
      p_region_code: metadata.regionCode,
      p_city_name: metadata.cityName,
      p_device_category: metadata.deviceCategory,
      p_browser_name: metadata.browserName,
      p_browser_version: metadata.browserVersion,
      p_operating_system: metadata.operatingSystem,
      p_operating_system_version: metadata.operatingSystemVersion,
      p_language_code: metadata.languageCode,
      p_timezone: metadata.timezone,
      p_consent_state: optional.every(Boolean) ? "all" : "partial",
      p_consent_version: consent.version,
    });
    if (error) return noStore(fail("Analytics event could not be stored", 503, "ANALYTICS_STORE_FAILED"));

    const userId = user?.id ?? null;
    const utm = {
      utm_source: cleanText(input.utm_source, 120),
      utm_medium: cleanText(input.utm_medium, 120),
      utm_campaign: cleanText(input.utm_campaign, 200),
      utm_term: cleanText(input.utm_term, 200),
      utm_content: cleanText(input.utm_content, 200),
    };
    const pageUpdate = {
      user_id: userId,
      page_title: pageTitle,
      device_category: metadata.deviceCategory,
      browser_name: metadata.browserName,
      country_code: metadata.countryCode,
      ...sensitiveData,
    };
    const eventUpdate = {
      user_id: userId,
      page_title: pageTitle,
      device_category: metadata.deviceCategory,
      browser_name: metadata.browserName,
      operating_system: metadata.operatingSystem,
      country_code: metadata.countryCode,
      is_anonymized: !userId,
      event_properties: { ...utm },
      ...sensitiveData,
    };
    const sessionUpdate = {
      user_id: userId,
      is_authenticated: Boolean(userId),
      device_category: metadata.deviceCategory,
      browser_name: metadata.browserName,
      operating_system: metadata.operatingSystem,
      country_code: metadata.countryCode,
      ...utm,
      ...sensitiveData,
    };
    const visitorUpdate = {
      is_registered: Boolean(userId),
      linked_user_id: userId,
      country_code: metadata.countryCode,
      region_code: metadata.regionCode,
      city_name: metadata.cityName,
      device_category: metadata.deviceCategory,
      browser_name: metadata.browserName,
      browser_version: metadata.browserVersion,
      operating_system: metadata.operatingSystem,
      operating_system_version: metadata.operatingSystemVersion,
      language_code: metadata.languageCode,
      timezone: metadata.timezone,
      updated_at: new Date().toISOString(),
      ...sensitiveData,
    };
    const [pageResult, eventResult, sessionResult, visitorResult] = await Promise.all([
      (admin as any).from("page_views").update(pageUpdate).eq("page_view_id", pageViewId).eq("visitor_id", consent.visitor_id),
      (admin as any).from("analytics_events").update(eventUpdate).eq("event_id", pageViewId).eq("visitor_id", consent.visitor_id),
      (admin as any).from("visitor_sessions").update(sessionUpdate).eq("session_id", sessionId).eq("visitor_id", consent.visitor_id),
      (admin as any).from("anonymous_visitors").update(visitorUpdate).eq("visitor_id", consent.visitor_id),
    ]);
    if (pageResult.error || eventResult.error || sessionResult.error || visitorResult.error) {
      console.error("[FIRST_PARTY_ANALYTICS_ENRICH_FAILED]", { page: pageResult.error?.message, event: eventResult.error?.message, session: sessionResult.error?.message, visitor: visitorResult.error?.message });
      return noStore(fail("Analytics enrichment could not be stored", 503, "ANALYTICS_ENRICH_FAILED"));
    }
  } catch (caught) {
    console.error("[FIRST_PARTY_ANALYTICS_CONFIG_ERROR]", caught);
    return noStore(fail("Analytics storage is temporarily unavailable", 503, "ANALYTICS_STORE_FAILED"));
  }

  const response = noStore(ok({ accepted: true, event_type: eventType, authenticated: Boolean(user) }));
  response.cookies.set(ANALYTICS_SESSION_COOKIE, sessionId, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: ANALYTICS_SESSION_MAX_AGE_SECONDS });
  return response;
}
