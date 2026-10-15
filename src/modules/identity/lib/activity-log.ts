import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export async function logUserActivity(
  supabase: SupabaseClient,
  req: NextRequest,
  input: {
    userId: string;
    activityType: string;
    description?: string;
    deviceId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("user_activity_logs").insert({
    user_id: input.userId,
    activity_type: input.activityType,
    activity_description: input.description ?? null,
    ip_address: requestIp(req),
    device_id: input.deviceId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("[USER_ACTIVITY_LOG_ERROR]", {
      activityType: input.activityType,
      userId: input.userId,
      error,
    });
  }
}
