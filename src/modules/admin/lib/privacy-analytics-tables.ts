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

export function getPrivacyAnalyticsTable(name: string): PrivacyAnalyticsTable | undefined {
  return PRIVACY_ANALYTICS_TABLES.find((table) => table.name === name);
}
