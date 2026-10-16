-- Keep all consent telemetry flags in the atomic consent RPC.
-- This avoids relying on PostgREST schema-cache visibility for follow-up PATCH calls.
CREATE OR REPLACE FUNCTION public.record_cookie_consent_with_metadata(
  p_visitor_id uuid,
  p_consent_version text,
  p_consent_status text,
  p_consent_method text,
  p_preferences jsonb,
  p_ip_address_hash text,
  p_country_code text,
  p_user_agent_hash text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_analytics_enabled boolean;
  v_precise_location_enabled boolean;
  v_raw_ip_enabled boolean;
  v_device_diagnostics_enabled boolean;
  v_fingerprint_enabled boolean;
BEGIN
  IF p_visitor_id IS NULL OR p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN
    RAISE EXCEPTION 'visitor and preference object are required';
  END IF;
  IF COALESCE((p_preferences->>'necessary_enabled')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'necessary cookies must remain enabled';
  END IF;
  IF p_consent_status IS NULL OR p_consent_status NOT IN ('accepted', 'rejected', 'partial', 'withdrawn', 'unset') THEN
    RAISE EXCEPTION 'invalid consent status';
  END IF;
  IF p_consent_method IS NULL OR p_consent_method NOT IN ('accept_all', 'reject_optional', 'save_settings') THEN
    RAISE EXCEPTION 'invalid consent method';
  END IF;
  IF p_consent_version IS NULL OR length(p_consent_version) > 64 THEN
    RAISE EXCEPTION 'invalid consent version';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_preferences) AS item(key, value)
    WHERE item.key IN ('functional_enabled','analytics_enabled','experience_enabled','marketing_enabled','cross_site_enabled','precise_location_enabled','raw_ip_enabled','device_diagnostics_enabled','fingerprint_enabled')
      AND jsonb_typeof(item.value) <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'optional preferences must be booleans';
  END IF;
  v_analytics_enabled := COALESCE((p_preferences->>'analytics_enabled')::boolean, false);
  v_precise_location_enabled := COALESCE((p_preferences->>'precise_location_enabled')::boolean, false);
  v_raw_ip_enabled := COALESCE((p_preferences->>'raw_ip_enabled')::boolean, false);
  v_device_diagnostics_enabled := COALESCE((p_preferences->>'device_diagnostics_enabled')::boolean, false);
  v_fingerprint_enabled := COALESCE((p_preferences->>'fingerprint_enabled')::boolean, false);
  IF NOT v_analytics_enabled AND (p_ip_address_hash IS NOT NULL OR p_country_code IS NOT NULL OR p_user_agent_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'visitor identifiers and location require analytics consent';
  END IF;
  IF p_ip_address_hash IS NOT NULL AND p_ip_address_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid IP address hash';
  END IF;
  IF p_user_agent_hash IS NOT NULL AND p_user_agent_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid user-agent hash';
  END IF;
  IF p_country_code IS NOT NULL AND p_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid country code';
  END IF;
  INSERT INTO public.consent_preferences (
    visitor_id, necessary_enabled, functional_enabled, analytics_enabled,
    experience_enabled, marketing_enabled, cross_site_enabled,
    precise_location_enabled, raw_ip_enabled, device_diagnostics_enabled, fingerprint_enabled,
    custom_preferences, consent_version, last_action, last_updated_at
  ) VALUES (
    p_visitor_id, true,
    COALESCE((p_preferences->>'functional_enabled')::boolean, false),
    v_analytics_enabled,
    COALESCE((p_preferences->>'experience_enabled')::boolean, false),
    COALESCE((p_preferences->>'marketing_enabled')::boolean, false),
    COALESCE((p_preferences->>'cross_site_enabled')::boolean, false),
    v_precise_location_enabled, v_raw_ip_enabled, v_device_diagnostics_enabled, v_fingerprint_enabled,
    p_preferences, p_consent_version, p_consent_method, now()
  )
  ON CONFLICT (visitor_id) DO UPDATE SET
    necessary_enabled = EXCLUDED.necessary_enabled,
    functional_enabled = EXCLUDED.functional_enabled,
    analytics_enabled = EXCLUDED.analytics_enabled,
    experience_enabled = EXCLUDED.experience_enabled,
    marketing_enabled = EXCLUDED.marketing_enabled,
    cross_site_enabled = EXCLUDED.cross_site_enabled,
    precise_location_enabled = EXCLUDED.precise_location_enabled,
    raw_ip_enabled = EXCLUDED.raw_ip_enabled,
    device_diagnostics_enabled = EXCLUDED.device_diagnostics_enabled,
    fingerprint_enabled = EXCLUDED.fingerprint_enabled,
    custom_preferences = EXCLUDED.custom_preferences,
    consent_version = EXCLUDED.consent_version,
    last_action = EXCLUDED.last_action,
    last_updated_at = now();
  INSERT INTO public.consent_records (
    visitor_id, consent_version, consent_status, consent_source, consent_method,
    necessary_consent, functional_consent, analytics_consent, experience_consent,
    marketing_consent, cross_site_consent, ip_address_hash, country_code,
    user_agent_hash, policy_version, consent_timestamp, withdrawn_at, expires_at,
    precise_location_consent, raw_ip_consent, device_diagnostics_consent, fingerprint_consent
  ) VALUES (
    p_visitor_id, p_consent_version, p_consent_status, 'cookie_banner', p_consent_method,
    true,
    COALESCE((p_preferences->>'functional_enabled')::boolean, false),
    v_analytics_enabled,
    COALESCE((p_preferences->>'experience_enabled')::boolean, false),
    COALESCE((p_preferences->>'marketing_enabled')::boolean, false),
    COALESCE((p_preferences->>'cross_site_enabled')::boolean, false),
    CASE WHEN v_analytics_enabled THEN p_ip_address_hash ELSE NULL END,
    CASE WHEN v_analytics_enabled THEN p_country_code ELSE NULL END,
    CASE WHEN v_analytics_enabled THEN p_user_agent_hash ELSE NULL END,
    p_consent_version, now(),
    CASE WHEN p_consent_status = 'withdrawn' THEN now() ELSE NULL END,
    now() + interval '180 days',
    v_precise_location_enabled, v_raw_ip_enabled, v_device_diagnostics_enabled, v_fingerprint_enabled
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_cookie_consent_with_metadata(uuid,text,text,text,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cookie_consent_with_metadata(uuid,text,text,text,jsonb,text,text,text) TO service_role;
