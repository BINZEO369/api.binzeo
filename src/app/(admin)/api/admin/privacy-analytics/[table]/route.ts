import { getAdminApiContext, getAdminDataClient } from "@/admin/binzeo/lib/admin";
import { getPrivacyAnalyticsTable } from "@/admin/binzeo/privacy-analytics/tables";
import { getPrivacyAnalyticsColumns } from "@/admin/binzeo/privacy-analytics/columns";
import { fail, ok } from "@/admin/binzeo/lib/api/response";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ table: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!access.roles.includes("super_admin") && !access.roles.includes("analytics")) return fail("Analytics permission required", 403, "ANALYTICS_READ_REQUIRED");

  const { table } = await params;
  const definition = getPrivacyAnalyticsTable(table);
  const columns = getPrivacyAnalyticsColumns(table);
  if (!definition || !columns.length) return fail("Unknown analytics table", 404, "ANALYTICS_TABLE_NOT_FOUND");
  const requestedPage = Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 20001)) : 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;

  try {
    const db = await getAdminDataClient(access);
    const { data, error, count } = await db.from(table).select(columns.join(","), { count: "exact" }).range(from, from + pageSize - 1);
    if (error) {
      console.error("[ADMIN_PRIVACY_TABLE_FAILED]", { table, code: error.code });
      return fail("Analytics data could not be loaded", 500, "ANALYTICS_QUERY_FAILED");
    }
    const rows = data ?? [];
    const total = typeof count === "number" ? count : null;
    return ok({ table, columns, rows, total, page, page_size: pageSize, has_more: total === null ? rows.length === pageSize : from + rows.length < total });
  } catch {
    return fail("Analytics data could not be loaded", 500, "ANALYTICS_QUERY_FAILED");
  }
}
