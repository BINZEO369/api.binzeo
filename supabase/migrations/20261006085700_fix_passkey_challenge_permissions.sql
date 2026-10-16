alter function public.issue_passkey_challenge(uuid, text, smallint, inet)
  set search_path = public, extensions, pg_catalog;

revoke all on function public.issue_passkey_challenge(uuid, text, smallint, inet) from public;
grant execute on function public.issue_passkey_challenge(uuid, text, smallint, inet) to authenticated;
