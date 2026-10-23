import { NextRequest } from "next/server";
import { z } from "zod";
import { emailAlreadyExists, normalizeEmail } from "@/sites/binzeo/auth/lib/auth-email";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(254),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please enter a valid email address", 422, "INVALID_EMAIL");
    }

    const email = normalizeEmail(parsed.data.email);
    const exists = await emailAlreadyExists(email);
    return ok({
      email,
      available: !exists,
      exists,
      message: exists ? "An account with this email already exists. Please sign in instead." : "Email is available.",
    });
  } catch (error) {
    console.error("[EMAIL_AVAILABILITY_ERROR]", error);
    return fail("We could not check this email right now. Please try again.", 503, "EMAIL_CHECK_UNAVAILABLE");
  }
}
