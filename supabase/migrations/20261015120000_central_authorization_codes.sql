-- Central BINZEO SSO: one-time PKCE authorization codes.
-- Review/apply manually to the shared identity Supabase project before enabling SSO.
-- The API stores only a SHA-256 code hash and AES-GCM-encrypted session tokens.

create table if not exists public.api_authorization_codes (
  code_hash text primary key check (length(code_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (client_id = 'admin'),
  redirect_uri text not null,
  code_challenge text not null check (length(code_challenge) between 43 and 128),
  session_ciphertext text not null,
  session_iv text not null check (length(session_iv) between 16 and 32),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_authorization_codes_expiry_idx
  on public.api_authorization_codes (expires_at)
  where consumed_at is null;

alter table public.api_authorization_codes enable row level security;
revoke all on table public.api_authorization_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.api_authorization_codes to service_role;

comment on table public.api_authorization_codes is
  'Short-lived central SSO authorization codes; code hashes and encrypted session tokens are server-only.';
