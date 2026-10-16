import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";
import { logUserActivity } from "@/modules/identity/lib/activity-log";
import { createUserScopedClient } from "@/lib/supabase/clients";

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
    const { error } = await supabase.auth.signOut();

    if (error) {
      return fail(error.message, 400, "SIGNOUT_FAILED");
    }

    return ok({ message: "Logged out successfully" });
  } catch (err) {
    console.error("[LOGOUT_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
