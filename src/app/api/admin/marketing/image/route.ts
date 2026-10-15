import { NextRequest } from "next/server";
import { fail, ok } from "@/modules/identity/lib/api/response";
import { uploadMarketingImage } from "@/modules/identity/lib/imagekit";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";

async function isAllowed(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const admin = getSupabaseAdmin();
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return false;
  const { data: access } = await admin.from("admin_access").select("roles,permissions,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!access?.is_active) return false;
  const roles = Array.isArray(access.roles) ? access.roles : [];
  const permissions = Array.isArray(access.permissions) ? access.permissions : [];
  return roles.includes("super_admin") || permissions.includes("marketing.send");
}

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export async function POST(request: NextRequest) {
  if (!await isAllowed(request)) return fail("Marketing email permission required", 403, "MARKETING_SEND_REQUIRED");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Please select an image file", 422, "IMAGE_REQUIRED");
  if (!allowed.has(file.type)) return fail("Only JPEG, PNG, WebP and AVIF images are supported", 422, "IMAGE_TYPE_NOT_ALLOWED");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return fail("Image must be smaller than 5 MB", 422, "IMAGE_TOO_LARGE");
  try {
    const uploaded = await uploadMarketingImage(Buffer.from(await file.arrayBuffer()), file.type);
    return ok({ url: uploaded.url, fileName: uploaded.fileName });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Image upload failed", 500, "IMAGE_UPLOAD_FAILED");
  }
}
