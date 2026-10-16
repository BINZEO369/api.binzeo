import { getAdminApiContext, hasAdminPermission } from "@/admin/binzeo/lib/admin";
import { createAdminClient } from "@/admin/binzeo/lib/supabase/admin";
import { fail, ok } from "@/admin/binzeo/lib/api/response";

export const dynamic = "force-dynamic";
export async function GET() {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!hasAdminPermission(access, "auth.read")) return fail("Authentication read permission required", 403, "AUTH_READ_REQUIRED");
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("deleted_user_emails").select("id,original_user_id,email,binzeo_user_id,display_name,deleted_at,deleted_by,deletion_reason").order("deleted_at", { ascending: false }).limit(500);
    if (error) return fail("Deleted account archive could not be loaded", 500, "DELETED_EMAILS_FAILED");
    return ok({ records: data ?? [] });
  } catch {
    return fail("Deleted account archive could not be loaded", 500, "DELETED_EMAILS_FAILED");
  }
}
