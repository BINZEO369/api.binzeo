-- Ensure the Central Auth PKCE code store exists in the shared identity database.
CREATE TABLE IF NOT EXISTS public.api_authorization_codes (
  code_hash text PRIMARY KEY CHECK (length(code_hash) = 64),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (
    client_id = 'admin'
    OR client_id = 'jabiyen'
    OR client_id ~ '^[a-z0-9][a-z0-9-]{0,62}:[a-z0-9][a-z0-9-]{0,62}$'
  ),
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  session_ciphertext text NOT NULL,
  session_iv text NOT NULL CHECK (length(session_iv) BETWEEN 16 AND 32),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_authorization_codes_expiry_idx
  ON public.api_authorization_codes (expires_at)
  WHERE consumed_at IS NULL;
ALTER TABLE public.api_authorization_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_authorization_codes FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_authorization_codes TO service_role;
