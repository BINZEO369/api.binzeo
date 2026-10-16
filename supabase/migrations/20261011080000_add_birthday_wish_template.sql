alter table public.marketing_email_templates
  add column if not exists template_type text not null default 'custom';

create index if not exists marketing_templates_type_active_idx
  on public.marketing_email_templates(template_type, is_active, updated_at desc);

create unique index if not exists marketing_templates_one_active_birthday_idx
  on public.marketing_email_templates(template_type)
  where template_type = 'birthday' and is_active = true;

comment on column public.marketing_email_templates.template_type is 'Reusable template category; birthday is the annual birthday wish template.';
