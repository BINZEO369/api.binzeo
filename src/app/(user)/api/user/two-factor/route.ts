import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/user/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/user/auth/lib/supabase/admin";
import { logUserActivity } from "@/user/auth/lib/activity-log";
import { ok, fail } from "@/user/auth/lib/api/response";

const schema = z.object({ enabled: z.boolean() });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("user_two_factor_settings").select("enabled, method, enabled_at, disabled_at, updated_at").eq("user_id", user.id).maybeSingle();
  return ok({ enabled: data?.enabled === true, method: data?.method ?? "email_otp", settings: data ?? null });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("Choose whether 2FA is enabled", 422, "VALIDATION_ERROR");
    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await admin.from("user_two_factor_settings").upsert({ user_id: user.id, enabled: parsed.data.enabled, method: "email_otp", enabled_at: parsed.data.enabled ? now : undefined, disabled_at: parsed.data.enabled ? null : now, updated_at: now }, { onConflict: "user_id" }).select("enabled, method, enabled_at, disabled_at, updated_at").single();
    if (error) return fail(error.message, 400, "TWO_FACTOR_UPDATE_FAILED");
    await logUserActivity(admin, req, { userId: user.id, activityType: parsed.data.enabled ? "two_factor_enabled" : "two_factor_disabled", description: parsed.data.enabled ? "Email-based two-factor authentication enabled." : "Email-based two-factor authentication disabled.", metadata: { method: "email_otp" } });
    return ok({ enabled: data.enabled, settings: data });
  } catch (error) {
    console.error("[TWO_FACTOR_SETTINGS_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
