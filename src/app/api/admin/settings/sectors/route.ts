import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminApiContext, getAdminDataClient, getAdminServiceContext } from "@/admin/binzeo/lib/admin";
import { fail, ok } from "@/admin/binzeo/lib/api/response";

export const dynamic = "force-dynamic";

const sectorId = z.string().uuid("Invalid sector ID");
const sectorCode = z.string().trim().min(2).max(50).regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase letters, numbers, hyphens or underscores");
const sectorName = z.string().trim().min(2).max(100);
const sectorDescription = z.string().trim().max(500).nullable().optional();
const createSchema = z.object({
  sector_code: sectorCode,
  sector_name: sectorName,
  description: sectorDescription,
  is_active: z.boolean().default(true),
});
const updateSchema = z.object({
  sector_code: sectorCode.optional(),
  sector_name: sectorName.optional(),
  description: sectorDescription,
  is_active: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0, "At least one field is required");

export async function GET(request: Request) {
  const { user, access } = await getAdminApiContext(request);
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  try {
    const db = await getAdminDataClient(access);
    const { data, error } = await db.from("sectors").select("id,sector_code,sector_name,description,is_active,created_at").order("sector_name", { ascending: true }).limit(250);
    if (error) return fail("Sectors could not be loaded", 500, "SECTORS_FETCH_FAILED");
    return ok({ sectors: data ?? [] });
  } catch {
    return fail("Sectors could not be loaded", 500, "SECTORS_FETCH_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const context = await getAdminServiceContext(request, "sectors.manage");
  if (!context) return fail("Sector management permission required", 403, "SECTORS_MANAGE_REQUIRED");
  let body: unknown;
  try { body = await request.json(); } catch { return fail("Invalid JSON body", 422, "VALIDATION_ERROR"); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid sector", 422, "VALIDATION_ERROR");
  const { data, error } = await context.admin.from("sectors").insert(parsed.data).select("id,sector_code,sector_name,description,is_active,created_at").single();
  if (error) {
    if (error.code === "23505") return fail("Sector code or name already exists", 409, "SECTOR_ALREADY_EXISTS");
    return fail("Sector could not be created", 500, "SECTOR_CREATE_FAILED");
  }
  return ok({ sector: data }, 201);
}

export async function PATCH(request: NextRequest) {
  const context = await getAdminServiceContext(request, "sectors.manage");
  if (!context) return fail("Sector management permission required", 403, "SECTORS_MANAGE_REQUIRED");
  const id = sectorId.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return fail("Invalid sector ID", 422, "VALIDATION_ERROR");
  let body: unknown;
  try { body = await request.json(); } catch { return fail("Invalid JSON body", 422, "VALIDATION_ERROR"); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid sector", 422, "VALIDATION_ERROR");
  const { data, error } = await context.admin.from("sectors").update(parsed.data).eq("id", id.data).select("id,sector_code,sector_name,description,is_active,created_at").maybeSingle();
  if (error) {
    if (error.code === "23505") return fail("Sector code or name already exists", 409, "SECTOR_ALREADY_EXISTS");
    return fail("Sector could not be updated", 500, "SECTOR_UPDATE_FAILED");
  }
  if (!data) return fail("Sector not found", 404, "SECTOR_NOT_FOUND");
  return ok({ sector: data });
}

export async function DELETE(request: NextRequest) {
  const context = await getAdminServiceContext(request, "sectors.manage");
  if (!context) return fail("Sector management permission required", 403, "SECTORS_MANAGE_REQUIRED");
  const id = sectorId.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return fail("Invalid sector ID", 422, "VALIDATION_ERROR");
  // Keep historical user-sector memberships intact; deletion is a safe deactivation.
  const { data, error } = await context.admin.from("sectors").update({ is_active: false }).eq("id", id.data).select("id,sector_code,sector_name,description,is_active,created_at").maybeSingle();
  if (error) return fail("Sector could not be removed", 500, "SECTOR_DELETE_FAILED");
  if (!data) return fail("Sector not found", 404, "SECTOR_NOT_FOUND");
  return ok({ sector: data, deleted: true });
}
