import { NextRequest } from "next/server";
import { createClient } from "@/user/auth/lib/supabase/server";
import { ok, fail } from "@/user/auth/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const username = decodeURIComponent((await params).username).replace(/^@+/, "").trim().toLowerCase();
    if (!username || !/^[a-z0-9._-]{2,50}$/.test(username)) {
      return fail("Invalid username", 400, "INVALID_USERNAME");
    }

    const supabase = await createClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        binzeo_user_id,
        display_name,
        username,
        first_name,
        last_name,
        profile_photo_url,
        country_code,
        account_status,
        created_at
        `
      )
      .ilike("username", username)
      .eq("account_status", "active")
      .maybeSingle();

    if (error) return fail(error.message, 400, "PROFILE_FETCH_FAILED");
    if (!profile) return fail("Profile not found", 404, "PROFILE_NOT_FOUND");

    const [{ data: contacts }, { data: sectors }] = await Promise.all([
      supabase
        .from("user_contacts")
        .select("contact_type, contact_value, label, is_primary")
        .eq("user_id", profile.id)
        .eq("is_verified", true),
      supabase
        .from("user_sector_access")
        .select("status, sectors:sector_id (sector_code, sector_name)")
        .eq("user_id", profile.id)
        .eq("status", "active"),
    ]);

    const publicProfile = { ...profile };
    delete publicProfile.id;
    return ok({
      profile: publicProfile,
      contacts: contacts ?? [],
      sectors: sectors ?? [],
    });
  } catch (err) {
    console.error("[PUBLIC_PROFILE_USERNAME_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
