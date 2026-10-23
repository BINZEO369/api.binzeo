import { NextRequest } from "next/server";
import { getAdminApiContext } from "@/binzeo/admin/lib/admin";
import { ok, fail } from "@/binzeo/auth/lib/api/response";

export async function GET() {
  const { supabase, user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  const { data, error } = await supabase.from("connected_apps").select("id,slug,name,logo_url,website_url,client_id,allowed_origins,is_active,created_at,updated_at").order("name").limit(100);
  if (error) return fail(error.message, 400, "CONNECTED_APPS_FETCH_FAILED");
  return ok({ apps: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!access.roles.includes("super_admin") && !access.permissions.includes("connected_apps.write")) return fail("Permission required", 403, "PERMISSION_REQUIRED");
  const body = await req.json();
  const input = { slug: body.slug, name: body.name, logo_url: body.logo_url || null, website_url: body.website_url, client_id: body.client_id || null, allowed_origins: Array.isArray(body.allowed_origins) ? body.allowed_origins : [], is_active: body.is_active !== false };
  if (typeof input.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || typeof input.name !== "string" || !input.name.trim() || typeof input.website_url !== "string" || !input.website_url.startsWith("https://")) return fail("Valid slug, name, and HTTPS website URL are required", 422, "VALIDATION_ERROR");
  const { data, error } = await supabase.from("connected_apps").insert(input).select().single();
  if (error) return fail(error.message, 400, "CONNECTED_APP_CREATE_FAILED");
  return ok({ app: data });
}
