import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sectorId: string }> }
) {
  try {
    const { sectorId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const body = await req.json();
    const status = body.status;

    if (!["active", "paused", "inactive"].includes(status)) {
      return fail("Invalid status", 422, "INVALID_STATUS");
    }

    const { data, error } = await supabase
      .from("user_sector_access")
      .update({ status })
      .eq("user_id", user.id)
      .eq("sector_id", sectorId)
      .select()
      .single();

    if (error) return fail(error.message, 400, "SECTOR_ACCESS_UPDATE_FAILED");
    return ok({ sector_access: data });
  } catch (err) {
    console.error("[SECTOR_ACCESS_PATCH_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sectorId: string }> }
) {
  try {
    const { sectorId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { error } = await supabase
      .from("user_sector_access")
      .delete()
      .eq("user_id", user.id)
      .eq("sector_id", sectorId);

    if (error) return fail(error.message, 400, "SECTOR_ACCESS_DELETE_FAILED");
    return ok({ message: "Sector access removed" });
  } catch (err) {
    console.error("[SECTOR_ACCESS_DELETE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
