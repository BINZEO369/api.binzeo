import { getAdminApiContext, getAdminDataClient, hasAdminPermission } from "@/sites/binzeo/admin/lib/admin";
import { fail, ok } from "@/sites/binzeo/admin/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };
const userDatasets = [
  ["user_contacts", ["id", "contact_type", "contact_value", "label", "is_primary", "is_verified", "created_at", "updated_at"]],
  ["user_addresses", ["id", "address_type", "address_line_1", "address_line_2", "address_line_3", "country_code", "state_province", "district", "city", "area", "postal_code", "latitude", "longitude", "is_primary", "location_accuracy_meters", "location_source", "created_at", "updated_at"]],
  ["user_devices", ["id", "device_id", "device_name", "device_type", "operating_system", "os_version", "browser", "browser_version", "app_version", "last_seen_at", "is_trusted", "created_at"]],
  ["user_login_history", ["id", "login_method", "login_status", "ip_address", "device_id", "user_agent", "country", "city", "login_at", "logout_at", "latitude", "longitude", "location_accuracy_meters", "location_source"]],
  ["user_activity_logs", ["id", "activity_type", "activity_description", "ip_address", "device_id", "metadata", "created_at"]],
  ["user_auth_methods", ["id", "provider", "auth_method", "provider_identity_id", "provider_email", "first_seen_at", "signup_at", "last_sign_in_at", "login_count", "last_event", "metadata", "created_at", "updated_at"]],
  ["user_verification_records", ["id", "verification_type", "verification_status", "source_of_truth", "verified_at", "last_requested_at", "expires_at", "attempt_count", "metadata", "created_at", "updated_at"]],
  ["user_passkeys", ["id", "sign_count", "authenticator_type", "device_name", "transports", "aaguid", "is_discoverable", "is_backed_up", "last_used_at", "expires_at", "revoked_at", "metadata", "created_at", "updated_at"]],
  ["user_two_factor_settings", ["user_id", "enabled", "method", "enabled_at", "disabled_at", "created_at", "updated_at"]],
  ["two_factor_authentication_events", ["id", "email", "event_type", "login_method", "challenge_id", "status", "ip_address", "user_agent", "provider_message_id", "sent_at", "verified_at", "metadata", "created_at"]],
  ["two_factor_challenges", ["id", "email", "login_method", "expires_at", "attempt_count", "max_attempts", "consumed_at", "verified_at", "request_ip", "email_delivery_status", "email_sent_at", "email_error", "created_at"]],
  ["email_verification_challenges", ["id", "expires_at", "attempt_count", "max_attempts", "last_attempt_at", "consumed_at", "verified_at", "request_ip", "created_at"]],
  ["password_reset_challenges", ["id", "email", "purpose", "expires_at", "attempt_count", "max_attempts", "last_attempt_at", "consumed_at", "verified_at", "request_ip", "email_delivery_status", "email_sent_at", "email_error", "created_at", "password_changed_at"]],
  ["password_change_events", ["id", "challenge_id", "email", "source", "changed_at", "notification_status", "notification_sent_at", "notification_attempt_count", "last_error", "provider_message_id", "metadata", "created_at", "updated_at"]],
  ["welcome_email_deliveries", ["id", "email", "template_version", "status", "attempt_count", "sent_at", "last_attempt_at", "next_attempt_at", "last_error", "provider_message_id", "metadata", "created_at", "updated_at"]],
  ["user_birthdays", ["user_id", "birth_date", "birth_year", "birth_month", "birth_day", "current_age", "age_calculated_at", "next_birthday_date", "email", "display_name", "created_at", "updated_at"]],
  ["user_sector_access", ["user_id", "sector_id", "status", "selected_at", "updated_at"]],
  ["profile_images", ["user_id", "profile_id", "image_url", "image_public_id", "created_at", "updated_at"]],
  ["profile_deleted_images", ["id", "profile_id", "image_url", "image_public_id", "deletion_reason", "deleted_at"]],
  ["login_attempt_limits", ["id", "scope_type", "scope_key", "account_email", "request_ip", "window_date", "attempt_count", "first_attempt_at", "last_attempt_at", "created_at", "updated_at", "lockout_until"]],
  ["login_limit_exceeded", ["id", "account_email", "account_key", "request_ip", "window_date", "account_attempts", "ip_attempts", "daily_limit", "blocked_count", "first_blocked_at", "last_blocked_at", "created_at", "updated_at"]],
] as const;

export async function GET(_request: Request, { params }: RouteContext) {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  if (!hasAdminPermission(access, "users.read")) return fail("User read permission required", 403, "USERS_READ_REQUIRED");
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail("Invalid user ID", 400, "USER_ID_INVALID");

  try {
    const db = await getAdminDataClient(access);
    const [{ data: profile, error: profileError }, ...results] = await Promise.all([
      db.from("profiles").select("*").eq("id", id).maybeSingle(),
      ...userDatasets.map(([table, columns]) => db.from(table).select(columns.join(",")).eq("user_id", id).limit(500)),
    ]);
    if (profileError || !profile) return fail("User not found", 404, "USER_NOT_FOUND");
    const tables: Record<string, unknown[]> = {};
    userDatasets.forEach(([table], index) => { tables[table] = results[index]?.data ?? []; });
    return ok({ profile, tables });
  } catch {
    return fail("User details could not be loaded", 500, "USER_DETAILS_FAILED");
  }
}
