alter table public.user_passkeys enable row level security;

drop policy if exists user_passkeys_insert on public.user_passkeys;
create policy user_passkeys_insert
  on public.user_passkeys
  for insert to authenticated
  with check (user_id = auth.uid());
