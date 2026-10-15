import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { z } from "zod";
import { ok, fail } from "@/modules/identity/lib/api/response";

const addressSchema = z.object({
  address_type: z
    .enum(["home", "work", "billing", "shipping", "other"])
    .default("home"),
  address_line_1: z.string().min(1, "Address line 1 is required"),
  address_line_2: z.string().optional(),
  address_line_3: z.string().optional(),
  country_code: z.string().length(2).optional(),
  state_province: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  postal_code: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  is_primary: z.boolean().default(false),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_addresses")
      .select("id, address_type, address_line_1, address_line_2, address_line_3, country_code, state_province, district, city, area, postal_code, latitude, longitude, is_primary, created_at, updated_at, location_accuracy_meters, location_source")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 400, "ADDRESSES_FETCH_FAILED");
    return ok({ addresses: data ?? [] });
  } catch (err) {
    console.error("[ADDRESSES_GET_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const body = await req.json();
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input", 422, "VALIDATION_ERROR");
    }

    const { count: existingCount, error: countError } = await supabase
      .from("user_addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) return fail(countError.message, 400, "ADDRESS_CHECK_FAILED");
    if ((existingCount ?? 0) > 0) {
      return fail("Only one default address is allowed. Edit your existing address instead.", 409, "SINGLE_ADDRESS_ONLY");
    }

    const { data, error } = await supabase
      .from("user_addresses")
      .insert({ ...parsed.data, user_id: user.id, is_primary: true })
      .select()
      .single();

    if (error) return fail(error.message, 400, "ADDRESS_CREATE_FAILED");
    return ok({ address: data }, 201);
  } catch (err) {
    console.error("[ADDRESSES_POST_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
