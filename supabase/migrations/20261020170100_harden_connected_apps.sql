create or replace function public.set_connected_apps_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

update public.connected_apps
set logo_url = 'https://jabiyen-website.vercel.app/logo.png',
    website_url = 'https://jabiyen-website.vercel.app',
    allowed_origins = array['https://jabiyen-website.vercel.app'],
    updated_at = now()
where slug = 'jabiyen';
