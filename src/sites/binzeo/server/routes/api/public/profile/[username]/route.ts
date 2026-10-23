import { NextRequest } from "next/server";
import { fail, ok } from "@/sites/binzeo/auth/lib/api/response";
import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";
import { normalizeUsername } from "@/sites/binzeo/auth/lib/username";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const username = normalizeUsername((await params).username);
    const { data: profile, error } = await getSupabaseAdmin()
      .from("profiles")
      .select("id, username, display_name, first_name, last_name, country_code")
      .eq("username", username)
      .eq("account_status", "active")
      .maybeSingle();
    if (error) return fail("Profile lookup failed", 500, "PROFILE_FETCH_FAILED");
    if (!profile) return fail("Profile not found", 404, "PROFILE_NOT_FOUND");

    return ok({
      profile: {
        username: profile.username,
        display_name: profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "BINZEO user",
        country_code: profile.country_code?.trim().toUpperCase() || null,
      },
    });
  } catch (error) {
    console.error("[PUBLIC_USERNAME_PROFILE_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
