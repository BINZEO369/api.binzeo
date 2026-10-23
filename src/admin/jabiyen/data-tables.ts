import express from "express";
import { adminAuth, supabase } from "./admin-context";
import { JABIYEN_ADMIN_TABLES } from "./data-table-registry";
import { JABIYEN_CONTENT_SECTION_SPECS } from "./data-table-sections";

const router = express.Router();

type ColumnDefinition = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
};
type TableDefinition = {
  name: string;
  columns: readonly ColumnDefinition[];
  primaryKeys: readonly string[];
};
type AuthenticatedAdminRequest = express.Request & {
  user?: { id?: string };
  admin?: { email?: string; full_name?: string; role?: string };
};

const registry = new Map<string, TableDefinition>(
  (JABIYEN_ADMIN_TABLES as readonly TableDefinition[]).map((table) => [table.name, table]),
);
const sections = JABIYEN_CONTENT_SECTION_SPECS.map((spec) => {
  const table = registry.get(spec.name);
  if (!table) throw new Error(`JABIYEN admin section has no registered table: ${spec.name}`);
  const availableColumns = new Set(table.columns.map((column) => column.name));
  for (const column of spec.editableColumns) {
    if (!availableColumns.has(column)) {
      throw new Error(`JABIYEN admin section ${spec.name} references unknown column: ${column}`);
    }
  }
  if (table.primaryKeys.length !== 1) {
    throw new Error(`JABIYEN admin section ${spec.name} must have exactly one primary key`);
  }
  return { ...spec, table };
});
const sectionByName = new Map(sections.map((section) => [section.name, section]));

function sectionResponse(section: (typeof sections)[number]) {
  return {
    name: section.name,
    title: section.title,
    description: section.description,
    group: section.group,
    path: section.path,
    columns: section.table.columns,
    primaryKeys: section.table.primaryKeys,
    editableColumns: section.editableColumns,
    canWrite: section.editableColumns.length > 0,
  };
}

function getSection(req: express.Request, res: express.Response) {
  const section = sectionByName.get(String(req.params.table || ""));
  if (!section) {
    res.status(404).json({ success: false, error: "This website section is not available." });
    return null;
  }
  return section;
}

function parsePayload(
  input: unknown,
  section: (typeof sections)[number],
  creating: boolean,
): { payload?: Record<string, unknown>; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "A JSON object is required." };
  }
  const source = input as Record<string, unknown>;
  const allowed = new Set(section.editableColumns);
  const unknown = Object.keys(source).filter((key) => !allowed.has(key));
  if (unknown.length) return { error: `Fields cannot be changed here: ${unknown.join(", ")}` };
  if (creating && Object.keys(source).length === 0) return { error: "Enter at least one field." };
  if (!creating && Object.keys(source).length === 0) return { error: "Enter at least one field to update." };

  const columns = new Map(section.table.columns.map((column) => [column.name, column]));
  const payload: Record<string, unknown> = {};
  for (const name of section.editableColumns) {
    const value = source[name];
    const column = columns.get(name)!;
    const required = !column.nullable && column.default === null;
    if (value === undefined) {
      if (creating && required) return { error: `${name} is required.` };
      continue;
    }
    if (value === null || value === "") {
      if (column.nullable) {
        payload[name] = null;
        continue;
      }
      if (required) return { error: `${name} is required.` };
      if (value === null) return { error: `${name} cannot be null.` };
    }

    const type = column.type.toLowerCase();
    if (type === "boolean") {
      if (typeof value === "boolean") payload[name] = value;
      else if (value === "true") payload[name] = true;
      else if (value === "false") payload[name] = false;
      else return { error: `${name} must be true or false.` };
      continue;
    }
    if (["smallint", "integer", "int2", "int4"].includes(type)) {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isSafeInteger(number)) return { error: `${name} must be a whole number.` };
      payload[name] = number;
      continue;
    }
    if (["bigint", "int8"].includes(type)) {
      const text = String(value);
      if (!/^\d+$/.test(text)) return { error: `${name} must be a valid positive integer.` };
      payload[name] = text;
      continue;
    }
    if (["numeric", "decimal", "real", "double precision", "float4", "float8"].includes(type)) {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(number)) return { error: `${name} must be a valid number.` };
      payload[name] = number;
      continue;
    }
    if (type === "date") {
      const text = String(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
        return { error: `${name} must be a valid date.` };
      }
      payload[name] = text;
      continue;
    }
    if (type.includes("timestamp")) {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return { error: `${name} must be a valid date and time.` };
      payload[name] = date.toISOString();
      continue;
    }
    payload[name] = typeof value === "string" ? value : String(value);
  }

  if (creating) {
    for (const name of section.editableColumns) {
      const column = columns.get(name)!;
      if (!column.nullable && column.default === null && (payload[name] === undefined || payload[name] === "")) {
        return { error: `${name} is required.` };
      }
    }
  }
  return { payload };
}

class WriteTimeoutError extends Error {
  constructor() {
    super("JABIYEN section write timed out");
    this.name = "WriteTimeoutError";
  }
}

async function withWriteTimeout<T>(operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new WriteTimeoutError());
    }, 7000);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

router.get("/api/admin/session", adminAuth, (req, res) => {
  const adminRequest = req as AuthenticatedAdminRequest;
  res.json({
    success: true,
    data: { user: { id: adminRequest.user?.id, email: adminRequest.admin?.email, full_name: adminRequest.admin?.full_name, role: adminRequest.admin?.role } },
  });
});

