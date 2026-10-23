export type PrivacyAnalyticsTable = {
  name: string;
  title: string;
  description: string;
};

export type PrivacyAnalyticsGroup = {
  title: string;
  description: string;
  tables: PrivacyAnalyticsTable[];
};

export const PRIVACY_ANALYTICS_GROUPS: PrivacyAnalyticsGroup[] = [
  {
    title: "Website & tracking configuration",
    description: "Sites, consent policy and tracker configuration records.",
    tables: [
      { name: "websites", title: "Websites", description: "Registered websites and their privacy-policy settings." },
      { name: "consent_policy_versions", title: "Consent policy versions", description: "Published and historical consent policy versions." },
      { name: "cookie_registry", title: "Cookie registry", description: "Known cookies, their purpose, category and retention details." },
      { name: "tracking_integrations", title: "Tracking integrations", description: "Analytics providers and consent requirements." },
      { name: "tracking_rules", title: "Tracking rules", description: "Region, consent and activation rules for tracking." },
      { name: "tracking_scripts", title: "Tracking scripts", description: "Script registry and consent-controlled loading settings." },
    ],
  },
  {
    title: "Consent records",
    description: "Visitor consent choices and the associated policy preferences.",
    tables: [
      { name: "consent_records", title: "Consent records", description: "Consent and withdrawal snapshots, including consented metadata." },
      { name: "consent_preferences", title: "Consent preferences", description: "Visitor preferences for each optional data category." },
    ],
  },
  {
    title: "Visitors & activity",
    description: "Pseudonymous visitor, session, page-view and analytics-event records.",
    tables: [
      { name: "anonymous_visitors", title: "Anonymous visitors", description: "Pseudonymous visitor records and derived device/location metadata." },
      { name: "visitor_sessions", title: "Visitor sessions", description: "Session timing, landing/referral fields and activity counters." },
      { name: "analytics_events", title: "Analytics events", description: "Consent-gated analytics events and their metadata." },
      { name: "page_views", title: "Page views", description: "Sanitized page-view records and engagement fields." },
    ],
  },
  {
    title: "Cookie scans & security",
    description: "Cookie scan outcomes and restricted security/audit metadata.",
    tables: [
      { name: "cookie_scans", title: "Cookie scans", description: "Website cookie-scan runs and summarized findings." },
      { name: "cookie_scan_results", title: "Cookie scan results", description: "Individual cookies detected during scans." },
      { name: "security_audit_logs", title: "Security audit logs", description: "Privacy-management actions and security audit records." },
    ],
  },
  {
    title: "Privacy requests, retention & analysis",
    description: "Privacy-request workflow, retention configuration and analysis settings.",
    tables: [
      { name: "data_retention_policies", title: "Data retention policies", description: "Retention periods and policy execution metadata." },
      { name: "privacy_requests", title: "Privacy requests", description: "Access, correction, deletion and related request workflow." },
      { name: "analytics_goals", title: "Analytics goals", description: "Goal definitions and conversion configuration." },
      { name: "analytics_experiments", title: "Analytics experiments", description: "Experiment variants, targeting rules and status." },
      { name: "data_deletion_logs", title: "Data deletion logs", description: "Deletion-job results and verification records." },
      { name: "privacy_admin_settings", title: "Privacy admin settings", description: "Privacy-console settings and configuration values." },
    ],
  },
];

export const PRIVACY_ANALYTICS_TABLES = PRIVACY_ANALYTICS_GROUPS.flatMap((group) => group.tables);


/** Generated from the shared Supabase schema; keep in sync with migrations.
 * Explicit database projection for each privacy analytics table.
 */
