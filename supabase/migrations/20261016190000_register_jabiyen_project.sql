-- Register JABIYEN as a bounded Central Platform project.
-- Provider secrets remain in the Central API environment; this migration stores references only.
DO $$
DECLARE
  v_project uuid;
  v_website uuid;
  v_admin uuid;
BEGIN
  INSERT INTO public.platform_projects (
    project_key, project_name, brand_name, project_type, status,
    database_ref, allowed_origins, features
  ) VALUES (
    'jabiyen',
    'JABIYEN Commerce',
    'JABIYEN',
    'brand',
    'active',
    'jabiyen',
    ARRAY['https://www.jayenware.shop', 'https://jayenware.shop'],
    ARRAY['catalog', 'commerce', 'content', 'customer-profile']
  )
  ON CONFLICT (project_key) DO UPDATE SET
    project_name = EXCLUDED.project_name,
    brand_name = EXCLUDED.brand_name,
    status = EXCLUDED.status,
    database_ref = EXCLUDED.database_ref,
    allowed_origins = EXCLUDED.allowed_origins,
    features = EXCLUDED.features
  RETURNING id INTO v_project;

  IF v_project IS NULL THEN
    SELECT id INTO v_project FROM public.platform_projects WHERE project_key = 'jabiyen';
  END IF;

  INSERT INTO public.platform_clients (
    project_id, client_key, client_name, client_type, status,
    allowed_origins, scopes, public_config
  ) VALUES (
    v_project,
    'website',
    'JABIYEN Website',
    'frontend',
    'active',
    ARRAY['https://www.jayenware.shop', 'https://jayenware.shop'],
    ARRAY['catalog', 'profile', 'customer'],
    '{"route_prefix":"/v1/projects/jabiyen/public"}'::jsonb
  )
  ON CONFLICT (project_id, client_key) DO UPDATE SET
    status = EXCLUDED.status,
    allowed_origins = EXCLUDED.allowed_origins,
    scopes = EXCLUDED.scopes,
    public_config = EXCLUDED.public_config
  RETURNING id INTO v_website;

  IF v_website IS NULL THEN
    SELECT id INTO v_website FROM public.platform_clients WHERE project_id = v_project AND client_key = 'website';
  END IF;

  INSERT INTO public.platform_clients (
    project_id, client_key, client_name, client_type, status,
    allowed_origins, scopes, public_config
  ) VALUES (
    v_project,
    'admin',
    'JABIYEN Admin',
    'admin',
    'active',
    ARRAY['https://admin.jayenware.shop'],
    ARRAY['catalog', 'content', 'commerce'],
    '{"route_prefix":"/v1/projects/jabiyen/admin"}'::jsonb
  )
  ON CONFLICT (project_id, client_key) DO UPDATE SET
    status = EXCLUDED.status,
    allowed_origins = EXCLUDED.allowed_origins,
    scopes = EXCLUDED.scopes,
    public_config = EXCLUDED.public_config
  RETURNING id INTO v_admin;

  IF v_admin IS NULL THEN
    SELECT id INTO v_admin FROM public.platform_clients WHERE project_id = v_project AND client_key = 'admin';
  END IF;

  INSERT INTO public.platform_provider_connections (
    project_id, client_id, provider, connection_key, status,
    secret_env_var, scopes
  ) VALUES
    (v_project, v_website, 'smtp', 'central-email', 'active', 'SMTP_PASS', ARRAY['transactional', 'marketing']),
    (v_project, v_admin, 'smtp', 'central-email', 'active', 'SMTP_PASS', ARRAY['transactional', 'marketing'])
  ON CONFLICT (project_id, client_id, provider, connection_key) DO UPDATE SET
    status = EXCLUDED.status,
    secret_env_var = EXCLUDED.secret_env_var,
    scopes = EXCLUDED.scopes;
END $$;
