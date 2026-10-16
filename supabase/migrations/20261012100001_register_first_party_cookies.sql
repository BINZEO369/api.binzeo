-- Register only cookies created by the first-party consent/analytics implementation.
-- Supabase authentication cookie names are intentionally not guessed here.
INSERT INTO public.cookie_registry (
  cookie_name, provider_name, category, purpose, description, data_collected,
  cookie_domain, cookie_path, cookie_type, first_party_or_third_party,
  expiration_duration, session_based, consent_required, legal_basis,
  privacy_policy_url, provider_policy_url, website_id, is_active,
  is_essential, last_audited_at
) VALUES
  (
    'binzeo_consent',
    'BINZEO',
    'necessary',
    'Remember the visitor cookie choices and consent version',
    'Host-only HttpOnly cookie containing the selected consent categories, consent version, saved time, action, and a random consent reference UUID. The UUID is used for analytics only when analytics consent is enabled.',
    jsonb_build_array('consent category choices', 'consent version', 'consent timestamp', 'random consent reference UUID'),
    NULL,
    '/',
    'persistent_http_only',
    'first_party',
    '180 days',
    false,
    false,
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    true,
    now()
  ),
  (
    'binzeo_session_id',
    'BINZEO',
    'analytics',
    'Group opted-in first-party page views into a short-lived session',
    'Host-only HttpOnly random session UUID. Created and refreshed only after analytics consent; expires after 30 minutes of inactivity.',
    jsonb_build_array('random session UUID'),
    NULL,
    '/',
    'session_http_only',
    'first_party',
    '30 minutes rolling',
    true,
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    false,
    now()
  )
ON CONFLICT DO NOTHING;
