import { NextRequest } from "next/server";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

const ALLOWED = [
  "contact_type",
  "contact_value",
  "label",
  "is_primary",
  "is_verified",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) patch[k] = body[k];

    if (Object.keys(patch).length === 0) {
      return fail("No valid fields", 422, "NO_UPDATE_FIELDS");
    }

    const { data, error } = await supabase
      .from("user_contacts")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return fail(error.message, 400, "CONTACT_UPDATE_FAILED");
    return ok({ contact: data });
  } catch (err) {
    console.error("[CONTACT_PATCH_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { error } = await supabase
      .from("user_contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return fail(error.message, 400, "CONTACT_DELETE_FAILED");
    return ok({ message: "Contact deleted" });
  } catch (err) {
    console.error("[CONTACT_DELETE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