export const PRIVACY_ANALYTICS_COLUMNS: Record<string, string[]> = {
  "analytics_events": [
    "id", "event_id", "event_name", "event_category", "visitor_id",
    "user_id", "session_id", "website_id", "page_url", "page_path",
    "page_title", "referrer_url", "event_source", "event_timestamp", "event_properties",
    "device_category", "browser_name", "operating_system", "country_code", "consent_category",
    "consent_version", "is_anonymized", "created_at", "raw_ip_address", "ip_version",
    "gps_latitude", "gps_longitude", "gps_accuracy_meters", "gps_altitude_meters", "gps_heading",
    "gps_speed_mps", "gps_captured_at", "location_permission_status", "location_source", "screen_width",
    "screen_height", "viewport_width", "viewport_height", "device_pixel_ratio", "touch_points",
    "hardware_concurrency", "device_memory_gb", "network_type", "network_downlink_mbps", "webgl_vendor",
    "webgl_renderer", "device_fingerprint_hash", "sensitive_data_expires_at"
  ],
  "analytics_experiments": [
    "id", "experiment_name", "experiment_key", "website_id", "experiment_type",
    "hypothesis", "variant_configuration", "targeting_rules", "consent_requirement", "start_at",
    "end_at", "experiment_status", "created_by", "created_at", "updated_at"
  ],
  "analytics_goals": [
    "id", "goal_name", "goal_type", "website_id", "event_name",
    "goal_condition", "conversion_window_days", "attribution_model", "is_enabled", "created_at",
    "updated_at"
  ],
  "anonymous_visitors": [
    "id", "visitor_id", "website_id", "first_seen_at", "last_seen_at",
    "initial_referrer", "initial_landing_page", "country_code", "region_code", "city_name",
    "device_category", "browser_name", "browser_version", "operating_system", "operating_system_version",
    "language_code", "timezone", "consent_status", "is_registered", "linked_user_id",
    "visitor_status", "created_at", "updated_at", "expires_at", "raw_ip_address",
    "ip_version", "gps_latitude", "gps_longitude", "gps_accuracy_meters", "gps_altitude_meters",
    "gps_heading", "gps_speed_mps", "gps_captured_at", "location_permission_status", "location_source",
    "screen_width", "screen_height", "viewport_width", "viewport_height", "device_pixel_ratio",
    "touch_points", "hardware_concurrency", "device_memory_gb", "network_type", "network_downlink_mbps",
    "webgl_vendor", "webgl_renderer", "device_fingerprint_hash", "sensitive_data_expires_at"
  ],
  "api_rate_limit_buckets": [
    "bucket_key", "window_started_at", "request_count", "updated_at"
  ],
  "consent_policy_versions": [
    "id", "policy_name", "policy_version", "policy_type", "policy_content",
    "policy_hash", "effective_at", "published_at", "retired_at", "is_current",
    "created_by", "created_at"
  ],
  "consent_preferences": [
    "id", "visitor_id", "user_id", "website_id", "necessary_enabled",
    "functional_enabled", "analytics_enabled", "experience_enabled", "marketing_enabled", "cross_site_enabled",
    "custom_preferences", "consent_version", "last_action", "last_updated_at", "created_at",
    "precise_location_enabled", "raw_ip_enabled", "device_diagnostics_enabled", "fingerprint_enabled"
  ],
  "consent_records": [
    "id", "visitor_id", "user_id", "consent_id", "consent_version",
    "consent_status", "consent_source", "consent_method", "necessary_consent", "functional_consent",
    "analytics_consent", "experience_consent", "marketing_consent", "cross_site_consent", "ip_address_hash",
    "country_code", "user_agent_hash", "policy_version", "consent_timestamp", "withdrawn_at",
    "expires_at", "created_at", "precise_location_consent", "raw_ip_consent", "device_diagnostics_consent",
    "fingerprint_consent"
  ],
  "cookie_registry": [
    "id", "cookie_name", "provider_name", "category", "purpose",
    "description", "data_collected", "cookie_domain", "cookie_path", "cookie_type",
    "first_party_or_third_party", "expiration_duration", "session_based", "consent_required", "legal_basis",
    "privacy_policy_url", "provider_policy_url", "website_id", "is_active", "is_essential",
    "created_at", "updated_at", "last_audited_at"
  ],
  "cookie_scan_results": [
    "id", "scan_id", "website_id", "cookie_name", "cookie_domain",
    "cookie_path", "cookie_category", "provider_name", "expiration_duration", "is_first_party",
    "is_classified", "classification_source", "consent_required", "detected_at", "created_at"
  ],
  "cookie_scans": [
    "id", "website_id", "scan_id", "scan_type", "scan_started_at",
    "scan_completed_at", "scan_status", "cookies_detected", "scripts_detected", "trackers_detected",
    "third_party_domains", "scan_results", "compliance_status", "created_by", "created_at"
  ],
  "data_deletion_logs": [
    "id", "request_id", "user_id", "visitor_id", "data_category",
    "table_name", "records_deleted", "deletion_status", "deletion_method", "executed_at",
    "verified_at", "error_details", "created_at"
  ],
  "data_retention_policies": [
    "id", "policy_name", "data_category", "table_name", "retention_period_days",
    "retention_basis", "deletion_method", "anonymization_enabled", "archive_enabled", "is_enabled",
    "last_executed_at", "next_execution_at", "created_at", "updated_at"
  ],
  "page_views": [
    "id", "page_view_id", "visitor_id", "user_id", "session_id",
    "website_id", "page_url", "page_path", "page_title", "referrer_url",
    "entry_page", "exit_page", "scroll_depth_percent", "time_on_page_seconds", "device_category",
    "browser_name", "country_code", "viewed_at", "created_at", "raw_ip_address",
    "ip_version", "gps_latitude", "gps_longitude", "gps_accuracy_meters", "gps_altitude_meters",
    "gps_heading", "gps_speed_mps", "gps_captured_at", "location_permission_status", "location_source",
    "screen_width", "screen_height", "viewport_width", "viewport_height", "device_pixel_ratio",
    "touch_points", "hardware_concurrency", "device_memory_gb", "network_type", "network_downlink_mbps",
    "webgl_vendor", "webgl_renderer", "device_fingerprint_hash", "sensitive_data_expires_at"
  ],
  "privacy_admin_settings": [
    "id", "setting_key", "setting_value", "setting_category", "website_id",
    "description", "is_enabled", "updated_by", "created_at", "updated_at"
  ],
  "privacy_requests": [
    "id", "request_id", "user_id", "visitor_id", "request_type",
    "request_status", "verification_status", "request_source", "requested_data_categories", "received_at",
    "verified_at", "assigned_to", "due_at", "completed_at", "rejection_reason",
    "resolution_notes", "created_at", "updated_at"
  ],
  "security_audit_logs": [
    "id", "actor_user_id", "actor_type", "action_type", "action_description",
    "target_type", "target_id", "website_id", "ip_address_hash", "user_agent_hash",
    "request_id", "result_status", "risk_level", "metadata", "created_at"
  ],
  "tracking_integrations": [
    "id", "integration_name", "integration_type", "website_id", "provider_name",
    "script_url", "tracking_category", "consent_required", "consent_category", "load_priority",
    "configuration", "is_enabled", "is_blocked_by_default", "created_by", "updated_by",
    "created_at", "updated_at"
  ],
  "tracking_rules": [
    "id", "rule_name", "rule_description", "website_id", "tracking_category",
    "trigger_type", "trigger_condition", "consent_requirement", "allowed_regions", "blocked_regions",
    "activation_condition", "priority", "is_enabled", "created_at", "updated_at"
  ],
  "tracking_scripts": [
    "id", "script_name", "script_url", "script_domain", "script_category",
    "script_purpose", "website_id", "consent_category", "execution_type", "load_strategy",
    "is_essential", "is_enabled", "integrity_hash", "created_at", "updated_at"
  ],
  "visitor_sessions": [
    "id", "session_id", "visitor_id", "user_id", "website_id",
    "session_started_at", "session_ended_at", "landing_page", "exit_page", "referrer_url",
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "page_view_count", "event_count", "session_duration_seconds", "device_category", "browser_name",
    "operating_system", "country_code", "consent_state", "is_authenticated", "created_at",
    "updated_at", "raw_ip_address", "ip_version", "gps_latitude", "gps_longitude",
    "gps_accuracy_meters", "gps_altitude_meters", "gps_heading", "gps_speed_mps", "gps_captured_at",
    "location_permission_status", "location_source", "screen_width", "screen_height", "viewport_width",
    "viewport_height", "device_pixel_ratio", "touch_points", "hardware_concurrency", "device_memory_gb",
    "network_type", "network_downlink_mbps", "webgl_vendor", "webgl_renderer", "device_fingerprint_hash",
    "sensitive_data_expires_at"
  ],
  "websites": [
    "id", "website_name", "website_domain", "website_url", "website_type",
    "owner_user_id", "privacy_policy_url", "cookie_policy_url", "default_consent_version", "supported_regions",
    "default_language", "is_active", "created_at", "updated_at"
  ],
};

export function getPrivacyAnalyticsTable(name: string): PrivacyAnalyticsTable | undefined {
  return PRIVACY_ANALYTICS_TABLES.find((table) => table.name === name);
}


export function getPrivacyAnalyticsColumns(table: string): string[] {
  return PRIVACY_ANALYTICS_COLUMNS[table] ?? [];
}
