import { NextRequest } from "next/server";
import { ok, fail } from "@/binzeo/admin/lib/api/response";
import { getAdminApiContext } from "@/binzeo/admin/lib/admin";
import { createAdminClient } from "@/binzeo/admin/lib/supabase/admin";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

type ProfileResult = { id: string; display_name: string | null; username: string | null; profile_photo_url: string | null };

export async function GET() {
  const { supabase, user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  const { data: profile } = await supabase.from("profiles").select("id,binzeo_user_id,display_name,username,account_status,profile_photo_url").eq("id", user.id).maybeSingle();
  return ok({ user: { id: user.id, email: user.email }, profile, access });
}

export async function PATCH(request: NextRequest) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Invalid profile payload", 400, "VALIDATION_ERROR");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Invalid JSON body", 400, "VALIDATION_ERROR");
  }

  if (typeof body.display_name !== "string" || typeof body.username !== "string") {
    return fail("Display name and username are required", 422, "VALIDATION_ERROR");
  }
  const displayName = body.display_name.trim();
  const rawUsername = body.username.trim().toLowerCase();
  if (!displayName || displayName.length > 80) return fail("Display name must be between 1 and 80 characters", 422, "VALIDATION_ERROR");
  if (rawUsername && !USERNAME_PATTERN.test(rawUsername)) return fail("Username must be 3–30 characters using letters, numbers, dots, underscores or hyphens", 422, "VALIDATION_ERROR");

  // The user ID always comes from the verified session; request bodies cannot target another profile.
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").update({ display_name: displayName, username: rawUsername || null } as never)
    .eq("id", user.id).select("id,display_name,username,profile_photo_url").maybeSingle();
  if (error) {
    if (error.code === "23505") return fail("That username is already in use", 409, "USERNAME_TAKEN");
    return fail(error.message, 400, "PROFILE_UPDATE_FAILED");
  }
  if (!data) return fail("Admin profile not found", 404, "PROFILE_NOT_FOUND");

  const profile = data as unknown as ProfileResult;
  const { error: auditError } = await admin.from("admin_activity_logs").insert([{
    admin_user_id: user.id,
    action_type: "admin_profile_updated",
    target_type: "profile",
    target_id: user.id,
    description: "Admin updated their own display name and username",
    metadata: { fields_updated: ["display_name", "username"] },
  }] as never);

  return ok({ profile, audit_recorded: !auditError, audit_warning: auditError?.message ?? null });
}
