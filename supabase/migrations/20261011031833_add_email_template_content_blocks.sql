ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.email_templates.content_blocks IS
  'Ordered headline, message, and button blocks for email template layout; legacy fields remain for compatibility.';