router.get("/api/admin/tables", adminAuth, (req, res) => {
  const adminRequest = req as AuthenticatedAdminRequest;
  res.json({
    success: true,
    admin: { email: adminRequest.admin?.email, full_name: adminRequest.admin?.full_name },
    tables: sections.map(sectionResponse),
  });
});

router.get("/api/admin/tables/:table", adminAuth, async (req, res) => {
  const section = getSection(req, res);
  if (!section) return;

  const requestedPage = Number.parseInt(String(req.query.page || "1"), 10);
  const requestedPageSize = Number.parseInt(String(req.query.page_size || "25"), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const pageSize = Number.isFinite(requestedPageSize) ? Math.min(100, Math.max(10, requestedPageSize)) : 25;
  const from = (page - 1) * pageSize;
  try {
    let query = supabase.from(section.table.name as never).select(section.table.columns.map((column) => column.name).join(","), { count: "exact" });
    const sortColumn = section.table.columns.some((column) => column.name === "sort_order") ? "sort_order" : section.table.primaryKeys[0];
    query = query.order(sortColumn, { ascending: true });
    if (sortColumn !== section.table.primaryKeys[0]) query = query.order(section.table.primaryKeys[0], { ascending: true });
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) {
      console.error("[JABIYEN_ADMIN_SECTION_READ_FAILED]", { table: section.name, code: error.code });
      return res.status(500).json({ success: false, error: "Could not load this section." });
    }
    const total = count ?? 0;
    return res.json({
      success: true,
      ...sectionResponse(section),
      rows: data || [],
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch {
    return res.status(500).json({ success: false, error: "Could not load this section." });
  }
});

router.post("/api/admin/tables/:table", adminAuth, async (req, res) => {
  const section = getSection(req, res);
  if (!section) return;
  const parsed = parsePayload(req.body, section, true);
  if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
  try {
    const { data, error } = await withWriteTimeout((signal) =>
      supabase
        .from(section.table.name as never)
        .insert(parsed.payload as never)
        .select(section.table.columns.map((column) => column.name).join(","))
        .abortSignal(signal)
        .single(),
    );
    if (error) {
      console.error("[JABIYEN_ADMIN_SECTION_CREATE_FAILED]", { table: section.name, code: error.code });
      return res.status(error.code === "23505" ? 409 : 400).json({ success: false, error: error.code === "23505" ? "A record with the same unique value already exists." : "The record could not be created. Check the required fields and values." });
    }
    return res.status(201).json({ success: true, record: data });
  } catch (error) {
    if (error instanceof WriteTimeoutError) return res.status(504).json({ success: false, error: "The save request timed out. Refresh the section to check whether it completed before trying again." });
    return res.status(500).json({ success: false, error: "The record could not be created." });
  }
});

router.patch("/api/admin/tables/:table/:id", adminAuth, async (req, res) => {
  const section = getSection(req, res);
  if (!section) return;
  const parsed = parsePayload(req.body, section, false);
  if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
  const primaryKey = section.table.primaryKeys[0];
  const updatePayload = { ...parsed.payload };
  if (section.table.columns.some((column) => column.name === "updated_at")) {
    updatePayload.updated_at = new Date().toISOString();
  }
  try {
    const { data, error } = await withWriteTimeout((signal) =>
      supabase
        .from(section.table.name as never)
        .update(updatePayload as never)
        .eq(primaryKey, req.params.id)
        .abortSignal(signal)
        .select(section.table.columns.map((column) => column.name).join(","))
        .maybeSingle(),
    );
    if (error) {
      console.error("[JABIYEN_ADMIN_SECTION_UPDATE_FAILED]", { table: section.name, code: error.code });
      return res.status(error.code === "23505" ? 409 : 400).json({ success: false, error: error.code === "23505" ? "A record with the same unique value already exists." : "The record could not be updated." });
    }
    if (!data) return res.status(404).json({ success: false, error: "Record not found." });
    return res.json({ success: true, record: data });
  } catch (error) {
    if (error instanceof WriteTimeoutError) return res.status(504).json({ success: false, error: "The save request timed out. Refresh the section to check whether it completed before trying again." });
    return res.status(500).json({ success: false, error: "The record could not be updated." });
  }
});

router.delete("/api/admin/tables/:table/:id", adminAuth, async (req, res) => {
  const section = getSection(req, res);
  if (!section) return;
  const primaryKey = section.table.primaryKeys[0];
  try {
    const { data, error } = await withWriteTimeout((signal) =>
      supabase
        .from(section.table.name as never)
        .delete()
        .eq(primaryKey, req.params.id)
        .abortSignal(signal)
        .select(primaryKey)
        .maybeSingle(),
    );
    if (error) {
      console.error("[JABIYEN_ADMIN_SECTION_DELETE_FAILED]", { table: section.name, code: error.code });
      return res.status(error.code === "23503" ? 409 : 400).json({ success: false, error: error.code === "23503" ? "This record is still referenced by other content and cannot be deleted yet." : "The record could not be deleted." });
    }
    if (!data) return res.status(404).json({ success: false, error: "Record not found." });
    const record = data as unknown as Record<string, unknown>;
    return res.json({ success: true, id: record[primaryKey] });
  } catch (error) {
    if (error instanceof WriteTimeoutError) return res.status(504).json({ success: false, error: "The save request timed out. Refresh the section to check whether it completed before trying again." });
    return res.status(500).json({ success: false, error: "The record could not be deleted." });
  }
});

export default router;
