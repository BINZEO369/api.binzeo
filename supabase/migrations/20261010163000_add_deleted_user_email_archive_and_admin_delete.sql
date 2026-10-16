create table if not exists public.deleted_user_emails (
  id uuid primary key default gen_random_uuid(),
  original_user_id uuid not null,
  email text not null,
  binzeo_user_id text,
  display_name text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  deletion_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint deleted_user_emails_metadata_object check (jsonb_typeof(metadata) = 'object'::text)
);

create index if not exists deleted_user_emails_email_idx on public.deleted_user_emails(email);
create index if not exists deleted_user_emails_deleted_at_idx on public.deleted_user_emails(deleted_at desc);
alter table public.deleted_user_emails enable row level security;
comment on table public.deleted_user_emails is 'Administrative archive of emails and identity metadata for accounts permanently removed from auth.users and public profiles.';

create or replace function public.admin_delete_user(
  target_user_id uuid,
  deleting_admin_id uuid,
  deletion_reason text default null
)
returns public.deleted_user_emails
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_email text;
  target_binzeo_id text;
  target_display_name text;
  archived public.deleted_user_emails;
begin
  if target_user_id is null or deleting_admin_id is null then raise exception 'missing_user_or_admin_id'; end if;
  if not exists (select 1 from public.admin_access aa where aa.user_id = deleting_admin_id and aa.is_active = true and 'super_admin' = any(aa.roles)) then raise exception 'super_admin_required'; end if;
  if target_user_id = deleting_admin_id then raise exception 'self_deletion_not_allowed'; end if;
  select au.email, p.binzeo_user_id, p.display_name into target_email, target_binzeo_id, target_display_name
  from auth.users au left join public.profiles p on p.id = au.id where au.id = target_user_id limit 1;
  if target_email is null then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.admin_access aa where aa.user_id = target_user_id and aa.is_active = true and 'super_admin' = any(aa.roles)) then raise exception 'cannot_delete_super_admin'; end if;
  insert into public.deleted_user_emails (original_user_id, email, binzeo_user_id, display_name, deleted_by, deletion_reason, metadata)
  values (target_user_id, target_email, target_binzeo_id, target_display_name, deleting_admin_id, nullif(trim(deletion_reason), ''), jsonb_build_object('archived_by', deleting_admin_id, 'source', 'admin_panel'))
  returning * into archived;
  insert into public.admin_activity_logs (admin_user_id, action_type, target_type, target_id, description, metadata)
  values (deleting_admin_id, 'user_deleted', 'user', target_user_id, 'Permanently deleted user account; email retained in deleted_user_emails archive.', jsonb_build_object('email', target_email, 'binzeo_user_id', target_binzeo_id, 'deletion_reason', deletion_reason, 'archive_id', archived.id));
  delete from auth.users where id = target_user_id;
  if not found then raise exception 'user_delete_failed'; end if;
  return archived;
end;
$$;

revoke all on table public.deleted_user_emails from anon, authenticated;
revoke all on function public.admin_delete_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid, uuid, text) to service_role;
