-- JABIYEN uses only its official Vercel domain for Central Auth SSO.
-- The jayenware.shop domains are not owned by this application and must not be trusted.
UPDATE public.platform_projects
SET
  status = 'active',
  allowed_origins = ARRAY['https://jabiyen-website.vercel.app'],
  updated_at = now()
WHERE project_key = 'jabiyen';

UPDATE public.platform_clients AS client
SET
  status = 'active',
  allowed_origins = ARRAY['https://jabiyen-website.vercel.app'],
  redirect_uris = ARRAY['https://jabiyen-website.vercel.app/auth/callback'],
  updated_at = now()
FROM public.platform_projects AS project
WHERE client.project_id = project.id
  AND project.project_key = 'jabiyen'
  AND client.client_key = 'website';
