import { NextRequest } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { ok, fail } from "@/modules/identity/lib/api/response";

type AccountRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  binzeo_user_id: string | null;
  account_status: string;
  verification_status: string;
  status_group: "verified" | "pending" | "banned" | "unverified";
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_admin_account_statuses");
    if (error) return fail("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");

    const accounts = (data ?? []) as AccountRow[];
    const groups = {
      verified: accounts.filter((account) => account.status_group === "verified"),
      pending: accounts.filter((account) => account.status_group === "pending"),
      banned: accounts.filter((account) => account.status_group === "banned"),
      unverified: accounts.filter((account) => account.status_group === "unverified"),
    };
    return ok({
      groups,
      counts: Object.fromEntries(
        Object.entries(groups).map(([name, rows]) => [name, rows.length])
      ),
    });
  } catch (error) {
    console.error("[ADMIN_ACCOUNTS_GET_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const targetUserId = body?.user_id;
    const status = body?.status;
    const reason = typeof body?.reason === "string" ? body.reason : null;
    if (
      typeof targetUserId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId) ||
      !["active", "pending", "suspended", "deactivated"].includes(status)
    ) {
      return fail("Invalid user_id or account status", 422, "VALIDATION_ERROR");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_set_account_status", {
      target_user_id: targetUserId,
      new_status: status,
      reason,
    });
    if (error) {
      const code = error.message.includes("email_verification_required")
        ? "EMAIL_VERIFICATION_REQUIRED"
        : "ADMIN_STATUS_UPDATE_FAILED";
      return fail(error.message, 403, code);
    }
    return ok({ profile: data });
  } catch (error) {
    console.error("[ADMIN_ACCOUNTS_PATCH_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
