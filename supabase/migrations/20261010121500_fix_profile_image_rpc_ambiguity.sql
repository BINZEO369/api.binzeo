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
    from public.profiles as p
    join public.user_verification_records as v on v.user_id = p.id
    where p.id = actor_id
      and p.account_status = 'active'
      and v.verification_type = 'email'
      and v.verification_status = 'verified'
  ) then
    raise exception using errcode = '42501', message = 'Only verified active users can change profile images.';
  end if;

  select pi.* into current_image
  from public.profile_images as pi
  where pi.user_id = actor_id
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

  insert into public.profile_images as pi (
    user_id, profile_id, image_url, image_public_id, updated_at
  ) values (
    actor_id, actor_id, p_image_url, p_image_public_id, now()
  )
  on conflict on constraint profile_images_pkey do update set
    profile_id = excluded.profile_id,
    image_url = excluded.image_url,
    image_public_id = excluded.image_public_id,
    updated_at = now();

  update public.profiles as p
  set profile_photo_url = p_image_url,
      profile_photo_public_id = p_image_public_id,
      updated_at = now()
  where p.id = actor_id;

  return query
  select actor_id, p_image_url, p_image_public_id, previous_id;
end;
$$;

revoke all on function public.replace_current_profile_image(text, text) from public;
grant execute on function public.replace_current_profile_image(text, text) to authenticated;
