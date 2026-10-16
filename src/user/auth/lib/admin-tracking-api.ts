/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminApiContext } from "@/admin/binzeo/lib/admin";
import { getSupabaseAdmin } from "@/user/auth/lib/supabase/admin";
import { fail } from "@/user/auth/lib/api/response";
import {
  isTrackingTable,
  TRACKING_APPEND_ONLY_TABLES,
  TRACKING_DELETABLE_TABLES,
  TRACKING_MUTABLE_TABLES,
  type TrackingTable,
} from "@/user/auth/lib/admin-tracking-schema";

export type TrackingOperation = "read" | "write" | "delete";
export type TrackingContext = {
  admin: ReturnType<typeof getSupabaseAdmin>;
  userId: string;
  role: "super_admin" | "analytics";
};
type TrackingAuthorization =
  | { context: TrackingContext; response: null }
  | { context: null; response: NextResponse };

export function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

export async function authorizeTrackingRequest(
  request: NextRequest,
  tableName: string,
  operation: TrackingOperation,
): Promise<TrackingAuthorization> {
  const deny = (message: string, status: number, code: string) => ({
    context: null,
    response: noStore(fail(message, status, code)),
  }) as const;

  if (!isTrackingTable(tableName)) {
    return deny("Unknown tracking table", 404, "TRACKING_TABLE_NOT_FOUND");
  }

  const session = await getAdminApiContext(request);
  if (!session.user || !session.access) return deny("Authentication required", 401, "UNAUTHORIZED");

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    console.error("[TRACKING_API_CONFIG_ERROR]", error);
    return deny("Tracking API is not configured", 500, "TRACKING_API_UNAVAILABLE");
  }

  const roles: unknown[] = session.access.roles;
  const isSuperAdmin = roles.includes("super_admin");
  const isAnalytics = roles.includes("analytics");
  if (!isSuperAdmin && !isAnalytics) {
    return deny("Analytics or Super Admin role required", 403, "TRACKING_FORBIDDEN");
  }
  if (operation !== "read" && !isSuperAdmin) {
    return deny("Only Super Admin can modify tracking configuration", 403, "TRACKING_WRITE_FORBIDDEN");
  }
  if (operation !== "read" && TRACKING_APPEND_ONLY_TABLES.has(tableName as TrackingTable)) {
    return deny("Append-only tracking records can only be written by trusted server ingestion", 405, "TRACKING_APPEND_ONLY");
  }
  if (operation !== "read" && !TRACKING_MUTABLE_TABLES.has(tableName as TrackingTable)) {
    return deny("This table is read-only through the Admin API", 405, "TRACKING_TABLE_READ_ONLY");
  }
  if (operation === "delete" && !TRACKING_DELETABLE_TABLES.has(tableName as TrackingTable)) {
    return deny("Deletion is not enabled for this table", 405, "TRACKING_DELETE_FORBIDDEN");
  }

  return {
    context: { admin, userId: session.user.id, role: isSuperAdmin ? "super_admin" : "analytics" },
    response: null,
  };
}

export function parseBoundedInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null || value === "") return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export async function parseJsonObject(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return noStore(fail("Request body is too large", 413, "TRACKING_BODY_TOO_LARGE"));
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 64 * 1024) {
    return noStore(fail("Request body is too large", 413, "TRACKING_BODY_TOO_LARGE"));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return noStore(fail("A valid JSON object is required", 400, "TRACKING_INVALID_JSON"));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return noStore(fail("A JSON object is required", 422, "TRACKING_INVALID_BODY"));
  }
  return parsed as Record<string, unknown>;
}

export function isApiResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function recordTrackingMutation(
  context: TrackingContext,
  action: "create" | "update" | "delete",
  table: TrackingTable,
  targetId: string,
): Promise<void> {
  const { error } = await (context.admin.from("security_audit_logs") as any).insert({
    actor_user_id: context.userId,
    actor_type: "admin",
    action_type: `privacy_analytics.${action}`,
    action_description: `Super Admin ${action}d a row in ${table}`,
    target_type: table,
    target_id: targetId,
    result_status: "success",
    risk_level: action === "delete" ? "high" : "medium",
    metadata: { api: "admin/tracking", role: context.role },
  });
  if (error) console.error("[TRACKING_API_AUDIT_WRITE_FAILED]", error);
}
