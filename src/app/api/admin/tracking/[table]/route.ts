/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { fail, ok } from "@/user/auth/lib/api/response";
import {
  authorizeTrackingRequest,
  isApiResponse,
  noStore,
  parseBoundedInteger,
  parseJsonObject,
  recordTrackingMutation,
} from "@/user/auth/lib/admin-tracking-api";
import {
  TRACKING_COLUMNS,
  TRACKING_SERVER_MANAGED_COLUMNS,
  isTrackingTable,
  type TrackingTable,
} from "@/user/auth/lib/admin-tracking-schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ table: string }> };

function getColumns(table: TrackingTable): readonly string[] {
  return TRACKING_COLUMNS[table] as readonly string[];
}

function parseFilters(raw: string | null, columns: readonly string[]): { filters?: Record<string, unknown>; error?: string } {
  if (!raw) return { filters: {} };
  if (raw.length > 4096) return { error: "Filter payload is too large" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Filter must be a valid JSON object" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Filter must be a JSON object" };
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 20) return { error: "At most 20 filters may be applied" };
  const filters: Record<string, unknown> = {};
  for (const [column, value] of entries) {
    if (!columns.includes(column)) return { error: `Unknown filter column: ${column}` };
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      return { error: `Filter value for ${column} must be a string, number, boolean, or null` };
    }
    if (typeof value === "string" && value.length > 500) {
      return { error: `Filter value for ${column} is too long` };
    }
    filters[column] = value;
  }
  return { filters };
}

function buildInsertPayload(
  body: Record<string, unknown>,
  table: TrackingTable,
  userId: string,
): { payload?: Record<string, unknown>; error?: string } {
  const columns = getColumns(table);
  const invalid = Object.keys(body).filter(
    (column) => !columns.includes(column) || TRACKING_SERVER_MANAGED_COLUMNS.has(column),
  );
  if (invalid.length) return { error: `Unsupported or server-managed fields: ${invalid.slice(0, 8).join(", ")}` };
  const payload: Record<string, unknown> = { ...body };
  if (columns.includes("created_by")) payload.created_by = userId;
  if (columns.includes("updated_by")) payload.updated_by = userId;
  if (!Object.keys(payload).length) return { error: "Provide at least one writable field" };
  return { payload };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { table } = await params;
  const authorization = await authorizeTrackingRequest(request, table, "read");
  if (authorization.response) return authorization.response;
  if (!isTrackingTable(table)) return noStore(fail("Unknown tracking table", 404, "TRACKING_TABLE_NOT_FOUND"));

  const columns = getColumns(table);
  const search = request.nextUrl.searchParams;
  const limit = parseBoundedInteger(search.get("limit"), 50, 100);
  const offset = parseBoundedInteger(search.get("offset"), 0, 1_000_000);
  if (limit === null || limit < 1 || offset === null) {
    return noStore(fail("Use limit 1-100 and a non-negative offset up to 1000000", 422, "TRACKING_PAGINATION_INVALID"));
  }
  const sortBy = search.get("sort_by") ?? (columns.includes("created_at") ? "created_at" : "id");
  if (!columns.includes(sortBy)) return noStore(fail("Unknown sort column", 422, "TRACKING_SORT_INVALID"));
  const direction = (search.get("sort_order") ?? "desc").toLowerCase();
  if (direction !== "asc" && direction !== "desc") {
    return noStore(fail("sort_order must be asc or desc", 422, "TRACKING_SORT_INVALID"));
  }
  const parsedFilters = parseFilters(search.get("filter"), columns);
  if (parsedFilters.error) return noStore(fail(parsedFilters.error, 422, "TRACKING_FILTER_INVALID"));

  try {
    let query = (authorization.context.admin.from(table) as any)
      .select(columns.join(","), { count: "estimated" });
    for (const [column, value] of Object.entries(parsedFilters.filters ?? {})) {
      query = value === null ? query.is(column, null) : query.eq(column, value);
    }
    const { data, error, count } = await query
      .order(sortBy, { ascending: direction === "asc" })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error("[TRACKING_API_LIST_FAILED]", { table, code: error.code, message: error.message });
      return noStore(fail("Tracking table data could not be loaded", 500, "TRACKING_LIST_FAILED"));
    }
    return noStore(ok({
      table,
      columns: [...columns],
      rows: data ?? [],
      total: count ?? null,
      count_accuracy: "estimated",
      limit,
      offset,
      has_more: (data?.length ?? 0) === limit,
    }));
  } catch (error) {
    console.error("[TRACKING_API_LIST_ERROR]", error);
    return noStore(fail("Tracking table data could not be loaded", 500, "TRACKING_LIST_FAILED"));
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { table } = await params;
  const authorization = await authorizeTrackingRequest(request, table, "write");
  if (authorization.response) return authorization.response;
  if (!isTrackingTable(table)) return noStore(fail("Unknown tracking table", 404, "TRACKING_TABLE_NOT_FOUND"));

  const body = await parseJsonObject(request);
  if (isApiResponse(body)) return body;
  const prepared = buildInsertPayload(body, table, authorization.context.userId);
  if (prepared.error || !prepared.payload) {
    return noStore(fail(prepared.error ?? "Invalid tracking row", 422, "TRACKING_ROW_INVALID"));
  }

  try {
    const columns = getColumns(table);
    const { data, error } = await (authorization.context.admin.from(table) as any)
      .insert(prepared.payload)
      .select(columns.join(","))
      .single();
    if (error || !data) {
      console.error("[TRACKING_API_CREATE_FAILED]", { table, code: error?.code, message: error?.message });
      return noStore(fail("Database rejected the tracking row; verify required fields and relationships", 422, "TRACKING_CREATE_FAILED"));
    }
    await recordTrackingMutation(authorization.context, "create", table, String(data.id));
    return noStore(ok({ table, row: data }, 201));
  } catch (error) {
    console.error("[TRACKING_API_CREATE_ERROR]", error);
    return noStore(fail("Tracking row could not be created", 500, "TRACKING_CREATE_FAILED"));
  }
}
