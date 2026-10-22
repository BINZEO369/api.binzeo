import express from "express";
import { adminAuth, supabase } from "./admin-context";
import { JABIYEN_ADMIN_TABLES } from "./data-table-registry";

const router = express.Router();
const tableByName = new Map<string, (typeof JABIYEN_ADMIN_TABLES)[number]>();
for (const table of JABIYEN_ADMIN_TABLES) tableByName.set(table.name, table);

router.get("/api/admin/tables", adminAuth, (_req, res) => {
  res.json({
    success: true,
    tables: JABIYEN_ADMIN_TABLES.map((table) => ({
      name: table.name,
      columns: table.columns,
      primaryKeys: table.primaryKeys,
    })),
  });
});

router.get("/api/admin/tables/:table", adminAuth, async (req, res) => {
  const table = tableByName.get(String(req.params.table || ""));
  if (!table) {
    return res.status(404).json({ success: false, error: "Table not found or not available." });
  }

  const requestedPage = Number.parseInt(String(req.query.page || "1"), 10);
  const requestedPageSize = Number.parseInt(String(req.query.page_size || "25"), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(100, Math.max(10, requestedPageSize))
    : 25;
  const from = (page - 1) * pageSize;

  try {
    let query = supabase.from(table.name).select("*", { count: "exact" });
    for (const key of table.primaryKeys) {
      query = query.order(key, { ascending: true });
    }
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) {
      return res.status(500).json({ success: false, error: "Could not load this table." });
    }

    const total = count || 0;
    return res.json({
      success: true,
      table: table.name,
      columns: table.columns,
      rows: data || [],
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch {
    return res.status(500).json({ success: false, error: "Could not load this table." });
  }
});

export default router;
