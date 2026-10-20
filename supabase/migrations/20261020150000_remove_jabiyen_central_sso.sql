-- Remove only the JABIYEN Website Central Auth connection.
-- The JABIYEN commerce project, database, catalog and admin client remain intact.
DELETE FROM public.api_authorization_codes
WHERE client_id = 'jabiyen'
   OR redirect_uri = 'https://jabiyen-website.vercel.app/auth/callback';

DELETE FROM public.platform_clients AS client
USING public.platform_projects AS project
WHERE client.project_id = project.id
  AND project.project_key = 'jabiyen'
  AND client.client_key = 'website';

ALTER TABLE public.api_authorization_codes
  DROP CONSTRAINT IF EXISTS api_authorization_codes_client_id_check;

ALTER TABLE public.api_authorization_codes
  ADD CONSTRAINT api_authorization_codes_client_id_check
  CHECK (
    client_id = 'admin'
    OR client_id ~ '^[a-z0-9][a-z0-9-]{0,62}:[a-z0-9][a-z0-9-]{0,62}$'
  );
