create or replace function public.consume_passkey_challenge(
  challenge_id uuid,
  submitted_challenge text
)
returns table(valid boolean, user_id uuid, purpose text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  row_data public.passkey_challenges%rowtype;
  now_ts timestamptz := now();
  decoded_challenge text;
  challenge_matches boolean := false;
begin
  select * into row_data
    from public.passkey_challenges pc
   where pc.id = challenge_id
   for update;

  if found and submitted_challenge is not null then
    challenge_matches := extensions.digest(submitted_challenge, 'sha256') = row_data.challenge_hash;
    if not challenge_matches then
      begin
        decoded_challenge := convert_from(
          decode(
            replace(replace(submitted_challenge, '-', '+'), '_', '/')
              || repeat('=', (4 - length(submitted_challenge) % 4) % 4),
            'base64'
          ),
          'UTF8'
        );
        challenge_matches := extensions.digest(decoded_challenge, 'sha256') = row_data.challenge_hash;
      exception when others then
        challenge_matches := false;
      end;
    end if;
  end if;

  if not found or row_data.consumed_at is not null or now_ts >= row_data.expires_at
     or not challenge_matches then
    return query select false,
      case when found then row_data.user_id else null::uuid end,
      case when found then row_data.purpose else null::text end,
      case when found then row_data.expires_at else null::timestamptz end;
    return;
  end if;

  update public.passkey_challenges set consumed_at = now_ts where id = row_data.id;
  return query select true, row_data.user_id, row_data.purpose, row_data.expires_at;
end;
$$;

revoke all on function public.consume_passkey_challenge(uuid, text) from public;
grant execute on function public.consume_passkey_challenge(uuid, text) to authenticated;
