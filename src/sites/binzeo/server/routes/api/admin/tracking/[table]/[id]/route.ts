/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { fail, ok } from "@/sites/binzeo/auth/lib/api/response";
import {
  authorizeTrackingRequest,
  isApiResponse,
  noStore,
  parseJsonObject,
  recordTrackingMutation,
} from "@/sites/binzeo/auth/lib/admin-tracking-api";
import {
  TRACKING_COLUMNS,
  TRACKING_DELETABLE_TABLES,
  TRACKING_SERVER_MANAGED_COLUMNS,
  isTrackingTable,
  type TrackingTable,
} from "@/sites/binzeo/auth/lib/admin-tracking-schema";


type RouteContext = { params: Promise<{ table: string; id: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getColumns(table: TrackingTable): readonly string[] {
  return TRACKING_COLUMNS[table] as readonly string[];
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { table, id } = await params;
  const authorization = await authorizeTrackingRequest(request, table, "read");
  if (authorization.response) return authorization.response;
  if (!isTrackingTable(table)) return noStore(fail("Unknown tracking table", 404, "TRACKING_TABLE_NOT_FOUND"));
  if (!UUID_PATTERN.test(id)) return noStore(fail("A valid row UUID is required", 422, "TRACKING_ID_INVALID"));

  try {
    const columns = getColumns(table);
    const { data, error } = await (authorization.context.admin.from(table) as any)
      .select(columns.join(","))
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[TRACKING_API_ROW_FAILED]", { table, code: error.code, message: error.message });
      return noStore(fail("Tracking row could not be loaded", 500, "TRACKING_ROW_LOAD_FAILED"));
    }
    if (!data) return noStore(fail("Tracking row not found", 404, "TRACKING_ROW_NOT_FOUND"));
    return noStore(ok({ table, row: data }));
  } catch (error) {
    console.error("[TRACKING_API_ROW_ERROR]", error);
    return noStore(fail("Tracking row could not be loaded", 500, "TRACKING_ROW_LOAD_FAILED"));
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { table, id } = await params;
  const authorization = await authorizeTrackingRequest(request, table, "write");
  if (authorization.response) return authorization.response;
  if (!isTrackingTable(table)) return noStore(fail("Unknown tracking table", 404, "TRACKING_TABLE_NOT_FOUND"));
  if (!UUID_PATTERN.test(id)) return noStore(fail("A valid row UUID is required", 422, "TRACKING_ID_INVALID"));

  const body = await parseJsonObject(request);
  if (isApiResponse(body)) return body;
  const columns = getColumns(table);
  const invalid = Object.keys(body).filter(
    (column) => !columns.includes(column) || TRACKING_SERVER_MANAGED_COLUMNS.has(column),
  );
  if (invalid.length) {
    return noStore(fail(`Unsupported or server-managed fields: ${invalid.slice(0, 8).join(", ")}`, 422, "TRACKING_FIELDS_INVALID"));
  }
  if (!Object.keys(body).length) return noStore(fail("Provide at least one field to update", 422, "TRACKING_UPDATE_EMPTY"));

  const patch: Record<string, unknown> = { ...body };
  if (columns.includes("updated_at")) patch.updated_at = new Date().toISOString();
  if (columns.includes("updated_by")) patch.updated_by = authorization.context.userId;

  try {
    const { data, error } = await (authorization.context.admin.from(table) as any)
      .update(patch)
      .eq("id", id)
      .select(columns.join(","))
      .maybeSingle();
    if (error) {
      console.error("[TRACKING_API_UPDATE_FAILED]", { table, code: error.code, message: error.message });
      return noStore(fail("Database rejected the tracking update; verify values and relationships", 422, "TRACKING_UPDATE_FAILED"));
    }
    if (!data) return noStore(fail("Tracking row not found", 404, "TRACKING_ROW_NOT_FOUND"));
    await recordTrackingMutation(authorization.context, "update", table, id);
    return noStore(ok({ table, row: data }));
  } catch (error) {
    console.error("[TRACKING_API_UPDATE_ERROR]", error);
    return noStore(fail("Tracking row could not be updated", 500, "TRACKING_UPDATE_FAILED"));
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { table, id } = await params;
  const authorization = await authorizeTrackingRequest(request, table, "delete");
  if (authorization.response) return authorization.response;
  if (!isTrackingTable(table)) return noStore(fail("Unknown tracking table", 404, "TRACKING_TABLE_NOT_FOUND"));
  if (!TRACKING_DELETABLE_TABLES.has(table as TrackingTable)) {
    return noStore(fail("Deletion is not enabled for this table", 405, "TRACKING_DELETE_FORBIDDEN"));
  }
  if (!UUID_PATTERN.test(id)) return noStore(fail("A valid row UUID is required", 422, "TRACKING_ID_INVALID"));

  try {
    const { data, error } = await (authorization.context.admin.from(table) as any)
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[TRACKING_API_DELETE_FAILED]", { table, code: error.code, message: error.message });
      return noStore(fail("Tracking row could not be deleted", 422, "TRACKING_DELETE_FAILED"));
    }
    if (!data) return noStore(fail("Tracking row not found", 404, "TRACKING_ROW_NOT_FOUND"));
    await recordTrackingMutation(authorization.context, "delete", table, id);
    return noStore(ok({ table, id, deleted: true }));
  } catch (error) {
    console.error("[TRACKING_API_DELETE_ERROR]", error);
    return noStore(fail("Tracking row could not be deleted", 500, "TRACKING_DELETE_FAILED"));
  }
}
