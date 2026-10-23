import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";


export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("sectors")
      .select("id, sector_code, sector_name, description, is_active")
      .eq("is_active", true)
      .order("sector_name", { ascending: true });

    if (error) {
      return fail(error.message, 400, "SECTORS_FETCH_FAILED");
    }

    return ok({ sectors: data ?? [] });
  } catch (err) {
    console.error("[SECTORS_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
