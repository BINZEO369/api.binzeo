import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import { ok, fail } from "@/modules/identity/lib/api/response";
import { z } from "zod";

const idSchema = z.string().uuid();

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return fail("Invalid passkey id", 422, "VALIDATION_ERROR");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    // The session check above establishes ownership. Delete the row completely
    // so the credential cannot remain as a revoked/stale passkey record.
    const { data, error } = await getSupabaseAdmin()
      .from("user_passkeys")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) return fail(error.message, 400, "PASSKEY_DELETE_FAILED");
    if (!data) return fail("Passkey not found or already deleted", 404, "PASSKEY_NOT_FOUND");

    return ok({ message: "Passkey deleted", deleted_id: data.id });
  } catch (err) {
    console.error("[PASSKEY_DELETE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
