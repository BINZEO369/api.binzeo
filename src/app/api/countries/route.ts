import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("countries")
      .select(
        "id, country_code, country_name, official_name, phone_code, currency_code, is_active"
      )
      .eq("is_active", true)
      .order("country_name", { ascending: true });

    if (error) {
      return fail(error.message, 400, "COUNTRIES_FETCH_FAILED");
    }

    return ok({ countries: data ?? [] });
  } catch (err) {
    console.error("[COUNTRIES_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
