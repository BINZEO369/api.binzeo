create extension if not exists pgcrypto with schema extensions;

create table if not exists public.login_attempt_limits (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('account','ip')),
  scope_key text not null,
  account_email text not null,
  user_id uuid references auth.users(id) on delete set null,
  request_ip inet not null,
  window_date date not null default ((now() at time zone 'utc')::date),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_key, window_date)
);

create table if not exists public.login_limit_exceeded (
  id uuid primary key default gen_random_uuid(),
  account_email text not null,
  user_id uuid references auth.users(id) on delete set null,
  account_key text not null,
  request_ip inet not null,
  window_date date not null default ((now() at time zone 'utc')::date),
  account_attempts integer not null default 0,
  ip_attempts integer not null default 0,
  daily_limit integer not null default 10,
  blocked_count integer not null default 1,
  first_blocked_at timestamptz not null default now(),
  last_blocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_key, request_ip, window_date)
);

create index if not exists login_attempt_limits_window_idx
  on public.login_attempt_limits(window_date, scope_type, scope_key);
create index if not exists login_limit_exceeded_recent_idx
  on public.login_limit_exceeded(window_date desc, last_blocked_at desc);

alter table public.login_attempt_limits enable row level security;
alter table public.login_limit_exceeded enable row level security;

drop policy if exists login_limit_exceeded_admin_select on public.login_limit_exceeded;
create policy login_limit_exceeded_admin_select
  on public.login_limit_exceeded for select to authenticated using (
    exists (
      select 1 from public.admin_access aa
      where aa.user_id = auth.uid() and aa.is_active = true
    )
  );

drop policy if exists login_attempt_limits_admin_select on public.login_attempt_limits;
create policy login_attempt_limits_admin_select
  on public.login_attempt_limits for select to authenticated using (
    exists (
      select 1 from public.admin_access aa
      where aa.user_id = auth.uid() and aa.is_active = true
    )
  );

create or replace function public.check_daily_login_limit(
  p_account_email text,
  p_request_ip inet
)
returns table (
  allowed boolean,
  account_attempts integer,
  ip_attempts integer,
  daily_limit integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_account_email));
  v_account_key text := encode(extensions.digest(v_email, 'sha256'), 'hex');
  v_date date := (now() at time zone 'utc')::date;
  v_account_attempts integer := 0;
  v_ip_attempts integer := 0;
begin
  select coalesce(max(l.attempt_count), 0)
    into v_account_attempts
    from public.login_attempt_limits l
   where l.scope_type = 'account'
     and l.scope_key = v_account_key
     and l.window_date = v_date;

  select coalesce(max(l.attempt_count), 0)
    into v_ip_attempts
    from public.login_attempt_limits l
   where l.scope_type = 'ip'
     and l.scope_key = host(p_request_ip)
     and l.window_date = v_date;

  return query
  select v_account_attempts < 10 and v_ip_attempts < 10,
         v_account_attempts,
         v_ip_attempts,
         10,
         ((v_date + 1)::timestamp at time zone 'utc');
end;
$$;

create or replace function public.record_failed_login_attempt(
  p_account_email text,
  p_request_ip inet,
  p_user_id uuid default null
)
returns table (
  allowed boolean,
  blocked boolean,
  account_attempts integer,
  ip_attempts integer,
  daily_limit integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_account_email));
  v_account_key text := encode(extensions.digest(v_email, 'sha256'), 'hex');
  v_ip_key text := host(p_request_ip);
  v_date date := (now() at time zone 'utc')::date;
  v_account_attempts integer := 0;
  v_ip_attempts integer := 0;
  v_blocked boolean := false;
begin
  insert into public.login_attempt_limits(
    scope_type, scope_key, account_email, user_id, request_ip, window_date
  )
  values
    ('account', v_account_key, v_email, p_user_id, p_request_ip, v_date),
    ('ip', v_ip_key, v_email, p_user_id, p_request_ip, v_date)
  on conflict (scope_type, scope_key, window_date) do nothing;

  select l.attempt_count
    into v_account_attempts
    from public.login_attempt_limits l
   where l.scope_type = 'account'
     and l.scope_key = v_account_key
     and l.window_date = v_date
   for update;

  select l.attempt_count
    into v_ip_attempts
    from public.login_attempt_limits l
   where l.scope_type = 'ip'
     and l.scope_key = v_ip_key
     and l.window_date = v_date
   for update;

  v_blocked := v_account_attempts >= 10 or v_ip_attempts >= 10;

  if v_blocked then
    insert into public.login_limit_exceeded(
      account_email, user_id, account_key, request_ip, window_date,
      account_attempts, ip_attempts, daily_limit, blocked_count,
      first_blocked_at, last_blocked_at, updated_at
    )
    values (
      v_email, p_user_id, v_account_key, p_request_ip, v_date,
      v_account_attempts, v_ip_attempts, 10, 1,
      now(), now(), now()
    )
    on conflict (account_key, request_ip, window_date) do update set
      user_id = coalesce(excluded.user_id, login_limit_exceeded.user_id),
      account_attempts = excluded.account_attempts,
      ip_attempts = excluded.ip_attempts,
      blocked_count = login_limit_exceeded.blocked_count + 1,
      last_blocked_at = now(),
      updated_at = now();
  else
    update public.login_attempt_limits
       set attempt_count = attempt_count + 1,
           user_id = coalesce(p_user_id, user_id),
           last_attempt_at = now(),
           updated_at = now()
     where scope_type = 'account'
       and scope_key = v_account_key
       and window_date = v_date;

    update public.login_attempt_limits
       set attempt_count = attempt_count + 1,
           user_id = coalesce(p_user_id, user_id),
           last_attempt_at = now(),
           updated_at = now()
     where scope_type = 'ip'
       and scope_key = v_ip_key
       and window_date = v_date;

    v_account_attempts := v_account_attempts + 1;
    v_ip_attempts := v_ip_attempts + 1;
  end if;

  return query
  select not v_blocked,
         v_blocked,
         v_account_attempts,
         v_ip_attempts,
         10,
         ((v_date + 1)::timestamp at time zone 'utc');
end;
$$;

revoke all on function public.check_daily_login_limit(text, inet) from public;
grant execute on function public.check_daily_login_limit(text, inet) to anon, authenticated;
revoke all on function public.record_failed_login_attempt(text, inet, uuid) from public;
grant execute on function public.record_failed_login_attempt(text, inet, uuid) to anon, authenticated;
