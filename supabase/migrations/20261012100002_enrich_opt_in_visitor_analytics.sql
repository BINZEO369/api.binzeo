-- Enriched, consent-gated visitor analytics. Raw IP addresses and raw User-Agent strings
-- are never persisted; the application sends only HMAC-SHA256 hashes plus parsed metadata.

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
    WHERE item.key IN ('functional_enabled','analytics_enabled','experience_enabled','marketing_enabled','cross_site_enabled')
      AND jsonb_typeof(item.value) <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'optional preferences must be booleans';
  END IF;

  v_analytics_enabled := COALESCE((p_preferences->>'analytics_enabled')::boolean, false);
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
    custom_preferences, consent_version, last_action, last_updated_at
  ) VALUES (
    p_visitor_id,
    true,
    COALESCE((p_preferences->>'functional_enabled')::boolean, false),
    v_analytics_enabled,
    COALESCE((p_preferences->>'experience_enabled')::boolean, false),
    COALESCE((p_preferences->>'marketing_enabled')::boolean, false),
    COALESCE((p_preferences->>'cross_site_enabled')::boolean, false),
    p_preferences,
    p_consent_version,
    p_consent_method,
    now()
  )
  ON CONFLICT (visitor_id) DO UPDATE SET
    necessary_enabled = EXCLUDED.necessary_enabled,
    functional_enabled = EXCLUDED.functional_enabled,
    analytics_enabled = EXCLUDED.analytics_enabled,
    experience_enabled = EXCLUDED.experience_enabled,
    marketing_enabled = EXCLUDED.marketing_enabled,
    cross_site_enabled = EXCLUDED.cross_site_enabled,
    custom_preferences = EXCLUDED.custom_preferences,
    consent_version = EXCLUDED.consent_version,
    last_action = EXCLUDED.last_action,
    last_updated_at = now();

  INSERT INTO public.consent_records (
    visitor_id, consent_version, consent_status, consent_source, consent_method,
    necessary_consent, functional_consent, analytics_consent, experience_consent,
    marketing_consent, cross_site_consent, ip_address_hash, country_code,
    user_agent_hash, policy_version, consent_timestamp, withdrawn_at, expires_at
  ) VALUES (
    p_visitor_id,
    p_consent_version,
    p_consent_status,
    'cookie_banner',
    p_consent_method,
    true,
    COALESCE((p_preferences->>'functional_enabled')::boolean, false),
    v_analytics_enabled,
    COALESCE((p_preferences->>'experience_enabled')::boolean, false),
    COALESCE((p_preferences->>'marketing_enabled')::boolean, false),
    COALESCE((p_preferences->>'cross_site_enabled')::boolean, false),
    CASE WHEN v_analytics_enabled THEN p_ip_address_hash ELSE NULL END,
    CASE WHEN v_analytics_enabled THEN p_country_code ELSE NULL END,
    CASE WHEN v_analytics_enabled THEN p_user_agent_hash ELSE NULL END,
    p_consent_version,
    now(),
    CASE WHEN p_consent_status = 'withdrawn' THEN now() ELSE NULL END,
    now() + interval '180 days'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_first_party_page_view_enriched(
  p_visitor_id uuid,
  p_session_id uuid,
  p_page_view_id uuid,
  p_page_path text,
  p_referrer_origin text,
  p_country_code text,
  p_region_code text,
  p_city_name text,
  p_device_category text,
  p_browser_name text,
  p_browser_version text,
  p_operating_system text,
  p_operating_system_version text,
  p_language_code text,
  p_timezone text,
  p_consent_state text,
  p_consent_version text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows_inserted integer;
  v_is_new_session boolean;
BEGIN
  IF p_visitor_id IS NULL OR p_session_id IS NULL OR p_page_view_id IS NULL THEN
    RAISE EXCEPTION 'visitor, session and page-view identifiers are required';
  END IF;
  IF p_page_path IS NULL OR length(p_page_path) = 0 OR length(p_page_path) > 255 OR left(p_page_path, 1) <> '/' OR position('?' IN p_page_path) > 0 OR position('#' IN p_page_path) > 0 THEN
    RAISE EXCEPTION 'invalid page path';
  END IF;
  IF p_consent_state IS NULL OR p_consent_state NOT IN ('partial', 'all') THEN
    RAISE EXCEPTION 'analytics consent is required';
  END IF;
  IF p_consent_version IS NULL OR length(p_consent_version) > 64 THEN
    RAISE EXCEPTION 'invalid consent version';
  END IF;
  IF p_country_code IS NOT NULL AND p_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid country code';
  END IF;
  IF p_region_code IS NOT NULL AND length(p_region_code) > 16 THEN
    RAISE EXCEPTION 'invalid region code';
  END IF;
  IF p_city_name IS NOT NULL AND length(p_city_name) > 120 THEN
    RAISE EXCEPTION 'invalid city name';
  END IF;
  IF p_device_category IS NOT NULL AND p_device_category NOT IN ('mobile','tablet','desktop','bot','unknown') THEN
    RAISE EXCEPTION 'invalid device category';
  END IF;
  IF p_browser_name IS NOT NULL AND length(p_browser_name) > 64 THEN
    RAISE EXCEPTION 'invalid browser name';
  END IF;
  IF p_browser_version IS NOT NULL AND length(p_browser_version) > 32 THEN
    RAISE EXCEPTION 'invalid browser version';
  END IF;
  IF p_operating_system IS NOT NULL AND length(p_operating_system) > 64 THEN
    RAISE EXCEPTION 'invalid operating system';
  END IF;
  IF p_operating_system_version IS NOT NULL AND length(p_operating_system_version) > 32 THEN
    RAISE EXCEPTION 'invalid operating system version';
  END IF;
  IF p_language_code IS NOT NULL AND length(p_language_code) > 16 THEN
    RAISE EXCEPTION 'invalid language code';
  END IF;
  IF p_timezone IS NOT NULL AND length(p_timezone) > 64 THEN
    RAISE EXCEPTION 'invalid timezone';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anonymous_visitors
    WHERE visitor_id = p_visitor_id AND visitor_status IN ('deleted','excluded')
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.visitor_sessions
    WHERE session_id = p_session_id AND visitor_id <> p_visitor_id
  ) THEN
    RAISE EXCEPTION 'session does not belong to this visitor';
  END IF;

  v_is_new_session := NOT EXISTS (
    SELECT 1 FROM public.visitor_sessions WHERE session_id = p_session_id
  );

  IF v_is_new_session THEN
    UPDATE public.visitor_sessions
    SET session_ended_at = updated_at
    WHERE visitor_id = p_visitor_id
      AND session_ended_at IS NULL
      AND updated_at < now() - interval '30 minutes';
  END IF;

  INSERT INTO public.anonymous_visitors (
    visitor_id, first_seen_at, last_seen_at, initial_referrer,
    initial_landing_page, country_code, region_code, city_name,
    device_category, browser_name, browser_version, operating_system,
    operating_system_version, language_code, timezone, consent_status,
    visitor_status, expires_at
  ) VALUES (
    p_visitor_id, now(), now(), p_referrer_origin, p_page_path,
    p_country_code, p_region_code, p_city_name,
    p_device_category, p_browser_name, p_browser_version, p_operating_system,
    p_operating_system_version, p_language_code, p_timezone, p_consent_state,
    'active', now() + interval '180 days'
  )
  ON CONFLICT (visitor_id) DO UPDATE SET
    last_seen_at = now(),
    initial_referrer = COALESCE(public.anonymous_visitors.initial_referrer, EXCLUDED.initial_referrer),
    initial_landing_page = COALESCE(public.anonymous_visitors.initial_landing_page, EXCLUDED.initial_landing_page),
    country_code = COALESCE(EXCLUDED.country_code, public.anonymous_visitors.country_code),
    region_code = COALESCE(EXCLUDED.region_code, public.anonymous_visitors.region_code),
    city_name = COALESCE(EXCLUDED.city_name, public.anonymous_visitors.city_name),
    device_category = COALESCE(EXCLUDED.device_category, public.anonymous_visitors.device_category),
    browser_name = COALESCE(EXCLUDED.browser_name, public.anonymous_visitors.browser_name),
    browser_version = COALESCE(EXCLUDED.browser_version, public.anonymous_visitors.browser_version),
    operating_system = COALESCE(EXCLUDED.operating_system, public.anonymous_visitors.operating_system),
    operating_system_version = COALESCE(EXCLUDED.operating_system_version, public.anonymous_visitors.operating_system_version),
    language_code = COALESCE(EXCLUDED.language_code, public.anonymous_visitors.language_code),
    timezone = COALESCE(EXCLUDED.timezone, public.anonymous_visitors.timezone),
    consent_status = EXCLUDED.consent_status,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  INSERT INTO public.page_views (
    page_view_id, visitor_id, session_id, page_url, page_path,
    referrer_url, entry_page, viewed_at, device_category,
    browser_name, country_code
  ) VALUES (
    p_page_view_id, p_visitor_id, p_session_id, p_page_path, p_page_path,
    p_referrer_origin, CASE WHEN v_is_new_session THEN p_page_path ELSE NULL END,
    now(), p_device_category, p_browser_name, p_country_code
  )
  ON CONFLICT (page_view_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  IF v_rows_inserted = 0 THEN
    RETURN;
  END IF;

  UPDATE public.page_views AS previous_page
  SET exit_page = p_page_path
  WHERE previous_page.id = (
    SELECT p.id FROM public.page_views AS p
    WHERE p.visitor_id = p_visitor_id
      AND p.session_id = p_session_id
      AND p.page_view_id <> p_page_view_id
    ORDER BY p.viewed_at DESC, p.created_at DESC
    LIMIT 1
  );

  INSERT INTO public.visitor_sessions (
    session_id, visitor_id, session_started_at, landing_page, exit_page,
    referrer_url, page_view_count, event_count, consent_state,
    is_authenticated, device_category, browser_name, operating_system, country_code
  ) VALUES (
    p_session_id, p_visitor_id, now(), p_page_path, p_page_path,
    p_referrer_origin, 1, 1, p_consent_state,
    false, p_device_category, p_browser_name, p_operating_system, p_country_code
  )
  ON CONFLICT (session_id) DO UPDATE SET
    exit_page = EXCLUDED.exit_page,
    page_view_count = public.visitor_sessions.page_view_count + 1,
    event_count = public.visitor_sessions.event_count + 1,
    session_duration_seconds = GREATEST(
      public.visitor_sessions.session_duration_seconds,
      floor(extract(epoch FROM (now() - public.visitor_sessions.session_started_at)))::integer
    ),
    consent_state = EXCLUDED.consent_state,
    device_category = COALESCE(EXCLUDED.device_category, public.visitor_sessions.device_category),
    browser_name = COALESCE(EXCLUDED.browser_name, public.visitor_sessions.browser_name),
    operating_system = COALESCE(EXCLUDED.operating_system, public.visitor_sessions.operating_system),
    country_code = COALESCE(EXCLUDED.country_code, public.visitor_sessions.country_code),
    updated_at = now();

  INSERT INTO public.analytics_events (
    event_id, event_name, event_category, visitor_id, session_id,
    page_url, page_path, referrer_url, event_source, event_timestamp,
    event_properties, device_category, browser_name, operating_system,
    country_code, consent_category, consent_version, is_anonymized
  ) VALUES (
    p_page_view_id, 'page_view', 'navigation', p_visitor_id, p_session_id,
    p_page_path, p_page_path, p_referrer_origin, 'first_party', now(),
    '{}'::jsonb, p_device_category, p_browser_name, p_operating_system,
    p_country_code, 'analytics', p_consent_version, true
  )
  ON CONFLICT (event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cookie_consent_with_metadata(uuid,text,text,text,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_first_party_page_view_enriched(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cookie_consent_with_metadata(uuid,text,text,text,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_first_party_page_view_enriched(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;
