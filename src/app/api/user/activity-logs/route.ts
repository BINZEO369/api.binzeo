import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const { data, error, count } = await supabase
      .from("user_activity_logs")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return fail(error.message, 400, "ACTIVITY_FETCH_FAILED");
    return ok({
      activities: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[ACTIVITY_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
