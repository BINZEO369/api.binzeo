CREATE TABLE public.occasion_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  template_type text NOT NULL DEFAULT 'occasion' CHECK (template_type = 'occasion'),
  subject text NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  consent_snapshot boolean NOT NULL DEFAULT true,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  error_message text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX occasion_email_deliveries_created_at_idx
  ON public.occasion_email_deliveries (created_at DESC);

CREATE INDEX occasion_email_deliveries_user_created_idx
  ON public.occasion_email_deliveries (user_id, created_at DESC);

CREATE INDEX occasion_email_deliveries_template_created_idx
  ON public.occasion_email_deliveries (template_id, created_at DESC);

CREATE UNIQUE INDEX occasion_email_deliveries_single_sending_idx
  ON public.occasion_email_deliveries (user_id, template_id)
  WHERE status = 'sending';

ALTER TABLE public.occasion_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.occasion_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.occasion_email_deliveries TO service_role;

COMMENT ON TABLE public.occasion_email_deliveries IS
  'Per-recipient audit log for manually sent festival and occasion email templates. Only the trusted service role can read or write this table.';
COMMENT ON COLUMN public.occasion_email_deliveries.consent_snapshot IS
  'Records that the recipient had enabled marketing email consent when this occasion email was attempted.';
