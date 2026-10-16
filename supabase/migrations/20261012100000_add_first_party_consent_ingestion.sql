-- Durable first-party consent and analytics ingestion for BINZEO.
-- Visitor identifiers are random UUIDs; raw IP addresses, raw user agents, URL query strings,
-- form contents, and account IDs are deliberately not stored by these functions.

CREATE UNIQUE INDEX IF NOT EXISTS anonymous_visitors_visitor_id_uq
  ON public.anonymous_visitors (visitor_id);

CREATE UNIQUE INDEX IF NOT EXISTS consent_preferences_visitor_id_uq
  ON public.consent_preferences (visitor_id);

CREATE OR REPLACE FUNCTION public.record_cookie_consent(
  p_visitor_id uuid,
  p_consent_version text,
  p_consent_status text,
  p_consent_method text,
  p_preferences jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN
    RAISE EXCEPTION 'preferences must be a JSON object';
  END IF;
  IF COALESCE((p_preferences->>'necessary_enabled')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'necessary cookies must remain enabled';
  END IF;
  IF p_consent_status IS NULL OR p_consent_status NOT IN ('accepted', 'rejected', 'partial', 'withdrawn', 'unset') THEN
    RAISE EXCEPTION 'invalid consent status';
  END IF;
  IF p_consent_version IS NULL OR length(p_consent_version) > 64 THEN
    RAISE EXCEPTION 'invalid consent version';
  END IF;

  INSERT INTO public.consent_preferences (
    visitor_id, necessary_enabled, functional_enabled, analytics_enabled,
    experience_enabled, marketing_enabled, cross_site_enabled,
    custom_preferences, consent_version, last_action, last_updated_at
  ) VALUES (
    p_visitor_id,
    (p_preferences->>'necessary_enabled')::boolean,
    COALESCE((p_preferences->>'functional_enabled')::boolean, false),
    COALESCE((p_preferences->>'analytics_enabled')::boolean, false),
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
    marketing_consent, cross_site_consent, policy_version, consent_timestamp,
    withdrawn_at, expires_at
  ) VALUES (
    p_visitor_id,
    p_consent_version,
    p_consent_status,
    'cookie_banner',
    p_consent_method,
    (p_preferences->>'necessary_enabled')::boolean,
    COALESCE((p_preferences->>'functional_enabled')::boolean, false),
    COALESCE((p_preferences->>'analytics_enabled')::boolean, false),
    COALESCE((p_preferences->>'experience_enabled')::boolean, false),
    COALESCE((p_preferences->>'marketing_enabled')::boolean, false),
    COALESCE((p_preferences->>'cross_site_enabled')::boolean, false),
    p_consent_version,
    now(),
    CASE WHEN p_consent_status = 'withdrawn' THEN now() ELSE NULL END,
    now() + interval '180 days'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_first_party_page_view(
  p_visitor_id uuid,
  p_session_id uuid,
  p_page_view_id uuid,
  p_page_path text,
  p_referrer_origin text,
  p_language_code text,
  p_consent_state text,
  p_consent_version text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows_inserted integer;
BEGIN
  IF p_page_path IS NULL OR length(p_page_path) = 0 OR length(p_page_path) > 255 OR left(p_page_path, 1) <> '/' OR position('?' IN p_page_path) > 0 OR position('#' IN p_page_path) > 0 THEN
    RAISE EXCEPTION 'invalid page path';
  END IF;
  IF p_consent_state IS NULL OR p_consent_state NOT IN ('partial', 'all') THEN
    RAISE EXCEPTION 'analytics consent is required';
  END IF;
  IF p_consent_version IS NULL OR length(p_consent_version) > 64 THEN
    RAISE EXCEPTION 'invalid consent version';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anonymous_visitors
    WHERE visitor_id = p_visitor_id AND visitor_status = 'deleted'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.anonymous_visitors (
    visitor_id, first_seen_at, last_seen_at, initial_referrer,
    initial_landing_page, language_code, consent_status, visitor_status, expires_at
  ) VALUES (
    p_visitor_id, now(), now(), p_referrer_origin,
    p_page_path, p_language_code, p_consent_state, 'active', now() + interval '180 days'
  )
  ON CONFLICT (visitor_id) DO UPDATE SET
    last_seen_at = now(),
    language_code = COALESCE(EXCLUDED.language_code, public.anonymous_visitors.language_code),
    consent_status = EXCLUDED.consent_status,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  INSERT INTO public.page_views (
    page_view_id, visitor_id, session_id, page_url, page_path,
    referrer_url, entry_page, viewed_at
  ) VALUES (
    p_page_view_id, p_visitor_id, p_session_id, p_page_path, p_page_path,
    p_referrer_origin, NULL, now()
  )
  ON CONFLICT (page_view_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  IF v_rows_inserted = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.visitor_sessions (
    session_id, visitor_id, session_started_at, landing_page, referrer_url,
    page_view_count, event_count, consent_state, is_authenticated
  ) VALUES (
    p_session_id, p_visitor_id, now(), p_page_path, p_referrer_origin,
    1, 1, p_consent_state, false
  )
  ON CONFLICT (session_id) DO UPDATE SET
    page_view_count = public.visitor_sessions.page_view_count + 1,
    event_count = public.visitor_sessions.event_count + 1,
    session_duration_seconds = GREATEST(
      public.visitor_sessions.session_duration_seconds,
      floor(extract(epoch FROM (now() - public.visitor_sessions.session_started_at)))::integer
    ),
    consent_state = EXCLUDED.consent_state,
    updated_at = now();

  INSERT INTO public.analytics_events (
    event_id, event_name, event_category, visitor_id, session_id,
    page_url, page_path, event_source, event_timestamp, event_properties,
    consent_category, consent_version, is_anonymized
  ) VALUES (
    p_page_view_id, 'page_view', 'navigation', p_visitor_id, p_session_id,
    p_page_path, p_page_path, 'first_party', now(), '{}'::jsonb,
    'analytics', p_consent_version, true
  )
  ON CONFLICT (event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cookie_consent(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_first_party_page_view(uuid, uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cookie_consent(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_first_party_page_view(uuid, uuid, uuid, text, text, text, text, text) TO service_role;
