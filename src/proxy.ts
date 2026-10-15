import { NextResponse, type NextRequest } from "next/server";
import { getAllowedOrigins } from "@/lib/env";
import { getRequestId } from "@/lib/http/request-id";

const METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const HEADERS = "Authorization, Content-Type, X-Request-ID";

export function proxy(request: NextRequest) {
  const requestId = getRequestId(request);
  const origin = request.headers.get("origin");
  let allowed = false;
  try {
    allowed = Boolean(origin && getAllowedOrigins().has(origin));
  } catch (error) {
    console.error("[CORS_CONFIGURATION_ERROR]", error);
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
