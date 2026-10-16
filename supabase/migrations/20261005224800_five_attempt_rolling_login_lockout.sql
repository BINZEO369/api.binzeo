alter table public.login_attempt_limits
  add column if not exists lockout_until timestamptz;

alter table public.login_limit_exceeded
  alter column daily_limit set default 5;

update public.login_attempt_limits
   set lockout_until = coalesce(lockout_until, now() + interval '24 hours')
 where attempt_count >= 5
   and (lockout_until is null or lockout_until > now());

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
  v_account_attempts integer := 0;
  v_ip_attempts integer := 0;
  v_account_lockout timestamptz;
  v_ip_lockout timestamptz;
  v_reset_at timestamptz;
begin
  select l.attempt_count, l.lockout_until
    into v_account_attempts, v_account_lockout
    from public.login_attempt_limits l
   where l.scope_type = 'account' and l.scope_key = v_account_key
   order by l.last_attempt_at desc, l.created_at desc
   limit 1;

  select l.attempt_count, l.lockout_until
    into v_ip_attempts, v_ip_lockout
    from public.login_attempt_limits l
   where l.scope_type = 'ip' and l.scope_key = host(p_request_ip)
   order by l.last_attempt_at desc, l.created_at desc
   limit 1;

  v_reset_at := greatest(coalesce(v_account_lockout, now()), coalesce(v_ip_lockout, now()));

  return query
  select not (coalesce(v_account_lockout, now()) > now()
           or coalesce(v_ip_lockout, now()) > now()),
         case when coalesce(v_account_lockout, now()) > now() then v_account_attempts else 0 end,
         case when coalesce(v_ip_lockout, now()) > now() then v_ip_attempts else 0 end,
         5,
         v_reset_at;
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
  v_account_id uuid;
  v_ip_id uuid;
  v_account_attempts integer := 0;
  v_ip_attempts integer := 0;
  v_account_lockout timestamptz;
  v_ip_lockout timestamptz;
  v_blocked boolean := false;
  v_reset_at timestamptz := now() + interval '24 hours';
begin
  select l.id, l.attempt_count, l.lockout_until
    into v_account_id, v_account_attempts, v_account_lockout
    from public.login_attempt_limits l
   where l.scope_type = 'account' and l.scope_key = v_account_key
   order by l.last_attempt_at desc, l.created_at desc
   limit 1
   for update;

  if v_account_id is null then
    insert into public.login_attempt_limits(scope_type, scope_key, account_email, user_id, request_ip, window_date)
    values ('account', v_account_key, v_email, p_user_id, p_request_ip, v_date)
    returning id into v_account_id;
    v_account_attempts := 0;
  elsif v_account_lockout is not null and v_account_lockout <= now() then
    update public.login_attempt_limits
       set attempt_count = 0, lockout_until = null, window_date = v_date,
           user_id = coalesce(p_user_id, user_id), last_attempt_at = now(), updated_at = now()
     where id = v_account_id;
    v_account_attempts := 0;
    v_account_lockout := null;
  end if;

  select l.id, l.attempt_count, l.lockout_until
    into v_ip_id, v_ip_attempts, v_ip_lockout
    from public.login_attempt_limits l
   where l.scope_type = 'ip' and l.scope_key = v_ip_key
   order by l.last_attempt_at desc, l.created_at desc
   limit 1
   for update;

  if v_ip_id is null then
    insert into public.login_attempt_limits(scope_type, scope_key, account_email, user_id, request_ip, window_date)
    values ('ip', v_ip_key, v_email, p_user_id, p_request_ip, v_date)
    returning id into v_ip_id;
    v_ip_attempts := 0;
  elsif v_ip_lockout is not null and v_ip_lockout <= now() then
    update public.login_attempt_limits
       set attempt_count = 0, lockout_until = null, window_date = v_date,
           user_id = coalesce(p_user_id, user_id), last_attempt_at = now(), updated_at = now()
     where id = v_ip_id;
    v_ip_attempts := 0;
    v_ip_lockout := null;
  end if;

  if coalesce(v_account_lockout, now()) > now()
     or coalesce(v_ip_lockout, now()) > now() then
    v_blocked := true;
    v_reset_at := greatest(coalesce(v_account_lockout, now()), coalesce(v_ip_lockout, now()));
  else
    v_account_attempts := v_account_attempts + 1;
    v_ip_attempts := v_ip_attempts + 1;
    update public.login_attempt_limits
       set attempt_count = v_account_attempts, user_id = coalesce(p_user_id, user_id),
           last_attempt_at = now(), updated_at = now()
     where id = v_account_id;
    update public.login_attempt_limits
       set attempt_count = v_ip_attempts, user_id = coalesce(p_user_id, user_id),
           last_attempt_at = now(), updated_at = now()
     where id = v_ip_id;

    if v_account_attempts >= 5 then
      v_account_lockout := now() + interval '24 hours';
      update public.login_attempt_limits set lockout_until = v_account_lockout where id = v_account_id;
    end if;
    if v_ip_attempts >= 5 then
      v_ip_lockout := now() + interval '24 hours';
      update public.login_attempt_limits set lockout_until = v_ip_lockout where id = v_ip_id;
    end if;
    v_blocked := v_account_lockout is not null or v_ip_lockout is not null;
    if v_blocked then
      v_reset_at := greatest(coalesce(v_account_lockout, now()), coalesce(v_ip_lockout, now()));
    end if;
  end if;

  if v_blocked then
    insert into public.login_limit_exceeded(
      account_email, user_id, account_key, request_ip, window_date,
      account_attempts, ip_attempts, daily_limit, blocked_count,
      first_blocked_at, last_blocked_at, updated_at
    ) values (
      v_email, p_user_id, v_account_key, p_request_ip, v_date,
      v_account_attempts, v_ip_attempts, 5, 1, now(), now(), now()
    ) on conflict (account_key, request_ip, window_date) do update set
      user_id = coalesce(excluded.user_id, login_limit_exceeded.user_id),
      account_attempts = excluded.account_attempts, ip_attempts = excluded.ip_attempts,
      daily_limit = 5, blocked_count = login_limit_exceeded.blocked_count + 1,
      last_blocked_at = now(), updated_at = now();
  end if;

  return query select not v_blocked, v_blocked, v_account_attempts, v_ip_attempts, 5, v_reset_at;
end;
$$;
