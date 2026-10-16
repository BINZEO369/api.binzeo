create table if not exists public.marketing_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  preview_text text,
  html_body text not null,
  text_body text,
  created_by uuid not null,
  status text not null default 'draft',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint marketing_campaign_status_check check (status in ('draft','sending','sent','partial','failed'))
);
create table if not exists public.marketing_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_email_campaigns(id) on delete cascade,
  user_id uuid,
  email text not null,
  consent_snapshot boolean not null default false,
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint marketing_delivery_status_check check (status in ('pending','sent','failed','skipped'))
);
create index if not exists marketing_campaigns_created_at_idx on public.marketing_email_campaigns(created_at desc);
create index if not exists marketing_deliveries_campaign_idx on public.marketing_email_deliveries(campaign_id, status);
alter table public.marketing_email_campaigns enable row level security;
alter table public.marketing_email_deliveries enable row level security;
comment on table public.marketing_email_campaigns is 'Admin-authored marketing email campaigns and send totals.';
comment on table public.marketing_email_deliveries is 'Per-recipient marketing delivery audit with consent snapshot.';
revoke all on public.marketing_email_campaigns from anon, authenticated;
revoke all on public.marketing_email_deliveries from anon, authenticated;
