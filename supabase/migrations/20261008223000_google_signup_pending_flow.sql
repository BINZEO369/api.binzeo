-- Google signup must not create a public profile until the required setup is complete.
-- The auth row is intentionally retained as a short-lived, server-marked session so
-- the completion endpoint can authenticate the user without trusting the UI.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_flow', '') <> 'google_pending' then
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.cleanup_expired_pending_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  deleted_count integer;
begin
  -- Existing email/password pending profiles keep the original cleanup policy.
  delete from public.user_activity_logs as l
  using public.profiles as p
  where l.user_id = p.id
    and p.account_status = 'pending'
    and p.created_at <= now() - interval '2 minutes'
    and (p.username is null or p.date_of_birth is null or p.terms_accepted = false or p.privacy_accepted = false or p.location_consent = false or not exists (select 1 from public.user_verification_records as r where r.user_id = p.id and r.verification_type = 'email' and r.verification_status = 'verified'));

  delete from public.user_login_history as l
  using public.profiles as p
  where l.user_id = p.id
    and p.account_status = 'pending'
    and p.created_at <= now() - interval '2 minutes'
    and (p.username is null or p.date_of_birth is null or p.terms_accepted = false or p.privacy_accepted = false or p.location_consent = false or not exists (select 1 from public.user_verification_records as r where r.user_id = p.id and r.verification_type = 'email' and r.verification_status = 'verified'));

  delete from public.admin_activity_logs as l
  using public.profiles as p
  where l.admin_user_id = p.id
    and p.account_status = 'pending'
    and p.created_at <= now() - interval '2 minutes'
    and (p.username is null or p.date_of_birth is null or p.terms_accepted = false or p.privacy_accepted = false or p.location_consent = false or not exists (select 1 from public.user_verification_records as r where r.user_id = p.id and r.verification_type = 'email' and r.verification_status = 'verified'));

  -- Google pending users intentionally have no profiles row yet.
  delete from auth.users as au
  where (
    exists (
      select 1 from public.profiles as p
      where p.id = au.id
        and p.account_status = 'pending'
        and p.created_at <= now() - interval '2 minutes'
        and (p.username is null or p.date_of_birth is null or p.terms_accepted = false or p.privacy_accepted = false or p.location_consent = false or not exists (select 1 from public.user_verification_records as r where r.user_id = p.id and r.verification_type = 'email' and r.verification_status = 'verified'))
    )
    or (
      coalesce(au.raw_user_meta_data ->> 'signup_flow', '') = 'google_pending'
      and au.created_at <= now() - interval '2 minutes'
    )
  );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
