import { NextRequest } from "next/server";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/binzeo/auth/lib/api/response";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";
import { createUserScopedClient } from "@/common/database/supabase/clients";
import { signOutCurrentAppSession } from "@/binzeo/auth/lib/session-signout";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabase = token ? createUserScopedClient(token) : await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await logUserActivity(supabase, req, {
        userId: user.id,
        activityType: "logout_success",
        description: "Signed out successfully.",
      });
    }
    const { error } = await signOutCurrentAppSession(supabase.auth);

    if (error) {
      return fail(error.message, 400, "SIGNOUT_FAILED");
    }

    return ok({ message: "Logged out successfully" });
  } catch (err) {
    console.error("[LOGOUT_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
