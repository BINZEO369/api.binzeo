alter table public.marketing_email_campaigns
  add column if not exists template_type text not null default 'custom',
  add column if not exists birthday_year integer,
  add column if not exists target_user_ids uuid[] not null default '{}';
alter table public.marketing_email_campaigns
  drop constraint if exists marketing_campaign_template_type_check;
alter table public.marketing_email_campaigns
  add constraint marketing_campaign_template_type_check check (template_type in ('custom', 'birthday'));
comment on column public.marketing_email_campaigns.template_type is 'Template used for the campaign, including annual birthday messages.';
comment on column public.marketing_email_campaigns.birthday_year is 'UTC calendar year for a birthday campaign; used for audit history.';
comment on column public.marketing_email_campaigns.target_user_ids is 'Explicitly selected user IDs for a direct campaign.';

alter table public.user_birthdays
  add column if not exists last_birthday_wish_year integer,
  add column if not exists last_birthday_wish_sent_at timestamptz;
comment on column public.user_birthdays.last_birthday_wish_year is 'UTC year in which the annual birthday email was last successfully sent.';
comment on column public.user_birthdays.last_birthday_wish_sent_at is 'Timestamp of the last successfully sent annual birthday email.';

create table if not exists public.birthday_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  birthday_year integer not null check (birthday_year between 2000 and 2200),
  email text not null,
  campaign_id uuid references public.marketing_email_campaigns(id) on delete set null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, birthday_year)
);
create index if not exists birthday_email_deliveries_year_status_idx on public.birthday_email_deliveries(birthday_year, status);
alter table public.birthday_email_deliveries enable row level security;
revoke all on public.birthday_email_deliveries from anon, authenticated;
comment on table public.birthday_email_deliveries is 'Annual birthday email audit and duplicate-send guard; one row per user per UTC year.';
