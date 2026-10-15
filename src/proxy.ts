import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedOrigins } from "@/lib/env";
import { getRequestId } from "@/lib/http/request-id";

const METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const HEADERS = "Authorization, Content-Type, X-Request-ID";
let rateLimitClient: SupabaseClient | null = null;

type RateLimitRow = { allowed: boolean; retry_after_seconds?: number };

function getRateLimitClient() {
  const url = process.env.AUTH_SUPABASE_URL;
  const anonKey = process.env.AUTH_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Rate-limit identity configuration is unavailable");
  if (!rateLimitClient) {
    rateLimitClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  return rateLimitClient;
}

async function enforceRateLimit(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.endsWith("/health") || pathname.endsWith("/openapi")) return { status: "allowed" as const };

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${pathname}`));
  const bucketKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const isAuthRoute = /^\/(?:v1|api)\/auth\//.test(pathname);
  const limit = isAuthRoute ? 20 : 60;

  try {
    const { data, error } = await getRateLimitClient().rpc("consume_api_rate_limit", {
      p_bucket_key: bucketKey,
      p_limit: limit,
      p_window_seconds: 60,
    });
    if (error) return { status: "unavailable" as const };
    const row = Array.isArray(data) ? data[0] as RateLimitRow | undefined : undefined;
    if (!row) return { status: "unavailable" as const };
    if (row.allowed === false) return { status: "limited" as const, retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 60) };
    return { status: "allowed" as const };
  } catch (error) {
    console.error("[CENTRAL_RATE_LIMIT_ERROR]", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable" as const };
  }
}

export async function proxy(request: NextRequest) {
  const requestId = getRequestId(request);
  const origin = request.headers.get("origin");
  let allowed = false;
  try {
    allowed = Boolean(origin && getAllowedOrigins().has(origin));
  } catch (error) {
    console.error("[CORS_CONFIGURATION_ERROR]", error instanceof Error ? error.name : "unknown");
  }

  if (origin && !allowed) {
    const response = NextResponse.json(
      { success: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed.", request_id: requestId } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
    response.headers.set("X-Request-ID", requestId);
    return response;
  }

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    applyHeaders(response, requestId, origin && allowed ? origin : null);
    return response;
  }

  const rateLimit = await enforceRateLimit(request);
  if (rateLimit.status === "limited") {
    const response = NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later.", request_id: requestId } },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
    applyHeaders(response, requestId, origin && allowed ? origin : null);
    return response;
  }
  const isAuthRoute = /^\/(?:v1|api)\/auth\//.test(request.nextUrl.pathname);
  if (rateLimit.status === "unavailable" && isAuthRoute) {
    const response = NextResponse.json(
      { success: false, error: { code: "RATE_LIMIT_UNAVAILABLE", message: "Authentication protection is temporarily unavailable. Please try again shortly.", request_id: requestId } },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
    );
    applyHeaders(response, requestId, origin && allowed ? origin : null);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyHeaders(response, requestId, origin && allowed ? origin : null);
  return response;
}

function applyHeaders(response: NextResponse, requestId: string, allowedOrigin: string | null) {
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Access-Control-Allow-Methods", METHODS);
  response.headers.set("Access-Control-Allow-Headers", HEADERS);
  response.headers.set("Vary", "Origin");
  if (allowedOrigin) response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
}

export const config = { matcher: ["/api/:path*", "/v1/:path*"] };
