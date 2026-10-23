import { NextRequest } from "next/server";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";
import { z } from "zod";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = z.string().uuid().safeParse((await params).id);
    if (!parsed.success) return fail("Invalid token id", 422, "VALIDATION_ERROR");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const { data, error } = await supabase
      .from("temporary_login_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .is("used_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) return fail(error.message, 400, "TEMPORARY_TOKEN_REVOKE_FAILED");
    if (!data) return fail("Token not found or already inactive", 404, "TEMPORARY_TOKEN_NOT_FOUND");
    return ok({ message: "Temporary login token revoked" });
  } catch (err) {
    console.error("[TEMPORARY_TOKEN_REVOKE_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
