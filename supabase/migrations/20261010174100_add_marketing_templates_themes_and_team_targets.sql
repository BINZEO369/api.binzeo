create table if not exists public.marketing_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme text not null default 'midnight',
  subject text not null,
  preview_text text,
  headline text not null,
  message text not null,
  button_label text,
  button_url text,
  images jsonb not null default '[]'::jsonb,
  created_by uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_email_campaigns add column if not exists template_id uuid references public.marketing_email_templates(id) on delete set null;
alter table public.marketing_email_campaigns add column if not exists theme text not null default 'midnight';
alter table public.marketing_email_campaigns add column if not exists target_team_ids uuid[] not null default '{}';
create index if not exists marketing_templates_created_at_idx on public.marketing_email_templates(created_at desc);
create index if not exists marketing_campaigns_template_idx on public.marketing_email_campaigns(template_id);
alter table public.marketing_email_templates enable row level security;
revoke all on public.marketing_email_templates from anon, authenticated;
comment on table public.marketing_email_templates is 'Reusable admin marketing email templates with themes and images.';
comment on column public.marketing_email_campaigns.target_team_ids is 'Selected sector/team IDs; empty means all eligible active users.';
