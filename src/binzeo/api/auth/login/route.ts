import { NextRequest } from "next/server";
import { isIP } from "node:net";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { loginSchema } from "@/binzeo/auth/lib/validators/auth";
import { requestIp, resolveRequestLocation } from "@/binzeo/auth/lib/request-location";
import { upsertUserDevice } from "@/binzeo/auth/lib/device-tracking";
import { ok, fail } from "@/binzeo/auth/lib/api/response";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { isTwoFactorEnabled, issueAndSendTwoFactorCode } from "@/binzeo/auth/lib/two-factor/service";
import { signOutCurrentAppSession } from "@/binzeo/auth/lib/session-signout";
import { logAuthSessionShape } from "@/binzeo/auth/lib/session-diagnostics";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return fail(firstError, 422, "VALIDATION_ERROR");
    }

    const supabase = await createClient();
    const rawIp = requestIp(req.headers);
    const ip = isIP(rawIp) ? rawIp : "0.0.0.0";
    const { data: limitRows, error: limitError } = await supabase.rpc(
      "check_daily_login_limit",
      { p_account_email: parsed.data.email, p_request_ip: ip },
    );
    if (limitError) {
      console.error("[LOGIN_LIMIT_CHECK_ERROR]", limitError);
      return fail("Login protection is temporarily unavailable", 503, "LOGIN_LIMIT_UNAVAILABLE");
    }
    const limit = Array.isArray(limitRows) ? limitRows[0] : limitRows;
    if (limit && limit.allowed === false) {
      const { error: exceededRecordError } = await supabase.rpc(
        "record_failed_login_attempt",
        {
          p_account_email: parsed.data.email,
          p_request_ip: ip,
          p_user_id: null,
        },
      );
      if (exceededRecordError) console.error("[LOGIN_LIMIT_EXCEEDED_RECORD_ERROR]", exceededRecordError);
      return fail(
        "Too many failed sign-in attempts. Please wait 24 hours before trying again.",
        429,
        "LOGIN_RATE_LIMITED",
        { retry_after: limit.reset_at },
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      const { data: failureRows, error: failureError } = await supabase.rpc(
        "record_failed_login_attempt",
        {
          p_account_email: parsed.data.email,
          p_request_ip: ip,
          p_user_id: null,
        },
      );
      if (failureError) {
        console.error("[LOGIN_LIMIT_RECORD_ERROR]", failureError);
      }
      const failure = Array.isArray(failureRows) ? failureRows[0] : failureRows;
      if (failure?.blocked === true) {
        return fail(
          "Too many failed sign-in attempts. Please wait 24 hours before trying again.",
          429,
          "LOGIN_RATE_LIMITED",
          { retry_after: failure.reset_at },
        );
      }
      return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const { data: verification } = await supabase
      .from("user_verification_records")
      .select("verification_status")
      .eq("user_id", data.user.id)
      .eq("verification_type", "email")
      .maybeSingle();
    if (verification?.verification_status !== "verified") {
      await supabase.auth.signOut();
      return fail(
        "Please verify your email with the OTP before signing in",
        403,
        "EMAIL_VERIFICATION_REQUIRED"
      );
    }

    const location = await resolveRequestLocation(
      req.headers,
      true,
      parsed.data.location
        ? {
            latitude: parsed.data.location.latitude,
            longitude: parsed.data.location.longitude,
            accuracyMeters: parsed.data.location.accuracy_meters,
          }
      : undefined,
    );
    const device = await upsertUserDevice(supabase, data.user.id, req.headers, location.ip);

    // Fetch profile for user details
    const { data: profile } = await supabase
      .from("profiles")
      .select("binzeo_user_id, first_name, last_name, display_name, account_status")
      .eq("id", data.user.id)
      .maybeSingle();

    // Only active, OTP-verified accounts may establish a login session.
    if (profile?.account_status !== "active") {
      const { error: blockedHistoryError } = await supabase.from("user_login_history").insert({
        user_id: data.user.id,
        login_method: "password",
        login_status: "blocked",
        ip_address: location.ip,
        device_id: device.id,
        user_agent: req.headers.get("user-agent"),
        country: location.country,
        city: location.city,
        latitude: location.latitude,
        longitude: location.longitude,
        location_accuracy_meters: location.accuracyMeters,
        location_source: location.source,
      });
      if (blockedHistoryError) console.error("[LOGIN_BLOCKED_HISTORY_ERROR]", blockedHistoryError);
      await logUserActivity(supabase, req, {
        userId: data.user.id,
        activityType: "password_login_blocked",
        description: `Password login blocked because account status is ${profile?.account_status ?? "unknown"}.`,
        deviceId: device.id,
        metadata: { account_status: profile?.account_status ?? null },
      });
      await supabase.auth.signOut();
      return fail(
        `Account ${profile?.account_status ?? "pending"}`,
        403,
        "ACCOUNT_BLOCKED"
      );
    }

    if (await isTwoFactorEnabled(data.user.id)) {
      try {
        const challenge = await issueAndSendTwoFactorCode({
          admin: getSupabaseAdmin(),
          req,
          userId: data.user.id,
          email: data.user.email ?? parsed.data.email,
          loginMethod: "password",
          context: {
            name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
            time: new Date().toUTCString(),
            ipAddress: location.ip,
            location: [location.city, location.region, location.country].filter(Boolean).join(", "),
            browser: req.headers.get("user-agent"),
          },
        });
        await signOutCurrentAppSession(supabase.auth);
        return ok({
          requires_two_factor: true,
          challenge_id: challenge.challengeId,
          user: {
            id: data.user.id,
            email: data.user.email,
            binzeo_user_id: profile?.binzeo_user_id ?? null,
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            display_name: profile?.display_name ?? null,
            account_status: profile?.account_status ?? "pending",
          },
        });
      } catch (twoFactorError) {
        console.error("[LOGIN_2FA_EMAIL_ERROR]", twoFactorError);
        await signOutCurrentAppSession(supabase.auth);
        return fail("Unable to send the 2FA verification code", 502, "TWO_FACTOR_EMAIL_FAILED");
      }
    }

    const { error: loginHistoryError } = await supabase.from("user_login_history").insert({
      user_id: data.user.id,
      login_method: "password",
      login_status: "success",
      ip_address: location.ip,
      device_id: device.id,
      user_agent: req.headers.get("user-agent"),
      country: location.country,
      city: location.city,
      latitude: location.latitude,
      longitude: location.longitude,
      location_accuracy_meters: location.accuracyMeters,
      location_source: location.source,
    });
    if (loginHistoryError) console.error("[LOGIN_HISTORY_ERROR]", loginHistoryError);
    await logUserActivity(supabase, req, {
      userId: data.user.id,
      activityType: "password_login_success",
      description: "Signed in successfully with email and password.",
      deviceId: device.id,
      metadata: { login_method: "password" },
    });

    logAuthSessionShape(req, "email_password", data.session);
    return ok({
      // JABIYEN clients use the Central session for authenticated brand APIs.
      // The token is still scoped to Central Auth; no JABIYEN password or token is stored.
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email,
        binzeo_user_id: profile?.binzeo_user_id ?? null,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        display_name: profile?.display_name ?? null,
        account_status: profile?.account_status ?? "pending",
      },
    });
  } catch (err) {
    console.error("[LOGIN_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
