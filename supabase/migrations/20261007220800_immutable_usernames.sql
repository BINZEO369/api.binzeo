-- Usernames are public handles: lowercase letters, digits and underscores,
-- starting with a letter, 3–30 characters. NULL remains allowed for legacy rows.
alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or username::text ~ '^[a-z][a-z0-9_]{2,29}$');

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username)
  where username is not null;
