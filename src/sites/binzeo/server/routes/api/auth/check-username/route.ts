import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/sites/binzeo/auth/lib/api/response";
import { isValidUsername, normalizeUsername, suggestUsernames, usernameExists } from "@/sites/binzeo/auth/lib/username";

const schema = z.object({ username: z.string().trim().min(1).max(80) });

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("Enter a username", 422, "INVALID_USERNAME");
    const username = normalizeUsername(parsed.data.username);
    if (!isValidUsername(username)) {
      return ok({ available: false, username, suggestions: await suggestUsernames(username), message: "Use 3–30 lowercase letters, numbers, or underscores; start with a letter." });
    }
    const exists = await usernameExists(username);
    return ok({
      available: !exists,
      username,
      suggestions: exists ? await suggestUsernames(username) : [],
      message: exists ? `@${username} is already taken.` : `@${username} is available.`,
    });
  } catch (error) {
    console.error("[USERNAME_CHECK_ERROR]", error);
    return fail("We could not check this username right now. Please try again.", 503, "USERNAME_CHECK_UNAVAILABLE");
  }
}
