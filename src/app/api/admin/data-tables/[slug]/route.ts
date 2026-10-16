import { getAdminApiContext, getAdminDataClient, hasAdminPermission } from "@/admin/binzeo/lib/admin";
import { getTableDefinition } from "@/admin/binzeo/data-tables";
import { fail, ok } from "@/admin/binzeo/lib/api/response";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!hasAdminPermission(access, "database.read")) return fail("Database read permission required", 403, "DATABASE_READ_REQUIRED");

  const { slug } = await params;
  const definition = getTableDefinition(slug);
  if (!definition) return fail("Unknown data table", 404, "DATA_TABLE_NOT_FOUND");
  const search = new URL(request.url).searchParams;
  const requestedPage = Number.parseInt(search.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10001)) : 1;
  const pageSize = 100;
  const from = (page - 1) * pageSize;

  try {
    const db = await getAdminDataClient(access);
    const { data, error, count } = await db
      .from(definition.table)
      .select(definition.columns.join(","), { count: "exact" })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[ADMIN_DATA_TABLE_FAILED]", { slug, code: error.code });
      return fail("Table data could not be loaded", 500, "DATA_TABLE_QUERY_FAILED");
    }
    const total = count ?? 0;
    return ok({ slug, columns: definition.columns, rows: data ?? [], total, page, page_size: pageSize, page_count: Math.max(1, Math.ceil(total / pageSize)) });
  } catch {
    return fail("Table data could not be loaded", 500, "DATA_TABLE_QUERY_FAILED");
  }
}
