import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPasskeyHandoffToken,
  isPasskeyHandoffOriginAllowed,
} from "@/user/auth/lib/passkey-handoff";

describe("JABIYEN passkey handoff", () => {
  it("only accepts the configured Central Auth origin", () => {
    expect(
      isPasskeyHandoffOriginAllowed(
        "https://auth-binzeo.vercel.app",
        "https://auth-binzeo.vercel.app/",
      ),
    ).toBe(true);
    expect(
      isPasskeyHandoffOriginAllowed(
        "https://jabiyen-website.vercel.app",
        "https://auth-binzeo.vercel.app",
      ),
    ).toBe(false);
    expect(isPasskeyHandoffOriginAllowed(null, "invalid-url")).toBe(false);
  });

  it("stores only a SHA-256 hash and expires the one-time token after one minute", () => {
    const now = Date.parse("2026-10-17T04:00:00.000Z");
    const handoff = createPasskeyHandoffToken({
      userId: "user-123",
      ipAddress: "203.0.113.4",
      userAgent: "test-agent",
      now,
    });

    expect(handoff.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(handoff.record.user_id).toBe("user-123");
    expect(handoff.record.token_hash).toBe(
      createHash("sha256").update(handoff.token).digest("hex"),
    );
    expect(handoff.record.token_preview).not.toContain(handoff.token);
    expect(handoff.record.duration_minutes).toBe(1);
    expect(handoff.record.expires_at).toBe(
      "2026-10-17T04:01:00.000Z",
    );
    expect(handoff.record.created_ip).toBe("203.0.113.4");
    expect(handoff.record.created_user_agent).toBe("test-agent");
  });
});
