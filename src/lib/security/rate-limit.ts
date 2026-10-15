import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number }
  | { allowed: false; unavailable: true };

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeRateLimit(
  supabase: SupabaseClient,
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const bucketKey = await sha256(`${bucket}|${ip}`);
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[RATE_LIMIT_BACKEND_ERROR]", { code: error.code, message: error.message });
    return { allowed: false, unavailable: true };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { allowed: false, unavailable: true };
  if (row.allowed === false) return { allowed: false, retryAfterSeconds: Number(row.retry_after_seconds) || windowSeconds };
  return { allowed: true, remaining: Number(row.remaining) || 0 };
}
