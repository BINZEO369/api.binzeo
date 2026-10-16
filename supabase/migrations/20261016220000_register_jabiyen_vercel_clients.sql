-- Correct the Central Auth registry for the actual JABIYEN Vercel deployments.
-- This file only prepares the database change; it is not applied automatically.
-- Do not reintroduce the unrelated jayenware.shop domains here.
DO $$
DECLARE
  v_project uuid;
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
    ARRAY['https://jabiyen-website.vercel.app', 'https://jabiyen-admin.vercel.app'],
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
  ) VALUES
    (
      v_project,
      'website',
      'JABIYEN Website',
      'frontend',
      'active',
      ARRAY['https://jabiyen-website.vercel.app'],
      ARRAY['catalog', 'profile', 'customer'],
      '{"route_prefix":"/v1/projects/jabiyen/public"}'::jsonb
    ),
    (
      v_project,
      'admin',
      'JABIYEN Admin',
      'admin',
      'active',
      ARRAY['https://jabiyen-admin.vercel.app'],
      ARRAY['catalog', 'content', 'commerce'],
      '{"route_prefix":"/v1/projects/jabiyen/admin"}'::jsonb
    )
  ON CONFLICT (project_id, client_key) DO UPDATE SET
    client_name = EXCLUDED.client_name,
    client_type = EXCLUDED.client_type,
    status = EXCLUDED.status,
    allowed_origins = EXCLUDED.allowed_origins,
    scopes = EXCLUDED.scopes,
    public_config = EXCLUDED.public_config;
END $$;
