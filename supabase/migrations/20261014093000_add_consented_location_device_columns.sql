-- Existing tracking tables only. No new table is created.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['anonymous_visitors','visitor_sessions','analytics_events','page_views'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS raw_ip_address text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ip_version text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_latitude numeric(9,6)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_longitude numeric(9,6)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_accuracy_meters numeric(10,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_altitude_meters numeric(10,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_heading numeric(7,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_speed_mps numeric(10,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gps_captured_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_permission_status text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_source text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS screen_width integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS screen_height integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS viewport_width integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS viewport_height integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_pixel_ratio numeric(5,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS touch_points integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hardware_concurrency integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_memory_gb numeric(6,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS network_type text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS network_downlink_mbps numeric(8,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS webgl_vendor text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS webgl_renderer text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_fingerprint_hash text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sensitive_data_expires_at timestamptz', t);
  END LOOP;
END $$;

ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS precise_location_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS raw_ip_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS device_diagnostics_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS fingerprint_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS precise_location_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS raw_ip_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS device_diagnostics_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS fingerprint_consent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS page_views_sensitive_expiry_idx ON public.page_views (sensitive_data_expires_at) WHERE sensitive_data_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitor_sessions_sensitive_expiry_idx ON public.visitor_sessions (sensitive_data_expires_at) WHERE sensitive_data_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS anonymous_visitors_sensitive_expiry_idx ON public.anonymous_visitors (sensitive_data_expires_at) WHERE sensitive_data_expires_at IS NOT NULL;
