import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";

const ALLOWED = [
  "address_type",
  "address_line_1",
  "address_line_2",
  "address_line_3",
  "country_code",
  "state_province",
  "district",
  "city",
  "area",
  "postal_code",
  "latitude",
  "longitude",
  "is_primary",
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

    if (patch.is_primary === true) {
      await supabase
        .from("user_addresses")
        .update({ is_primary: false })
        .eq("user_id", user.id)
        .neq("id", id);
    }

    const { data, error } = await supabase
      .from("user_addresses")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return fail(error.message, 400, "ADDRESS_UPDATE_FAILED");
    return ok({ address: data });
  } catch (err) {
    console.error("[ADDRESS_PATCH_ERROR]", err);
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
      .from("user_addresses")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return fail(error.message, 400, "ADDRESS_DELETE_FAILED");
    return ok({ message: "Address deleted" });
  } catch (err) {
    console.error("[ADDRESS_DELETE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
