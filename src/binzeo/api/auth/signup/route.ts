import { NextRequest } from "next/server";
import { createClient } from "@/binzeo/auth/lib/supabase/server";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import { transporter, EMAIL_FROM, buildOtpEmail, getPublicSiteUrl } from "@/binzeo/auth/lib/email/transporter";
import { resolveRequestLocation } from "@/binzeo/auth/lib/request-location";
import { upsertUserDevice } from "@/binzeo/auth/lib/device-tracking";
import { otpRateLimitResponse } from "@/binzeo/auth/lib/otp-rate-limit";
import { z } from "zod";
import { ok, fail } from "@/binzeo/auth/lib/api/response";
import { logUserActivity } from "@/binzeo/auth/lib/activity-log";
import { upsertUserBirthday, validateBirthDate } from "@/binzeo/auth/lib/birthday";
import { emailAlreadyExists, normalizeEmail } from "@/binzeo/auth/lib/auth-email";
import { isValidUsername, normalizeUsername, usernameExists } from "@/binzeo/auth/lib/username";

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  username: z.string().min(3).max(30),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password cannot exceed 72 characters"),
  first_name: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(80, "First name too long"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(80, "Last name too long"),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth is required"),
  country_code: z
    .string()
    .length(2, "Country code must be 2 characters")
    .optional(),
  terms_accepted: z.literal(true, { message: "Terms acceptance is required" }),
  privacy_accepted: z.literal(true, { message: "Privacy Policy acceptance is required" }),
  location_consent: z.literal(true, { message: "Location permission is required" }),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy_meters: z.number().min(0).max(100000),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return fail(firstError, 422, "VALIDATION_ERROR");
    }
    if (!parsed.data.location) {
      return fail("Precise device location permission is required to create your account", 422, "PRECISE_LOCATION_REQUIRED");
    }

    const { password, first_name, last_name, country_code, date_of_birth } = parsed.data;
    const email = normalizeEmail(parsed.data.email);
    const username = normalizeUsername(parsed.data.username);
    if (!isValidUsername(username)) {
      return fail("Choose a valid available username", 422, "INVALID_USERNAME");
    }
    try {
      if (await usernameExists(username)) {
        return fail(`@${username} is already taken. Choose another username.`, 409, "USERNAME_ALREADY_EXISTS");
      }
    } catch (usernameLookupError) {
      console.error("[SIGNUP_USERNAME_LOOKUP_ERROR]", usernameLookupError);
      return fail("We could not verify username availability right now. Please try again.", 503, "USERNAME_CHECK_UNAVAILABLE");
    }
    try {
      if (await emailAlreadyExists(email)) {
        return fail("An account with this email already exists. Please sign in instead.", 409, "EMAIL_ALREADY_EXISTS");
      }
    } catch (emailLookupError) {
      console.error("[SIGNUP_EMAIL_LOOKUP_ERROR]", emailLookupError);
      return fail("We could not verify email availability right now. Please try again.", 503, "EMAIL_CHECK_UNAVAILABLE");
    }
    const birthDateError = validateBirthDate(date_of_birth);
    if (birthDateError) return fail(birthDateError, 422, "INVALID_DATE_OF_BIRTH");
    const location = await resolveRequestLocation(req.headers, true, {
      latitude: parsed.data.location.latitude,
      longitude: parsed.data.location.longitude,
      accuracyMeters: parsed.data.location.accuracy_meters,
    });
    const consentDate = new Date().toISOString();

    // Supabase must not send its built-in confirmation link. The application
    // OTP below is the only email-verification step for a newly created user.
    const { data: created, error: createError } =
      await getSupabaseAdmin().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name,
          last_name,
          username,
          country_code: country_code || location.country || null,
          terms_accepted: true,
          privacy_accepted: true,
          location_consent: true,
          location_source: location.source,
          consent_date: consentDate,
        },
      });

    if (createError || !created.user) {
      if (createError?.message.toLowerCase().includes("already") || createError?.message.toLowerCase().includes("exists")) {
        return fail("An account with this email already exists. Please sign in instead.", 409, "EMAIL_ALREADY_EXISTS");
      }
      return fail(createError?.message ?? "Unable to create account", 400, createError?.name ?? "SIGNUP_FAILED");
    }

    const user = created.user;
    const supabase = await createClient();
    const { data: sessionData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !sessionData.session) {
      return fail("Account created, but sign-in could not be started", 500, "SIGNIN_AFTER_SIGNUP_FAILED");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        first_name,
        last_name,
        display_name: `${first_name} ${last_name}`.trim(),
        username,
        date_of_birth,
        country_code: country_code || location.country || null,
        terms_accepted: true,
        terms_version: "2026-10-02",
        privacy_accepted: true,
        privacy_version: "2026-10-02",
        location_consent: true,
        location_consent_at: consentDate,
        consent_date: consentDate,
      })
      .eq("id", user.id);
    if (profileError) {
      if (profileError.code === "23505") {
        return fail(`@${username} is already taken. Choose another username.`, 409, "USERNAME_ALREADY_EXISTS");
      }
      console.error("[SIGNUP_PROFILE_UPDATE_ERROR]", profileError);
      return fail("Account created, but profile setup failed", 500, "PROFILE_SETUP_FAILED");
    }

    try {
      await upsertUserBirthday({ userId: user.id, email: user.email ?? email, displayName: `${first_name} ${last_name}`.trim(), birthDate: date_of_birth });
    } catch (birthdayError) {
      console.error("[SIGNUP_BIRTHDAY_REGISTRY_ERROR]", birthdayError);
      return fail("Account created, but birthday profile setup failed", 500, "BIRTHDAY_PROFILE_FAILED");
    }

    const device = await upsertUserDevice(supabase, user.id, req.headers, location.ip);

    const { error: signupHistoryError } = await supabase.from("user_login_history").insert({
      user_id: user.id,
      login_method: "signup",
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
    if (signupHistoryError) console.error("[SIGNUP_HISTORY_ERROR]", signupHistoryError);

    if (location.city || location.region || location.country || location.latitude !== null || location.longitude !== null) {
      const addressLine = [location.city, location.region, location.country].filter(Boolean).join(", ") || "Approximate location";
      const { error: addressError } = await supabase.from("user_addresses").insert({
        user_id: user.id,
        address_type: "home",
        address_line_1: addressLine,
        country_code: location.country,
        state_province: location.region,
        city: location.city,
        latitude: location.latitude,
        longitude: location.longitude,
        location_accuracy_meters: location.accuracyMeters,
        location_source: location.source,
        is_primary: true,
      });
      if (addressError) console.error("[SIGNUP_ADDRESS_ERROR]", addressError);
    }

    const { data: challengeData, error: challengeError } = await supabase.rpc(
      "issue_email_verification_code",
      { target_user_id: user.id, request_ip: location.ip }
    );
    if (challengeError) {
      console.error("[SIGNUP_OTP_ISSUE_ERROR]", challengeError);
      const limited = otpRateLimitResponse(challengeError.message);
      if (limited) {
        return fail(limited.message, limited.status, limited.code, {
          retry_after_seconds: limited.retryAfter,
        });
      }
      return fail("Account created, but verification code could not be sent", 502, "OTP_ISSUE_FAILED");
    }

    const challenge = Array.isArray(challengeData) ? challengeData[0] : challengeData;
    const challengeId = challenge?.challenge_id;
    const verificationCode = challenge?.verification_code;
    if (!challengeId || !verificationCode) {
      console.error("[SIGNUP_OTP_SHAPE_ERROR]", challenge);
      return fail("Account created, but verification code was invalid", 502, "OTP_RESPONSE_INVALID");
    }

    try {
      const emailContent = buildOtpEmail(String(verificationCode), 300, getPublicSiteUrl(req.headers), {
        name: `${first_name} ${last_name}`.trim(),
        time: new Date().toUTCString(),
        ipAddress: location.ip,
        location: [location.city, location.region, location.country].filter(Boolean).join(", "),
        browser: req.headers.get("user-agent"),
      });
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      });
    } catch (mailError) {
      console.error("[SIGNUP_OTP_MAIL_ERROR]", mailError);
      return fail("Account created, but verification email could not be sent", 502, "OTP_MAIL_SEND_FAILED");
    }

    await logUserActivity(supabase, req, {
      userId: user.id,
      activityType: "account_created",
      description: "BINZEO account created successfully.",
      deviceId: device.id,
      metadata: { signup_method: "email_password" },
    });
    await logUserActivity(supabase, req, {
      userId: user.id,
      activityType: "email_verification_requested",
      description: "Initial email verification code requested during signup.",
      deviceId: device.id,
      metadata: { challenge_id: String(challengeId), expires_at: challenge.expires_at ?? null },
    });

    return ok(
      {
        user: { id: user.id, email: user.email, first_name, last_name },
        challenge_id: challengeId,
        requires_custom_email_verification: true,
        requires_email_confirmation: false,
      },
      201
    );
  } catch (err) {
    console.error("[SIGNUP_ERROR]", err);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
