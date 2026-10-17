import { describe, expect, it, vi } from "vitest";
import { signOutCurrentAppSession } from "@/user/auth/lib/session-signout";

describe("application session sign-out", () => {
  it("clears only the current application's Supabase session", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await signOutCurrentAppSession({ signOut });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
