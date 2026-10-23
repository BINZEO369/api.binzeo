import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { parseUserAgent } from "@/binzeo/auth/lib/device-tracking";

type HeaderReader = { get(name: string): string | null };

export type PrivacyVisitorMetadata = {
  rawIpAddress: string | null;
  ipVersion: string | null;
  ipAddressHash: string | null;
  userAgentHash: string | null;
  countryCode: string | null;
  regionCode: string | null;
  cityName: string | null;
  deviceCategory: string;
  browserName: string | null;
  browserVersion: string | null;
  operatingSystem: string | null;
  operatingSystemVersion: string | null;
  languageCode: string | null;
  timezone: string | null;
};

function firstValidIp(headers: HeaderReader): string | null {
  const raw = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  if (!raw) return null;
  const candidate = raw.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

function hashIdentifier(kind: "ip" | "ua", value: string | null): string | null {
  if (!value) return null;
  const key = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Privacy identifier hashing key is not configured");
  return createHmac("sha256", key).update(`binzeo-privacy-v1:${kind}:${value}`).digest("hex");
}

function safeHeader(headers: HeaderReader, name: string, maxLength: number): string | null {
  const value = headers.get(name)?.trim();
  if (!value || value.length > maxLength) return null;
  return value;
}

function cityHeader(headers: HeaderReader): string | null {
  const encoded = safeHeader(headers, "x-vercel-ip-city", 360);
  if (!encoded) return null;
  try {
    const city = decodeURIComponent(encoded).normalize("NFKC").trim();
    return city && city.length <= 120 ? city : null;
  } catch {
    return null;
  }
}

/**
 * Read only platform-provided IP geolocation and derived browser metadata.
 * Call this only after analytics consent has been checked, or at the consent
 * endpoint only when the submitted preferences explicitly enable analytics.
 */
export function collectPrivacyVisitorMetadata(headers: HeaderReader): PrivacyVisitorMetadata {
  const ip = firstValidIp(headers);
  const userAgent = safeHeader(headers, "user-agent", 1000);
  const parsed = parseUserAgent(headers);
  const rawCountry = safeHeader(headers, "x-vercel-ip-country", 2)?.toUpperCase() ?? null;
  const rawRegion = safeHeader(headers, "x-vercel-ip-country-region", 3)?.toUpperCase() ?? null;
  const rawTimezone = safeHeader(headers, "x-vercel-ip-timezone", 64);
  const rawLanguage = safeHeader(headers, "accept-language", 128)?.split(",")[0]?.split(";")[0]?.trim().slice(0, 16) ?? null;

  return {
    rawIpAddress: ip,
    ipVersion: ip ? (isIP(ip) === 6 ? "IPv6" : "IPv4") : null,
    ipAddressHash: hashIdentifier("ip", ip),
    userAgentHash: hashIdentifier("ua", userAgent),
    countryCode: rawCountry && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null,
    regionCode: rawRegion && /^[A-Z0-9-]{1,3}$/.test(rawRegion) ? rawRegion : null,
    cityName: cityHeader(headers),
    deviceCategory: parsed.deviceType,
    browserName: parsed.browser === "Unknown" ? null : parsed.browser,
    browserVersion: parsed.browserVersion,
    operatingSystem: parsed.operatingSystem === "Unknown" ? null : parsed.operatingSystem,
    operatingSystemVersion: parsed.osVersion,
    languageCode: rawLanguage || null,
    timezone: rawTimezone && /^[A-Za-z0-9_+./-]+$/.test(rawTimezone) ? rawTimezone : null,
  };
}
