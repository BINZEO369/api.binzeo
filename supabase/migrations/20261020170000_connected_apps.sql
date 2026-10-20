create table if not exists public.connected_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  website_url text not null,
  client_id text unique,
  allowed_origins text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_apps_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint connected_apps_url_https check (website_url ~ '^https://')
);

create table if not exists public.user_connected_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references public.connected_apps(id) on delete cascade,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_connected_apps_unique unique (user_id, app_id)
);

create index if not exists user_connected_apps_user_idx on public.user_connected_apps(user_id);
create index if not exists user_connected_apps_active_idx on public.user_connected_apps(user_id, app_id) where disconnected_at is null and revoked_at is null;

create or replace function public.set_connected_apps_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists connected_apps_updated_at on public.connected_apps;
create trigger connected_apps_updated_at before update on public.connected_apps for each row execute function public.set_connected_apps_updated_at();
drop trigger if exists user_connected_apps_updated_at on public.user_connected_apps;
create trigger user_connected_apps_updated_at before update on public.user_connected_apps for each row execute function public.set_connected_apps_updated_at();

alter table public.connected_apps enable row level security;
alter table public.user_connected_apps enable row level security;

drop policy if exists connected_apps_active_read on public.connected_apps;
create policy connected_apps_active_read on public.connected_apps for select to authenticated using (is_active = true);
drop policy if exists user_connected_apps_self_read on public.user_connected_apps;
create policy user_connected_apps_self_read on public.user_connected_apps for select to authenticated using (user_id = auth.uid());
drop policy if exists user_connected_apps_self_insert on public.user_connected_apps;
create policy user_connected_apps_self_insert on public.user_connected_apps for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_connected_apps_self_update on public.user_connected_apps;
create policy user_connected_apps_self_update on public.user_connected_apps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.connected_apps (slug, name, logo_url, website_url, client_id, allowed_origins)
values
  ('jabiyen', 'JABIYEN', 'https://jabiyen-website.vercel.app/logo.png', 'https://jabiyen-website.vercel.app', 'jabiyen', array['https://jabiyen-website.vercel.app']),
  ('isyen', 'ISYEN', 'https://isyen.com/logo.svg', 'https://isyen.com', 'isyen', array['https://isyen.com'])
on conflict (slug) do update set name = excluded.name, logo_url = excluded.logo_url, website_url = excluded.website_url, client_id = excluded.client_id, allowed_origins = excluded.allowed_origins;
