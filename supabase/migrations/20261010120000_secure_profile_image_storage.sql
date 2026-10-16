create table if not exists public.profile_images (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  image_public_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_images_profile_user_match check (profile_id = user_id)
);

comment on table public.profile_images is
  'One current profile image per verified BINZEO user. Writes happen only through replace_current_profile_image.';

create table if not exists public.profile_deleted_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  image_public_id text,
  deletion_reason text not null default 'replaced',
  deleted_at timestamptz not null default now(),
  constraint profile_deleted_images_profile_user_match check (profile_id = user_id),
  constraint profile_deleted_images_reason_check check (deletion_reason in ('replaced', 'deleted', 'cleanup'))
);

comment on table public.profile_deleted_images is
  'Archive of profile image links that are no longer current, retained before storage deletion.';

create index if not exists profile_deleted_images_user_id_deleted_at_idx
  on public.profile_deleted_images(user_id, deleted_at desc);

alter table public.profile_images enable row level security;
alter table public.profile_deleted_images enable row level security;

drop policy if exists profile_images_owner_select on public.profile_images;
create policy profile_images_owner_select
  on public.profile_images for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profile_deleted_images_owner_select on public.profile_deleted_images;
create policy profile_deleted_images_owner_select
  on public.profile_deleted_images for select to authenticated
  using (user_id = auth.uid());

insert into public.profile_images (user_id, profile_id, image_url, image_public_id, created_at, updated_at)
select p.id, p.id, p.profile_photo_url, p.profile_photo_public_id, coalesce(p.updated_at, now()), coalesce(p.updated_at, now())
from public.profiles p
where nullif(trim(p.profile_photo_url), '') is not null
  and nullif(trim(p.profile_photo_public_id), '') is not null
on conflict (user_id) do update set
  image_url = excluded.image_url,
  image_public_id = excluded.image_public_id,
  updated_at = excluded.updated_at;

create or replace function public.replace_current_profile_image(
  p_image_url text,
  p_image_public_id text
)
returns table (
  user_id uuid,
  image_url text,
  image_public_id text,
  previous_image_public_id text
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  current_image public.profile_images%rowtype;
  actor_id uuid := auth.uid();
  previous_id text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if nullif(trim(p_image_url), '') is null or nullif(trim(p_image_public_id), '') is null then
    raise exception using errcode = '22023', message = 'A valid profile image URL and file ID are required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.user_verification_records v on v.user_id = p.id
    where p.id = actor_id
      and p.account_status = 'active'
      and v.verification_type = 'email'
      and v.verification_status = 'verified'
  ) then
    raise exception using errcode = '42501', message = 'Only verified active users can change profile images.';
  end if;

  select * into current_image
  from public.profile_images
  where profile_images.user_id = actor_id
  for update;

  if current_image.user_id is not null
     and (current_image.image_url <> p_image_url or current_image.image_public_id <> p_image_public_id) then
    previous_id := current_image.image_public_id;
    insert into public.profile_deleted_images (
      user_id, profile_id, image_url, image_public_id, deletion_reason
    ) values (
      actor_id, actor_id, current_image.image_url, current_image.image_public_id, 'replaced'
    );
  end if;

  insert into public.profile_images (
    user_id, profile_id, image_url, image_public_id, updated_at
  ) values (
    actor_id, actor_id, p_image_url, p_image_public_id, now()
  )
  on conflict (user_id) do update set
    profile_id = excluded.profile_id,
    image_url = excluded.image_url,
    image_public_id = excluded.image_public_id,
    updated_at = now();

  update public.profiles
  set profile_photo_url = p_image_url,
      profile_photo_public_id = p_image_public_id,
      updated_at = now()
  where profiles.id = actor_id;

  return query
  select actor_id, p_image_url, p_image_public_id, previous_id;
end;
$$;

revoke all on function public.replace_current_profile_image(text, text) from public;
grant execute on function public.replace_current_profile_image(text, text) to authenticated;
