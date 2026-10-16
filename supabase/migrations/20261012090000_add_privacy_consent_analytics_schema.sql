-- BINZEO Cookie, Consent, Tracking, Privacy & Analytics schema.
-- Source of truth: user-provided pasted_content.txt (21 tables / 351 listed columns).
-- Analysts (admin_access.roles contains analytics) receive SELECT only; Super Admins may manage configuration.
-- Raw event/consent/audit/deletion log writes are reserved to trusted service_role APIs.

CREATE TABLE public.websites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  website_name text NOT NULL,
  website_domain text NOT NULL,
  website_url text NOT NULL,
  website_type text NOT NULL,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  privacy_policy_url text,
  cookie_policy_url text,
  default_consent_version text,
  supported_regions text[] DEFAULT '{}'::text[] NOT NULL,
  default_language text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.websites IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.consent_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  policy_name text NOT NULL,
  policy_version text NOT NULL,
  policy_type text NOT NULL,
  policy_content text NOT NULL,
  policy_hash text NOT NULL,
  effective_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  is_current boolean DEFAULT false NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.consent_policy_versions IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.cookie_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  cookie_name text NOT NULL CHECK (length(btrim(cookie_name)) > 0),
  provider_name text,
  category text NOT NULL,
  purpose text NOT NULL,
  description text,
  data_collected jsonb DEFAULT '[]'::jsonb NOT NULL,
  cookie_domain text,
  cookie_path text,
  cookie_type text,
  first_party_or_third_party text,
  expiration_duration text,
  session_based boolean DEFAULT false NOT NULL,
  consent_required boolean DEFAULT true NOT NULL,
  legal_basis text,
  privacy_policy_url text,
  provider_policy_url text,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true NOT NULL,
  is_essential boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_audited_at timestamptz
);
COMMENT ON TABLE public.cookie_registry IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  visitor_id uuid NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  consent_id uuid REFERENCES public.consent_policy_versions(id) ON DELETE SET NULL,
  consent_version text NOT NULL,
  consent_status text NOT NULL CHECK (consent_status IN ('accepted','rejected','partial','withdrawn','unset')),
  consent_source text,
  consent_method text,
  necessary_consent boolean DEFAULT false NOT NULL,
  functional_consent boolean DEFAULT false NOT NULL,
  analytics_consent boolean DEFAULT false NOT NULL,
  experience_consent boolean DEFAULT false NOT NULL,
  marketing_consent boolean DEFAULT false NOT NULL,
  cross_site_consent boolean DEFAULT false NOT NULL,
  ip_address_hash text,
  country_code text,
  user_agent_hash text,
  policy_version text,
  consent_timestamp timestamptz DEFAULT now() NOT NULL,
  withdrawn_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.consent_records IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.consent_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  visitor_id uuid NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  necessary_enabled boolean DEFAULT true NOT NULL,
  functional_enabled boolean DEFAULT false NOT NULL,
  analytics_enabled boolean DEFAULT false NOT NULL,
  experience_enabled boolean DEFAULT false NOT NULL,
  marketing_enabled boolean DEFAULT false NOT NULL,
  cross_site_enabled boolean DEFAULT false NOT NULL,
  custom_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  consent_version text,
  last_action text,
  last_updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.consent_preferences IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.anonymous_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  visitor_id uuid NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  first_seen_at timestamptz DEFAULT now() NOT NULL,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  initial_referrer text,
  initial_landing_page text,
  country_code text,
  region_code text,
  city_name text,
  device_category text,
  browser_name text,
  browser_version text,
  operating_system text,
  operating_system_version text,
  language_code text,
  timezone text,
  consent_status text,
  is_registered boolean DEFAULT false NOT NULL,
  linked_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visitor_status text DEFAULT 'active' NOT NULL CHECK (visitor_status IN ('active','registered','excluded','deleted')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz
);
COMMENT ON TABLE public.anonymous_visitors IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.visitor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid UNIQUE NOT NULL,
  visitor_id uuid NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  session_started_at timestamptz DEFAULT now() NOT NULL,
  session_ended_at timestamptz,
  landing_page text,
  exit_page text,
  referrer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  page_view_count integer DEFAULT 0 NOT NULL CHECK (page_view_count >= 0),
  event_count integer DEFAULT 0 NOT NULL CHECK (event_count >= 0),
  session_duration_seconds integer DEFAULT 0 NOT NULL CHECK (session_duration_seconds >= 0),
  device_category text,
  browser_name text,
  operating_system text,
  country_code text,
  consent_state text DEFAULT 'unknown' NOT NULL CHECK (consent_state IN ('unknown','necessary','partial','all','rejected','withdrawn')),
  is_authenticated boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.visitor_sessions IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid UNIQUE NOT NULL,
  event_name text NOT NULL,
  event_category text,
  visitor_id uuid,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id uuid,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  page_url text,
  page_path text,
  page_title text,
  referrer_url text,
  event_source text,
  event_timestamp timestamptz DEFAULT now() NOT NULL,
  event_properties jsonb DEFAULT '{}'::jsonb NOT NULL,
  device_category text,
  browser_name text,
  operating_system text,
  country_code text,
  consent_category text,
  consent_version text,
  is_anonymized boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.analytics_events IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  page_view_id uuid UNIQUE NOT NULL,
  visitor_id uuid NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id uuid,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  page_url text,
  page_path text,
  page_title text,
  referrer_url text,
  entry_page text,
  exit_page text,
  scroll_depth_percent numeric(5,2) CHECK (scroll_depth_percent >= 0 AND scroll_depth_percent <= 100),
  time_on_page_seconds integer DEFAULT 0 NOT NULL CHECK (time_on_page_seconds >= 0),
  device_category text,
  browser_name text,
  country_code text,
  viewed_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.page_views IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.tracking_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  integration_name text NOT NULL,
  integration_type text NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  provider_name text,
  script_url text,
  tracking_category text,
  consent_required boolean DEFAULT true NOT NULL,
  consent_category text,
  load_priority integer DEFAULT 0 NOT NULL CHECK (load_priority >= 0),
  configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  is_blocked_by_default boolean DEFAULT false NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.tracking_integrations IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.tracking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  rule_name text NOT NULL,
  rule_description text,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  tracking_category text NOT NULL,
  trigger_type text NOT NULL,
  trigger_condition jsonb DEFAULT '{}'::jsonb NOT NULL,
  consent_requirement text,
  allowed_regions text[] DEFAULT '{}'::text[] NOT NULL,
  blocked_regions text[] DEFAULT '{}'::text[] NOT NULL,
  activation_condition jsonb DEFAULT '{}'::jsonb NOT NULL,
  priority integer DEFAULT 0 NOT NULL CHECK (priority >= 0),
  is_enabled boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.tracking_rules IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.tracking_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  script_name text NOT NULL,
  script_url text NOT NULL,
  script_domain text,
  script_category text NOT NULL,
  script_purpose text,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  consent_category text,
  execution_type text,
  load_strategy text,
  is_essential boolean DEFAULT false NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  integrity_hash text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.tracking_scripts IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.cookie_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  scan_id uuid UNIQUE NOT NULL,
  scan_type text NOT NULL,
  scan_started_at timestamptz DEFAULT now() NOT NULL,
  scan_completed_at timestamptz,
  scan_status text DEFAULT 'queued' NOT NULL CHECK (scan_status IN ('queued','running','completed','failed','cancelled')),
  cookies_detected integer DEFAULT 0 NOT NULL CHECK (cookies_detected >= 0),
  scripts_detected integer DEFAULT 0 NOT NULL CHECK (scripts_detected >= 0),
  trackers_detected integer DEFAULT 0 NOT NULL CHECK (trackers_detected >= 0),
  third_party_domains text[] DEFAULT '{}'::text[] NOT NULL,
  scan_results jsonb DEFAULT '{}'::jsonb NOT NULL,
  compliance_status text DEFAULT 'unknown' NOT NULL CHECK (compliance_status IN ('unknown','compliant','non_compliant','needs_review')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.cookie_scans IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.cookie_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  scan_id uuid REFERENCES public.cookie_scans(scan_id) ON DELETE CASCADE NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  cookie_name text NOT NULL,
  cookie_domain text,
  cookie_path text,
  cookie_category text,
  provider_name text,
  expiration_duration text,
  is_first_party boolean DEFAULT false NOT NULL,
  is_classified boolean DEFAULT false NOT NULL,
  classification_source text,
  consent_required boolean DEFAULT true NOT NULL,
  detected_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.cookie_scan_results IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  action_type text NOT NULL,
  action_description text,
  target_type text,
  target_id uuid,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  ip_address_hash text,
  user_agent_hash text,
  request_id uuid,
  result_status text DEFAULT 'success' NOT NULL CHECK (result_status IN ('success','denied','failed','blocked')),
  risk_level text DEFAULT 'low' NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.security_audit_logs IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.data_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  policy_name text NOT NULL,
  data_category text NOT NULL,
  table_name text NOT NULL,
  retention_period_days integer NOT NULL CHECK (retention_period_days > 0),
  retention_basis text,
  deletion_method text NOT NULL,
  anonymization_enabled boolean DEFAULT false NOT NULL,
  archive_enabled boolean DEFAULT false NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  last_executed_at timestamptz,
  next_execution_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.data_retention_policies IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid UNIQUE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visitor_id uuid,
  request_type text NOT NULL,
  request_status text DEFAULT 'received' NOT NULL CHECK (request_status IN ('received','verification_required','verified','in_progress','completed','rejected','cancelled')),
  verification_status text,
  request_source text,
  requested_data_categories jsonb DEFAULT '[]'::jsonb NOT NULL,
  received_at timestamptz DEFAULT now() NOT NULL,
  verified_at timestamptz,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  rejection_reason text,
  resolution_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.privacy_requests IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.analytics_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  goal_name text NOT NULL,
  goal_type text NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  event_name text,
  goal_condition jsonb DEFAULT '{}'::jsonb NOT NULL,
  conversion_window_days integer DEFAULT 30 NOT NULL CHECK (conversion_window_days > 0),
  attribution_model text,
  is_enabled boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.analytics_goals IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.analytics_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  experiment_name text NOT NULL,
  experiment_key text NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  experiment_type text NOT NULL,
  hypothesis text,
  variant_configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
  targeting_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
  consent_requirement text,
  start_at timestamptz,
  end_at timestamptz,
  experiment_status text DEFAULT 'draft' NOT NULL CHECK (experiment_status IN ('draft','scheduled','running','paused','completed','cancelled')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.analytics_experiments IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.data_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid REFERENCES public.privacy_requests(request_id) ON DELETE RESTRICT NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visitor_id uuid,
  data_category text NOT NULL,
  table_name text NOT NULL,
  records_deleted bigint DEFAULT 0 NOT NULL CHECK (records_deleted >= 0),
  deletion_status text DEFAULT 'pending' NOT NULL CHECK (deletion_status IN ('pending','running','completed','failed','partially_completed')),
  deletion_method text NOT NULL,
  executed_at timestamptz,
  verified_at timestamptz,
  error_details text,
  created_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.data_deletion_logs IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE TABLE public.privacy_admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  setting_category text NOT NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  description text,
  is_enabled boolean DEFAULT false NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.privacy_admin_settings IS 'BINZEO consent, privacy or analytics system data; direct access is limited by RLS to analytics and Super Admin roles.';

CREATE UNIQUE INDEX cookie_registry_global_name_uq ON public.cookie_registry (lower(cookie_name), lower(coalesce(cookie_domain, ''))) WHERE website_id IS NULL;
CREATE UNIQUE INDEX cookie_registry_website_name_uq ON public.cookie_registry (website_id, lower(cookie_name), lower(coalesce(cookie_domain, ''))) WHERE website_id IS NOT NULL;
CREATE UNIQUE INDEX anonymous_visitors_website_visitor_uq ON public.anonymous_visitors (website_id, visitor_id);
CREATE UNIQUE INDEX privacy_admin_settings_global_key_uq ON public.privacy_admin_settings (setting_key) WHERE website_id IS NULL;
CREATE UNIQUE INDEX privacy_admin_settings_website_key_uq ON public.privacy_admin_settings (website_id, setting_key) WHERE website_id IS NOT NULL;
CREATE UNIQUE INDEX tracking_integrations_global_name_uq ON public.tracking_integrations (lower(integration_name)) WHERE website_id IS NULL;
CREATE UNIQUE INDEX tracking_integrations_website_name_uq ON public.tracking_integrations (website_id, lower(integration_name)) WHERE website_id IS NOT NULL;
CREATE UNIQUE INDEX analytics_goals_website_name_uq ON public.analytics_goals (website_id, lower(goal_name));
CREATE UNIQUE INDEX analytics_experiments_website_key_uq ON public.analytics_experiments (website_id, experiment_key);
CREATE UNIQUE INDEX websites_domain_uq ON public.websites (lower(website_domain));
CREATE UNIQUE INDEX consent_policy_versions_name_version_uq ON public.consent_policy_versions (lower(policy_name), policy_version);
CREATE INDEX privacy_requests_user_received_idx ON public.privacy_requests (user_id, received_at DESC);
CREATE INDEX security_audit_logs_actor_time_idx ON public.security_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX cookie_scans_website_started_idx ON public.cookie_scans (website_id, scan_started_at DESC);
CREATE INDEX cookie_scan_results_scan_idx ON public.cookie_scan_results (scan_id, detected_at DESC);
CREATE INDEX data_deletion_logs_request_idx ON public.data_deletion_logs (request_id, created_at DESC);
CREATE INDEX cookie_registry_website_time_idx ON public.cookie_registry (website_id, created_at DESC);
CREATE INDEX consent_records_visitor_time_idx ON public.consent_records (visitor_id, consent_timestamp DESC);
CREATE INDEX consent_records_user_time_idx ON public.consent_records (user_id, consent_timestamp DESC);
CREATE INDEX consent_preferences_website_time_idx ON public.consent_preferences (website_id, created_at DESC);
CREATE INDEX consent_preferences_visitor_time_idx ON public.consent_preferences (visitor_id, created_at DESC);
CREATE INDEX consent_preferences_user_time_idx ON public.consent_preferences (user_id, created_at DESC);
CREATE INDEX anonymous_visitors_website_time_idx ON public.anonymous_visitors (website_id, created_at DESC);
CREATE INDEX visitor_sessions_website_time_idx ON public.visitor_sessions (website_id, session_started_at DESC);
CREATE INDEX visitor_sessions_visitor_time_idx ON public.visitor_sessions (visitor_id, session_started_at DESC);
CREATE INDEX visitor_sessions_user_time_idx ON public.visitor_sessions (user_id, session_started_at DESC);
CREATE INDEX analytics_events_website_time_idx ON public.analytics_events (website_id, event_timestamp DESC);
CREATE INDEX analytics_events_visitor_time_idx ON public.analytics_events (visitor_id, event_timestamp DESC);
CREATE INDEX analytics_events_user_time_idx ON public.analytics_events (user_id, event_timestamp DESC);
CREATE INDEX page_views_website_time_idx ON public.page_views (website_id, viewed_at DESC);
CREATE INDEX page_views_visitor_time_idx ON public.page_views (visitor_id, viewed_at DESC);
CREATE INDEX page_views_user_time_idx ON public.page_views (user_id, viewed_at DESC);
CREATE INDEX tracking_integrations_website_time_idx ON public.tracking_integrations (website_id, created_at DESC);
CREATE INDEX tracking_rules_website_time_idx ON public.tracking_rules (website_id, created_at DESC);
CREATE INDEX tracking_scripts_website_time_idx ON public.tracking_scripts (website_id, created_at DESC);
CREATE INDEX privacy_requests_visitor_time_idx ON public.privacy_requests (visitor_id, created_at DESC);
CREATE INDEX privacy_requests_user_time_idx ON public.privacy_requests (user_id, created_at DESC);
CREATE INDEX analytics_goals_website_time_idx ON public.analytics_goals (website_id, created_at DESC);
CREATE INDEX analytics_experiments_website_time_idx ON public.analytics_experiments (website_id, created_at DESC);
CREATE INDEX data_deletion_logs_visitor_time_idx ON public.data_deletion_logs (visitor_id, created_at DESC);
CREATE INDEX data_deletion_logs_user_time_idx ON public.data_deletion_logs (user_id, created_at DESC);
CREATE INDEX privacy_admin_settings_website_time_idx ON public.privacy_admin_settings (website_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.analytics_role_can_read()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_access AS aa
    WHERE aa.user_id = auth.uid()
      AND aa.is_active = true
      AND (aa.roles @> ARRAY['analytics']::text[] OR aa.roles @> ARRAY['super_admin']::text[])
  );
$function$;
CREATE OR REPLACE FUNCTION public.analytics_role_is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_access AS aa
    WHERE aa.user_id = auth.uid()
      AND aa.is_active = true
      AND aa.roles @> ARRAY['super_admin']::text[]
  );
$function$;
ReVOKE ALL ON FUNCTION public.analytics_role_can_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_role_is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_role_can_read() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_role_is_super_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_tracking_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_consent_preferences_last_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.last_updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER cookie_registry_set_updated_at BEFORE UPDATE ON public.cookie_registry FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER anonymous_visitors_set_updated_at BEFORE UPDATE ON public.anonymous_visitors FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER visitor_sessions_set_updated_at BEFORE UPDATE ON public.visitor_sessions FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER tracking_integrations_set_updated_at BEFORE UPDATE ON public.tracking_integrations FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER tracking_rules_set_updated_at BEFORE UPDATE ON public.tracking_rules FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER tracking_scripts_set_updated_at BEFORE UPDATE ON public.tracking_scripts FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER data_retention_policies_set_updated_at BEFORE UPDATE ON public.data_retention_policies FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER privacy_requests_set_updated_at BEFORE UPDATE ON public.privacy_requests FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER websites_set_updated_at BEFORE UPDATE ON public.websites FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER analytics_goals_set_updated_at BEFORE UPDATE ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER analytics_experiments_set_updated_at BEFORE UPDATE ON public.analytics_experiments FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER privacy_admin_settings_set_updated_at BEFORE UPDATE ON public.privacy_admin_settings FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
CREATE TRIGGER consent_preferences_set_last_updated_at BEFORE UPDATE ON public.consent_preferences FOR EACH ROW EXECUTE FUNCTION public.set_consent_preferences_last_updated_at();

DO $policies$
DECLARE
  tbl text;
  table_names text[] := ARRAY['cookie_registry', 'consent_records', 'consent_preferences', 'anonymous_visitors', 'visitor_sessions', 'analytics_events', 'page_views', 'tracking_integrations', 'tracking_rules', 'tracking_scripts', 'cookie_scans', 'cookie_scan_results', 'security_audit_logs', 'data_retention_policies', 'privacy_requests', 'websites', 'consent_policy_versions', 'analytics_goals', 'analytics_experiments', 'data_deletion_logs', 'privacy_admin_settings'];
  append_only text[] := ARRAY['analytics_events','consent_records','cookie_scan_results','data_deletion_logs','security_audit_logs'];
BEGIN
  FOREACH tbl IN ARRAY table_names LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
    EXECUTE format('CREATE POLICY analytics_read ON public.%I FOR SELECT TO authenticated USING (public.analytics_role_can_read())', tbl);
    IF NOT (tbl = ANY(append_only)) THEN
      EXECUTE format('CREATE POLICY super_admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.analytics_role_is_super_admin())', tbl);
      EXECUTE format('CREATE POLICY super_admin_update ON public.%I FOR UPDATE TO authenticated USING (public.analytics_role_is_super_admin()) WITH CHECK (public.analytics_role_is_super_admin())', tbl);
      EXECUTE format('CREATE POLICY super_admin_delete ON public.%I FOR DELETE TO authenticated USING (public.analytics_role_is_super_admin())', tbl);
    ELSE
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', tbl);
    END IF;
  END LOOP;
END;
$policies$;
