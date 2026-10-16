-- Central platform registry for future products, frontends, admin consoles and provider connections.
-- Secrets are never stored here. Only server-side environment-variable references are stored.

CREATE TABLE IF NOT EXISTS public.platform_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text NOT NULL UNIQUE CHECK (project_key = lower(project_key) AND project_key ~ '^[a-z0-9][a-z0-9-]*$'),
  project_name text NOT NULL,
  brand_name text NOT NULL,
  project_type text NOT NULL CHECK (project_type IN ('platform', 'brand', 'product', 'internal')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'suspended', 'archived')),
  database_ref text NOT NULL DEFAULT 'auth' CHECK (database_ref = lower(database_ref)),
  allowed_origins text[] NOT NULL DEFAULT '{}',
  features text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.platform_projects(id) ON DELETE CASCADE,
  client_key text NOT NULL CHECK (client_key = lower(client_key) AND client_key ~ '^[a-z0-9][a-z0-9-]*$'),
  client_name text NOT NULL,
  client_type text NOT NULL CHECK (client_type IN ('frontend', 'admin', 'mobile', 'service', 'integration')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'suspended', 'archived')),
  allowed_origins text[] NOT NULL DEFAULT '{}',
  redirect_uris text[] NOT NULL DEFAULT '{}',
  scopes text[] NOT NULL DEFAULT '{}',
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, client_key)
);

CREATE TABLE IF NOT EXISTS public.platform_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.platform_projects(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.platform_clients(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'facebook', 'apple', 'smtp', 'imagekit', 'cloudinary', 'custom')),
  connection_key text NOT NULL CHECK (connection_key = lower(connection_key) AND connection_key ~ '^[a-z0-9][a-z0-9-]*$'),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'disabled')),
  public_client_id_env text,
  secret_env_var text,
  redirect_uri_env text,
  scopes text[] NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, client_id, provider, connection_key)
);

