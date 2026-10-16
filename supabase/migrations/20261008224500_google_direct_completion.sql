-- Google OAuth now completes from Google's verified identity alone.
-- Keep the normal profile trigger so BZ ID/profile creation happens in the callback.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

-- Only remove a pending Google auth row when it still has no active profile.
-- This prevents cleanup from deleting a successfully completed account if a
-- metadata update is interrupted after profile activation.
create or replace function public.cleanup_expired_pending_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  deleted_count integer;
begin
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

  delete from auth.users as au
  where exists (
    select 1 from public.profiles as p
    where p.id = au.id
      and p.account_status = 'pending'
      and p.created_at <= now() - interval '2 minutes'
      and (p.username is null or p.date_of_birth is null or p.terms_accepted = false or p.privacy_accepted = false or p.location_consent = false or not exists (select 1 from public.user_verification_records as r where r.user_id = p.id and r.verification_type = 'email' and r.verification_status = 'verified'))
  )
  or (
    coalesce(au.raw_user_meta_data ->> 'signup_flow', '') = 'google_pending'
    and au.created_at <= now() - interval '2 minutes'
    and not exists (select 1 from public.profiles as p where p.id = au.id and p.account_status = 'active')
  );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
