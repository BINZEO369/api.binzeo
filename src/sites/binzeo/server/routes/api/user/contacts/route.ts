import { NextRequest } from "next/server";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { z } from "zod";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

const contactSchema = z.object({
  contact_type: z.enum(["website", "social", "messenger", "other"]),
  contact_value: z.string().min(1, "Contact value required"),
  label: z.string().optional(),
  is_primary: z.boolean().default(false),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_contacts")
      .select("id, contact_type, contact_value, label, is_primary, is_verified, created_at, updated_at")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 400, "CONTACTS_FETCH_FAILED");
    return ok({ contacts: data ?? [] });
  } catch (err) {
    console.error("[CONTACTS_GET_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const body = await req.json();
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input", 422, "VALIDATION_ERROR");
    }

    if (parsed.data.is_primary) {
      await supabase
        .from("user_contacts")
        .update({ is_primary: false })
        .eq("user_id", user.id)
        .eq("contact_type", parsed.data.contact_type);
    }

    const { data, error } = await supabase
      .from("user_contacts")
      .insert({ ...parsed.data, user_id: user.id })
      .select()
      .single();

    if (error) return fail(error.message, 400, "CONTACT_CREATE_FAILED");
    return ok({ contact: data }, 201);
  } catch (err) {
    console.error("[CONTACTS_POST_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
