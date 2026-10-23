import "server-only";
import type { User } from "@supabase/supabase-js";
import { createUserScopedClient } from "@/common/database/supabase/clients";
import { createClient as createAuthServerClient } from "@/binzeo/auth/lib/supabase/server";
import { getPaymentUiRequestOrigin } from "@/binzeo/auth/payment-ui-origin";

export type CentralProfile = {
  id: string;
  binzeo_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  username: string | null;
  profile_photo_url: string | null;
  country_code: string | null;
  preferred_language: string | null;
  timezone: string | null;
  account_status: string | null;
};

export type CentralIdentity = {
  user: User;
  profile: CentralProfile;
  accessToken: string;
  supabase: ReturnType<typeof createUserScopedClient>;
};

export type IdentityFailure = { ok: false; status: 401 | 403 | 503; code: string; message: string };
export type IdentityResult = { ok: true; identity: CentralIdentity } | IdentityFailure;

export async function authenticateBearerToken(request: Request): Promise<IdentityResult> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return { ok: false, status: 401, code: "BEARER_TOKEN_REQUIRED", message: "A valid bearer token is required." };

  try {
    const accessToken = match[1];
    const supabase = createUserScopedClient(accessToken);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return { ok: false, status: 401, code: "INVALID_TOKEN", message: "The access token is invalid or expired." };
    if (!user.email_confirmed_at) return { ok: false, status: 403, code: "EMAIL_VERIFICATION_REQUIRED", message: "Email verification is required." };

    const [{ data: profile, error: profileError }, { data: verification, error: verificationError }] = await Promise.all([
      supabase.from("profiles").select("id,binzeo_user_id,first_name,last_name,display_name,username,profile_photo_url,country_code,preferred_language,timezone,account_status").eq("id", user.id).maybeSingle(),
      supabase.from("user_verification_records").select("verification_status").eq("user_id", user.id).eq("verification_type", "email").maybeSingle(),
    ]);
    if (profileError || verificationError) return { ok: false, status: 503, code: "IDENTITY_LOOKUP_UNAVAILABLE", message: "Identity verification is temporarily unavailable." };
    if (!profile || profile.account_status !== "active") return { ok: false, status: 403, code: "ACCOUNT_NOT_ACTIVE", message: "The account is not active." };
    if (verification?.verification_status !== "verified") return { ok: false, status: 403, code: "EMAIL_VERIFICATION_REQUIRED", message: "Email verification is required." };

    return { ok: true, identity: { user, profile: profile as CentralProfile, accessToken, supabase } };
  } catch (error) {
    console.error("[CENTRAL_IDENTITY_ERROR]", error);
    return { ok: false, status: 503, code: "IDENTITY_SERVICE_UNAVAILABLE", message: "Identity verification is temporarily unavailable." };
  }
}

/**
 * Allows the Auth-owned customer payment page to use its Central Auth cookie.
 * Other browser origins must continue to use an explicit bearer token.
 */
export async function authenticatePaymentRequest(request: Request): Promise<IdentityResult> {
  if (request.headers.get("authorization")) return authenticateBearerToken(request);

  const configuredAuthUrl = process.env.AUTH_APP_URL?.trim();
  const requestOrigin = getPaymentUiRequestOrigin(request);
  let configuredAuthOrigin: string | null = null;
  try {
    if (configuredAuthUrl) configuredAuthOrigin = new URL(configuredAuthUrl).origin;
  } catch {
    configuredAuthOrigin = null;
  }

  if (!requestOrigin || !configuredAuthOrigin || requestOrigin !== configuredAuthOrigin) {
    return { ok: false, status: 403, code: "PAYMENT_UI_ORIGIN_NOT_ALLOWED", message: "The payment page origin is not allowed." };
  }

  if (!request.headers.get("cookie")) {
    return { ok: false, status: 401, code: "CENTRAL_SESSION_REQUIRED", message: "A signed-in Central Auth session is required." };
  }

  try {
    const authClient = await createAuthServerClient();
    const { data: { session }, error } = await authClient.auth.getSession();
    if (error || !session?.access_token) {
      return { ok: false, status: 401, code: "CENTRAL_SESSION_INVALID", message: "The Central Auth session is invalid or expired." };
    }

    return authenticateBearerToken(new Request(request.url, {
      headers: { authorization: `Bearer ${session.access_token}` },
    }));
  } catch (error) {
    console.error("[CENTRAL_PAYMENT_SESSION_ERROR]", error instanceof Error ? error.name : "UNKNOWN");
    return { ok: false, status: 503, code: "CENTRAL_SESSION_UNAVAILABLE", message: "Central Auth is temporarily unavailable." };
  }
}

export type AdminAccess = { roles: string[]; permissions: string[]; is_active: boolean };

export async function getAdminAccess(identity: CentralIdentity): Promise<AdminAccess | null> {
  const { data, error } = await identity.supabase
    .from("admin_access")
    .select("roles,permissions,is_active")
    .eq("user_id", identity.user.id)
    .maybeSingle();
  if (error || !data?.is_active) return null;
  return {
    roles: Array.isArray(data.roles) ? data.roles : [],
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    is_active: data.is_active,
  };
}
