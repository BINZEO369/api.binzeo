-- Cross-project account usage audit for the Central BINZEO identity database.
-- This records where a Central account is used; it never stores passwords or tokens.

CREATE TABLE IF NOT EXISTS public.user_project_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.platform_projects(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.platform_clients(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('linked', 'login_started', 'token_issued', 'token_verified', 'access_denied', 'logout', 'profile_synced')),
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failed', 'denied')),
  ip_address inet,
  country text,
  region text,
  city text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  location_accuracy_meters numeric(10,2),
  location_source text,
  device_id text,
  device_name text,
  device_type text,
  operating_system text,
  os_version text,
  browser text,
  browser_version text,
  user_agent text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_project_access_events_user_time_idx
  ON public.user_project_access_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS user_project_access_events_project_time_idx
  ON public.user_project_access_events(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS user_project_access_events_client_time_idx
  ON public.user_project_access_events(client_id, occurred_at DESC)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_project_access_events_ip_idx
  ON public.user_project_access_events(ip_address)
  WHERE ip_address IS NOT NULL;

ALTER TABLE public.user_project_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_project_access_events FROM anon;
GRANT SELECT ON TABLE public.user_project_access_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_project_access_events TO service_role;

DROP POLICY IF EXISTS user_project_access_events_self_read ON public.user_project_access_events;
CREATE POLICY user_project_access_events_self_read
  ON public.user_project_access_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_project_access_events_service_role ON public.user_project_access_events;
CREATE POLICY user_project_access_events_service_role
  ON public.user_project_access_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.user_project_access_events IS 'Audit trail of Central BINZEO account usage across registered projects and clients. Passwords, access tokens and refresh tokens are never stored.';
COMMENT ON COLUMN public.user_project_access_events.metadata IS 'Non-secret project event metadata only; never store passwords, access tokens, refresh tokens or OTP values.';

DO $$
DECLARE
  v_project uuid;
BEGIN
  INSERT INTO public.platform_projects
    (project_key, project_name, brand_name, project_type, status, database_ref, features, metadata)
  VALUES
    ('jabiyen', 'JABIYEN Fashion Platform', 'JABIYEN', 'brand', 'planned', 'jabiyen', ARRAY['identity', 'catalog', 'commerce'], '{"identity_source":"binzeo-central","registration":"central-only"}'::jsonb)
  ON CONFLICT (project_key) DO UPDATE SET
    project_name = EXCLUDED.project_name,
    brand_name = EXCLUDED.brand_name,
    database_ref = EXCLUDED.database_ref,
    features = EXCLUDED.features,
    metadata = EXCLUDED.metadata;

  SELECT id INTO v_project FROM public.platform_projects WHERE project_key = 'jabiyen';

  INSERT INTO public.platform_clients
    (project_id, client_key, client_name, client_type, status, allowed_origins, scopes, public_config)
  VALUES
    (v_project, 'website', 'JABIYEN Website', 'frontend', 'planned', '{}', ARRAY['identity', 'profile', 'commerce'], '{"registration":"disabled","auth_source":"binzeo-central"}'::jsonb),
    (v_project, 'admin', 'JABIYEN Admin', 'admin', 'planned', '{}', ARRAY['administration', 'catalog', 'commerce'], '{"registration":"disabled","auth_source":"binzeo-central"}'::jsonb)
  ON CONFLICT (project_id, client_key) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    client_type = EXCLUDED.client_type,
    scopes = EXCLUDED.scopes,
    public_config = EXCLUDED.public_config;
END $$;
