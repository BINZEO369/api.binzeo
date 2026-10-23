import { createHash } from "node:crypto";

type HeaderReader = { get(name: string): string | null };
type DeviceQuery = {
  upsert(values: Record<string, unknown>, options: { onConflict: string }): DeviceQuery;
  select(columns: string): DeviceQuery;
  single(): Promise<{ data: { id?: string } | null; error: { message?: string } | null }>;
};
type SupabaseLike = { from(table: string): DeviceQuery };

export type ParsedDevice = {
  deviceId: string;
  deviceName: string;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  operatingSystem: string;
  osVersion: string | null;
  browser: string;
  browserVersion: string | null;
  userAgent: string | null;
};

function version(ua: string, pattern: RegExp) {
  return ua.match(pattern)?.[1]?.replace(/_/g, ".") ?? null;
}

export function parseUserAgent(headers: HeaderReader, fallbackKey = "") : ParsedDevice {
  const userAgent = headers.get("user-agent")?.slice(0, 1000) || null;
  const ua = userAgent ?? "";
  const deviceHeader = headers.get("x-binzeo-device-id")?.trim().slice(0, 128);
  const deviceId = deviceHeader || `server-${createHash("sha256").update(fallbackKey || ua).digest("hex").slice(0, 32)}`;

  let deviceType: ParsedDevice["deviceType"] = "desktop";
  if (/bot|crawler|spider|slurp|headless/i.test(ua)) deviceType = "bot";
  else if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) deviceType = "tablet";
  else if (/Mobile|iPhone|Android/i.test(ua)) deviceType = "mobile";
  else if (!ua) deviceType = "unknown";

  let operatingSystem = "Unknown";
  let osVersion: string | null = null;
  if (/Android/i.test(ua)) {
    operatingSystem = "Android";
    osVersion = version(ua, /Android\s([\d.]+)/i);
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    operatingSystem = /iPad/i.test(ua) ? "iPadOS" : "iOS";
    osVersion = version(ua, /(?:CPU (?:iPhone )?OS|iPhone OS)\s([\d_]+)/i);
  } else if (/Windows/i.test(ua)) {
    operatingSystem = "Windows";
    const windows = version(ua, /Windows NT\s([\d.]+)/i);
    osVersion = ({ "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" } as Record<string, string>)[windows ?? ""] ?? windows;
  } else if (/Mac OS X/i.test(ua)) {
    operatingSystem = "macOS";
    osVersion = version(ua, /Mac OS X\s([\d_]+)/i);
  } else if (/CrOS/i.test(ua)) {
    operatingSystem = "ChromeOS";
    osVersion = version(ua, /CrOS [^ ]+\s([\d.]+)/i);
  } else if (/Linux/i.test(ua)) {
    operatingSystem = "Linux";
  }

  let browser = "Unknown";
  let browserVersion: string | null = null;
  const browsers: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/i],
    ["Opera", /(?:OPR|Opera)\/([\d.]+)/i],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/i],
    ["Firefox", /Firefox\/([\d.]+)/i],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/i],
    ["Safari", /Version\/([\d.]+).*Safari\//i],
  ];
  for (const [name, pattern] of browsers) {
    const found = version(ua, pattern);
    if (found) {
      browser = name;
      browserVersion = found;
      break;
    }
  }
  if (browser === "Unknown" && /Facebook|FBAN|FBAV/i.test(ua)) browser = "Facebook In-App";

  const model = ua.match(/Android[^;]*;\s*(?:[a-z]{2}-[A-Z]{2};\s*)?([^;)]+?)(?:\sBuild\/|;wv\)|\))/i)?.[1]?.trim();
  const deviceName = model || (deviceType === "mobile" ? operatingSystem : `${operatingSystem} desktop`);

  return { deviceId, deviceName, deviceType, operatingSystem, osVersion, browser, browserVersion, userAgent };
}

export async function upsertUserDevice(
  supabase: unknown,
  userId: string,
  headers: HeaderReader,
  ipAddress: string,
) {
  const parsed = parseUserAgent(headers, `${userId}|${ipAddress}`);
  const client = supabase as SupabaseLike;
  const { data, error } = await client
    .from("user_devices")
    .upsert(
      {
        user_id: userId,
        device_id: parsed.deviceId,
        device_name: parsed.deviceName,
        device_type: parsed.deviceType,
        operating_system: parsed.operatingSystem,
        os_version: parsed.osVersion,
        browser: parsed.browser,
        browser_version: parsed.browserVersion,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" },
    )
    .select("id")
    .single();
  if (error) {
    console.error("[DEVICE_TRACKING_ERROR]", error);
    return { id: null, parsed };
  }
  return { id: data?.id ?? null, parsed };
}
