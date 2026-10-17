-- Enable the existing Central SSO authorization-code table for registered clients.
-- Secrets and sessions remain server-only; codes are short-lived, one-time and PKCE-bound.
ALTER TABLE public.api_authorization_codes
  DROP CONSTRAINT IF EXISTS api_authorization_codes_client_id_check;

ALTER TABLE public.api_authorization_codes
  ADD CONSTRAINT api_authorization_codes_client_id_check
  CHECK (client_id IN ('admin', 'jabiyen'));
