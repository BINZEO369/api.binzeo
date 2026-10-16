-- Production security hardening.
-- This migration is intentionally reversible by restoring only the grants
-- required by the application; it does not delete user data.

-- Pending-account cleanup is a maintenance operation, never a public RPC.
create or replace function public.cleanup_expired_pending_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  deleted_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_admin(auth.uid()) then
    raise exception 'maintenance_access_required' using errcode = '42501';
  end if;

  delete from public.user_activity_logs as l
  using public.profiles as p
  where l.user_id = p.id
    and p.account_status = 'pending'
    and p.created_at <= now() - interval '2 minutes'
    and (p.username is null or p.date_of_birth is null or p.terms_accepted = false
      or p.privacy_accepted = false or p.location_consent = false
      or not exists (select 1 from public.user_verification_records as r
                     where r.user_id = p.id and r.verification_type = 'email'
                       and r.verification_status = 'verified'));

  delete from public.user_login_history as l
  using public.profiles as p
  where l.user_id = p.id
    and p.account_status = 'pending'
    and p.created_at <= now() - interval '2 minutes'
    and (p.username is null or p.date_of_birth is null or p.terms_accepted = false
      or p.privacy_accepted = false or p.location_consent = false
      or not exists (select 1 from public.user_verification_records as r
                     where r.user_id = p.id and r.verification_type = 'email'
                       and r.verification_status = 'verified'));

  delete from public.admin_activity_logs as l
  using public.profiles as p
  where l.admin_user_id = p.id
    and p.account_status = 'pending'
    and p.created_at <= now() - interval '2 minutes'
    and (p.username is null or p.date_of_birth is null or p.terms_accepted = false
      or p.privacy_accepted = false or p.location_consent = false
      or not exists (select 1 from public.user_verification_records as r
                     where r.user_id = p.id and r.verification_type = 'email'
                       and r.verification_status = 'verified'));

  delete from auth.users as au
  where exists (
    select 1 from public.profiles as p
    where p.id = au.id and p.account_status = 'pending'
      and p.created_at <= now() - interval '2 minutes'
      and (p.username is null or p.date_of_birth is null or p.terms_accepted = false
        or p.privacy_accepted = false or p.location_consent = false
        or not exists (select 1 from public.user_verification_records as r
                       where r.user_id = p.id and r.verification_type = 'email'
                         and r.verification_status = 'verified'))
  )
  or (coalesce(au.raw_user_meta_data ->> 'signup_flow', '') = 'google_pending'
      and au.created_at <= now() - interval '2 minutes'
      and not exists (select 1 from public.profiles as p
                      where p.id = au.id and p.account_status = 'active'));

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_pending_accounts() from public;
grant execute on function public.cleanup_expired_pending_accounts() to service_role;

-- Anon clients must never have direct table access to security material.
revoke all on table public.admin_access from anon;
revoke all on table public.login_attempt_limits from anon;
revoke all on table public.login_limit_exceeded from anon;
revoke all on table public.password_reset_challenges from anon;
revoke all on table public.password_change_events from anon;
revoke all on table public.two_factor_challenges from anon;
revoke all on table public.two_factor_authentication_events from anon;
revoke all on table public.temporary_login_tokens from anon;
revoke all on table public.user_passkeys from anon;

-- Remove dangerous schema privileges from authenticated clients while
-- preserving the CRUD operations used by the owner-scoped API policies.
revoke references, trigger, truncate on table public.admin_access from authenticated;
revoke references, trigger, truncate on table public.profiles from authenticated;
revoke references, trigger, truncate on table public.user_contacts from authenticated;
revoke references, trigger, truncate on table public.user_addresses from authenticated;
revoke references, trigger, truncate on table public.user_activity_logs from authenticated;
revoke references, trigger, truncate on table public.user_login_history from authenticated;
revoke references, trigger, truncate on table public.user_passkeys from authenticated;
revoke references, trigger, truncate on table public.temporary_login_tokens from authenticated;
revoke references, trigger, truncate on table public.login_attempt_limits from authenticated;
revoke references, trigger, truncate on table public.login_limit_exceeded from authenticated;
revoke references, trigger, truncate on table public.password_reset_challenges from authenticated;
revoke references, trigger, truncate on table public.password_change_events from authenticated;
revoke references, trigger, truncate on table public.two_factor_challenges from authenticated;
revoke references, trigger, truncate on table public.two_factor_authentication_events from authenticated;

-- These challenge/delivery tables have no client-facing policy and should be
-- reachable only through locked-down service-role RPCs.
revoke all on table public.password_reset_challenges from authenticated;
revoke all on table public.password_change_events from authenticated;
revoke all on table public.two_factor_challenges from authenticated;
revoke all on table public.two_factor_authentication_events from authenticated;

-- Distributed, serverless-safe request rate limiting. The bucket key is a
-- one-way hash generated by middleware; clients never receive table access.
create table if not exists public.api_rate_limit_buckets (
  bucket_key text primary key check (length(bucket_key) between 32 and 128),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.api_rate_limit_buckets enable row level security;
alter table public.api_rate_limit_buckets force row level security;
revoke all on table public.api_rate_limit_buckets from anon, authenticated, public;

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  bucket public.api_rate_limit_buckets;
  elapsed_seconds integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 32
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = '22023';
  end if;

  insert into public.api_rate_limit_buckets(bucket_key, window_started_at, request_count, updated_at)
  values (p_bucket_key, now(), 1, now())
  on conflict (bucket_key) do nothing;

  select * into bucket
  from public.api_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  elapsed_seconds := floor(extract(epoch from (now() - bucket.window_started_at)))::integer;
  if elapsed_seconds >= p_window_seconds then
    update public.api_rate_limit_buckets
    set window_started_at = now(), request_count = 1, updated_at = now()
    where bucket_key = p_bucket_key
    returning * into bucket;
  elsif bucket.request_count < p_limit then
    update public.api_rate_limit_buckets
    set request_count = request_count + 1, updated_at = now()
    where bucket_key = p_bucket_key
    returning * into bucket;
  end if;

  return query select
    bucket.request_count <= p_limit,
    greatest(0, p_window_seconds - floor(extract(epoch from (now() - bucket.window_started_at)))::integer),
    greatest(0, p_limit - bucket.request_count);
end;
$$;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to anon, authenticated;

-- Final explicit revocations: PUBLIC does not remove role-specific grants.
revoke execute on function public.cleanup_expired_pending_accounts() from anon, authenticated;

-- Private policy helpers are not public API. Keep only the role needed by
-- authenticated policy evaluation and trusted server execution.
revoke all on function private.has_admin_permission(uuid, text) from public, anon;
revoke all on function private.is_admin(uuid) from public, anon;
grant execute on function private.has_admin_permission(uuid, text) to authenticated, service_role;
grant execute on function private.is_admin(uuid) to authenticated, service_role;

-- Trigger-only functions must not be callable through PostgREST.
revoke all on function public.assign_profile_binzeo_user_id() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.promote_profile_id_for_admin() from public, anon, authenticated;
revoke all on function public.sync_user_auth_method() from public, anon, authenticated;
revoke all on function public.sync_user_verification_records() from public, anon, authenticated;

-- Security settings and verification state are server/RPC controlled.
revoke all on table public.user_two_factor_settings from anon, authenticated;
revoke all on table public.user_verification_records from anon;
revoke insert, update, delete, references, trigger, truncate on table public.user_verification_records from authenticated;

-- Admin audit data is never writable by anonymous clients.
revoke all on table public.admin_activity_logs from anon;
revoke delete, update, references, trigger, truncate on table public.admin_activity_logs from authenticated;
