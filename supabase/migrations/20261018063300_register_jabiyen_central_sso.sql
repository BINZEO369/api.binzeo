-- Register the JABIYEN Website as a Central Auth PKCE client.
-- The browser receives only a short-lived, single-use authorization code;
-- session tokens remain encrypted in the existing server-only code table.
-- Keep project-scoped client IDs valid after the preceding legacy SSO migration.
ALTER TABLE public.api_authorization_codes
  DROP CONSTRAINT IF EXISTS api_authorization_codes_client_id_check;

ALTER TABLE public.api_authorization_codes
  ADD CONSTRAINT api_authorization_codes_client_id_check
  CHECK (
    client_id IN ('admin', 'jabiyen')
    OR client_id ~ '^[a-z0-9][a-z0-9-]{0,62}:[a-z0-9][a-z0-9-]{0,62}$'
  );

UPDATE public.platform_projects AS project
SET allowed_origins = ARRAY[
      'https://jabiyen-website.vercel.app',
      'https://jabiyen-admin.vercel.app'
    ],
    updated_at = now()
WHERE project.project_key = 'jabiyen';

UPDATE public.platform_clients AS client
SET allowed_origins = ARRAY['https://jabiyen-website.vercel.app'],
    redirect_uris = ARRAY['https://jabiyen-website.vercel.app/auth/callback'],
    updated_at = now()
FROM public.platform_projects AS project
WHERE client.project_id = project.id
  AND project.project_key = 'jabiyen'
  AND client.client_key = 'website';
