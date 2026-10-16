create or replace function public.issue_email_verification_code(
  target_user_id uuid,
  request_ip inet default null::inet
)
returns table(challenge_id uuid, verification_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  plain_code text;
  new_challenge_id uuid;
  expiry timestamptz;
  now_ts timestamptz := now();
  last_issued_at timestamptz;
  user_count integer;
  ip_count integer;
  v_request_ip inet;
begin
  v_request_ip := $2;

  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'user_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 918273645));

  select max(c.created_at) into last_issued_at
    from public.email_verification_challenges c
   where c.user_id = target_user_id;

  if last_issued_at is not null and now_ts < last_issued_at + interval '60 seconds' then
    raise exception 'otp_cooldown:%', greatest(1, ceil(extract(epoch from (last_issued_at + interval '60 seconds' - now_ts)))::integer);
  end if;

  select count(*)::integer into user_count
    from public.email_verification_challenges c
   where c.user_id = target_user_id
     and c.created_at >= now_ts - interval '1 hour';
  if user_count >= 5 then raise exception 'otp_user_hourly_limit'; end if;

  if v_request_ip is not null then
    select count(*)::integer into ip_count
      from public.email_verification_challenges c
     where c.request_ip = v_request_ip
       and c.created_at >= now_ts - interval '1 hour';
    if ip_count >= 20 then raise exception 'otp_ip_hourly_limit'; end if;
  end if;

  update public.email_verification_challenges c
     set consumed_at = coalesce(c.consumed_at, now_ts)
   where c.user_id = target_user_id and c.consumed_at is null;

  plain_code := lpad((floor(random() * 1000000)::integer)::text, 6, '0');
  expiry := now_ts + interval '5 minutes';

  insert into public.email_verification_challenges (user_id, code_hash, expires_at, request_ip)
  values (target_user_id, extensions.crypt(plain_code, extensions.gen_salt('bf', 8)), expiry, v_request_ip)
  returning id into new_challenge_id;

  insert into public.user_verification_records (
    user_id, verification_type, verification_status, source_of_truth,
    last_requested_at, expires_at, attempt_count
  ) values (
    target_user_id, 'email', 'pending', 'binzeo_email_otp', now_ts, expiry, 0
  ) on conflict (user_id, verification_type) do update set
    verification_status = 'pending', source_of_truth = 'binzeo_email_otp',
    last_requested_at = now_ts, expires_at = expiry, attempt_count = 0, updated_at = now_ts;

  return query select new_challenge_id, plain_code, expiry;
end;
$$;

revoke all on function public.issue_email_verification_code(uuid, inet) from public;
grant execute on function public.issue_email_verification_code(uuid, inet) to authenticated;
