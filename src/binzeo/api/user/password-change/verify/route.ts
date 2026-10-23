import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/binzeo/auth/lib/api/response";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";

const schema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "Code must be exactly 6 digits"),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid verification request", 422, "VALIDATION_ERROR");
    }

    const sessionClient = await createClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");

    const { data, error } = await getSupabaseAdmin().rpc("verify_password_otp", {
      challenge_id: parsed.data.challenge_id,
      submitted_code: parsed.data.code,
      challenge_purpose: "change",
    });
    if (error) {
      console.error("[PASSWORD_CHANGE_OTP_VERIFY_RPC_ERROR]", error);
      return fail("Password verification failed. Please try again.", 400, "PASSWORD_OTP_VERIFY_FAILED");
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.verified !== true) {
      return ok({ verified: false, reason: result?.reason ?? "verification_failed" });
    }
    if (result.user_id !== user.id) {
      return fail("Verification challenge does not belong to this user.", 403, "FORBIDDEN");
    }

    return ok({ verified: true, challenge_id: parsed.data.challenge_id });
  } catch (error) {
    console.error("[PASSWORD_CHANGE_OTP_VERIFY_ERROR]", error);
    return fail("Unable to verify the password code.", 500, "INTERNAL_ERROR");
  }
}
