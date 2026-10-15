import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { z } from "zod";
import { ok, fail } from "@/modules/identity/lib/api/response";

const sectorAccessSchema = z.object({
  sector_id: z.string().uuid("Invalid sector ID"),
  status: z.enum(["active", "paused", "inactive"]).default("active"),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_sector_access")
      .select(
        `
        sector_id,
        status,
        selected_at,
        updated_at,
        sectors:sector_id (
          id,
          sector_code,
          sector_name,
          description,
          is_active
        )
        `
      )
      .eq("user_id", user.id);

    if (error) return fail(error.message, 400, "SECTOR_ACCESS_FETCH_FAILED");
    return ok({ sector_access: data ?? [] });
  } catch (err) {
    console.error("[SECTOR_ACCESS_GET_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const body = await req.json();
    const parsed = sectorAccessSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input", 422, "VALIDATION_ERROR");
    }

    // Verify sector exists and active
    const { data: sector, error: sectorError } = await supabase
      .from("sectors")
      .select("id, is_active")
      .eq("id", parsed.data.sector_id)
      .maybeSingle();

    if (sectorError || !sector) {
      return fail("Sector not found", 404, "SECTOR_NOT_FOUND");
    }
    if (!sector.is_active) {
      return fail("Sector is not active", 400, "SECTOR_INACTIVE");
    }

    const { data, error } = await supabase
      .from("user_sector_access")
      .upsert(
        {
          user_id: user.id,
          sector_id: parsed.data.sector_id,
          status: parsed.data.status,
        },
        { onConflict: "user_id,sector_id" }
      )
      .select()
      .single();

    if (error) return fail(error.message, 400, "SECTOR_ACCESS_FAILED");
    return ok({ sector_access: data }, 201);
  } catch (err) {
    console.error("[SECTOR_ACCESS_POST_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
