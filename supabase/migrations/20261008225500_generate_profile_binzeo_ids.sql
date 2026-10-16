-- The generator existed, but profiles had no default or trigger that called it.
-- Enforce BZ ID creation at the database boundary for every signup method.
create or replace function public.assign_profile_binzeo_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.binzeo_user_id), '') is null then
    new.binzeo_user_id := public.generate_binzeo_user_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_assign_binzeo_user_id on public.profiles;
create trigger trg_profiles_assign_binzeo_user_id
before insert or update of binzeo_user_id on public.profiles
for each row
execute function public.assign_profile_binzeo_user_id();

-- Repair profiles created before the trigger existed.
update public.profiles
set binzeo_user_id = public.generate_binzeo_user_id()
where binzeo_user_id is null;

alter table public.profiles
  alter column binzeo_user_id set not null;
