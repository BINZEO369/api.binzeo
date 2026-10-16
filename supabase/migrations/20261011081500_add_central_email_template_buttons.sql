alter table public.marketing_email_templates
  add column if not exists buttons jsonb not null default '[]'::jsonb;
comment on column public.marketing_email_templates.buttons is 'Reusable email template buttons; supports multiple calls to action.';
