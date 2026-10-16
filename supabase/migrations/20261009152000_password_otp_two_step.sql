-- Keep OTP verification and password update as two server-side steps.
-- The marker prevents a verified challenge from changing the password twice.
alter table public.password_reset_challenges
  add column if not exists password_changed_at timestamptz;
