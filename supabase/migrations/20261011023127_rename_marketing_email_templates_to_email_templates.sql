-- Generalize the shared reusable-template library: it stores birthday,
-- marketing and future email templates, not marketing-only templates.
-- Keep the table OID intact so rows, RLS policies and foreign keys survive.
ALTER TABLE public.marketing_email_templates RENAME TO email_templates;

ALTER INDEX IF EXISTS public.marketing_templates_created_at_idx
  RENAME TO email_templates_created_at_idx;
ALTER INDEX IF EXISTS public.marketing_templates_type_active_idx
  RENAME TO email_templates_type_active_idx;
ALTER INDEX IF EXISTS public.marketing_templates_one_active_birthday_idx
  RENAME TO email_templates_one_active_birthday_idx;

COMMENT ON TABLE public.email_templates IS
  'Reusable email templates for birthday, marketing and future email types.';

-- Temporary rollout bridge for already-running auth app deployments.
-- Runtime code should use public.email_templates; old callers can continue
-- through this automatically-updatable view until all deployments are updated.
CREATE VIEW public.marketing_email_templates
  WITH (security_invoker = true)
  AS SELECT * FROM public.email_templates;
REVOKE ALL ON public.marketing_email_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_email_templates TO service_role;
COMMENT ON VIEW public.marketing_email_templates IS
  'Legacy compatibility alias; use public.email_templates in new code.';