CREATE TABLE IF NOT EXISTS public.platform_project_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.platform_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.platform_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS platform_clients_project_idx ON public.platform_clients(project_id);
CREATE INDEX IF NOT EXISTS platform_provider_connections_project_idx ON public.platform_provider_connections(project_id);
CREATE INDEX IF NOT EXISTS platform_project_access_user_idx ON public.platform_project_access(user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS websites_project_idx ON public.websites(project_id) WHERE project_id IS NOT NULL;

DROP TRIGGER IF EXISTS platform_projects_set_updated_at ON public.platform_projects;
CREATE TRIGGER platform_projects_set_updated_at BEFORE UPDATE ON public.platform_projects
FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();

DROP TRIGGER IF EXISTS platform_clients_set_updated_at ON public.platform_clients;
CREATE TRIGGER platform_clients_set_updated_at BEFORE UPDATE ON public.platform_clients
FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();

DROP TRIGGER IF EXISTS platform_provider_connections_set_updated_at ON public.platform_provider_connections;
CREATE TRIGGER platform_provider_connections_set_updated_at BEFORE UPDATE ON public.platform_provider_connections
FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();

DROP TRIGGER IF EXISTS platform_project_access_set_updated_at ON public.platform_project_access;
CREATE TRIGGER platform_project_access_set_updated_at BEFORE UPDATE ON public.platform_project_access
FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();

ALTER TABLE public.platform_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_project_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_projects, public.platform_clients, public.platform_provider_connections, public.platform_project_access FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_projects, public.platform_clients, public.platform_provider_connections, public.platform_project_access TO service_role;

DROP POLICY IF EXISTS platform_projects_service_role ON public.platform_projects;
CREATE POLICY platform_projects_service_role ON public.platform_projects FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS platform_clients_service_role ON public.platform_clients;
CREATE POLICY platform_clients_service_role ON public.platform_clients FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS platform_provider_connections_service_role ON public.platform_provider_connections;
CREATE POLICY platform_provider_connections_service_role ON public.platform_provider_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS platform_project_access_service_role ON public.platform_project_access;
CREATE POLICY platform_project_access_service_role ON public.platform_project_access FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.platform_projects IS 'Central registry of brands/products sharing the platform. Provider secrets are never stored here.';
COMMENT ON TABLE public.platform_clients IS 'Frontend, admin, mobile and integration clients belonging to a platform project.';
COMMENT ON TABLE public.platform_provider_connections IS 'Provider metadata and secret environment-variable references; values remain in the Central API secret environment.';
COMMENT ON TABLE public.platform_project_access IS 'Project-scoped admin roles and permissions for multi-brand administration.';
COMMENT ON COLUMN public.platform_provider_connections.secret_env_var IS 'Name of the server-only secret environment variable, never the secret value.';

DO $$
DECLARE
  v_binzeo uuid;
  v_auth uuid;
  v_admin uuid;
BEGIN
  INSERT INTO public.platform_projects (project_key, project_name, brand_name, project_type, status, database_ref, allowed_origins, features)
  VALUES ('binzeo', 'BINZEO Platform', 'BINZEO', 'platform', 'active', 'auth',
    ARRAY['https://auth-binzeo.vercel.app', 'https://admin-binzeo.vercel.app'],
    ARRAY['identity', 'administration', 'privacy', 'analytics'])
  ON CONFLICT (project_key) DO UPDATE SET
    project_name = EXCLUDED.project_name,
    brand_name = EXCLUDED.brand_name,
    status = EXCLUDED.status,
    database_ref = EXCLUDED.database_ref,
    allowed_origins = EXCLUDED.allowed_origins,
    features = EXCLUDED.features
  RETURNING id INTO v_binzeo;

  IF v_binzeo IS NULL THEN
    SELECT id INTO v_binzeo FROM public.platform_projects WHERE project_key = 'binzeo';
  END IF;

  INSERT INTO public.platform_clients (project_id, client_key, client_name, client_type, status, allowed_origins, scopes, public_config)
  VALUES (v_binzeo, 'auth', 'BINZEO Identity', 'frontend', 'active', ARRAY['https://auth-binzeo.vercel.app'], ARRAY['identity', 'profile', 'security'], '{"route_prefix":"/v1"}'::jsonb)
  ON CONFLICT (project_id, client_key) DO UPDATE SET status = EXCLUDED.status, allowed_origins = EXCLUDED.allowed_origins, scopes = EXCLUDED.scopes;
  SELECT id INTO v_auth FROM public.platform_clients WHERE project_id = v_binzeo AND client_key = 'auth';

  INSERT INTO public.platform_clients (project_id, client_key, client_name, client_type, status, allowed_origins, scopes, public_config)
  VALUES (v_binzeo, 'admin', 'BINZEO Admin', 'admin', 'active', ARRAY['https://admin-binzeo.vercel.app'], ARRAY['administration', 'audit', 'privacy'], '{"route_prefix":"/v1"}'::jsonb)
  ON CONFLICT (project_id, client_key) DO UPDATE SET status = EXCLUDED.status, allowed_origins = EXCLUDED.allowed_origins, scopes = EXCLUDED.scopes;
  SELECT id INTO v_admin FROM public.platform_clients WHERE project_id = v_binzeo AND client_key = 'admin';

  INSERT INTO public.platform_provider_connections (project_id, client_id, provider, connection_key, status, public_client_id_env, secret_env_var, redirect_uri_env, scopes)
  VALUES
    (v_binzeo, v_auth, 'google', 'auth-google', 'active', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', ARRAY['openid', 'email', 'profile']),
    (v_binzeo, v_auth, 'facebook', 'auth-facebook', 'planned', 'FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET', 'FACEBOOK_REDIRECT_URI', ARRAY['email', 'public_profile'])
  ON CONFLICT (project_id, client_id, provider, connection_key) DO UPDATE SET
    status = EXCLUDED.status,
    public_client_id_env = EXCLUDED.public_client_id_env,
    secret_env_var = EXCLUDED.secret_env_var,
    redirect_uri_env = EXCLUDED.redirect_uri_env,
    scopes = EXCLUDED.scopes;
END $$;
