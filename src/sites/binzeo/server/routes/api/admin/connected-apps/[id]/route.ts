import { NextRequest } from "next/server";
import { getAdminApiContext } from "@/sites/binzeo/admin/lib/admin";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!access.roles.includes("super_admin") && !access.permissions.includes("connected_apps.write")) return fail("Permission required", 403, "PERMISSION_REQUIRED");
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const field of ["name", "logo_url", "website_url", "client_id", "allowed_origins", "is_active"]) if (field in body) patch[field] = body[field];
  if (typeof patch.website_url === "string" && !patch.website_url.startsWith("https://")) return fail("website_url must use HTTPS", 422, "VALIDATION_ERROR");
  const { data, error } = await supabase.from("connected_apps").update(patch).eq("id", id).select().single();
  if (error) return fail(error.message, 400, "CONNECTED_APP_UPDATE_FAILED");
  return ok({ app: data });
}
