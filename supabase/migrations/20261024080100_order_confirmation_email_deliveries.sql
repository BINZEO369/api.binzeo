BEGIN;

CREATE TABLE IF NOT EXISTS public.order_confirmation_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text NOT NULL CHECK (project_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  order_reference text NOT NULL CHECK (char_length(order_reference) BETWEEN 1 AND 160),
  template_version text NOT NULL CHECK (char_length(template_version) BETWEEN 1 AND 80),
  recipient_email text NOT NULL CHECK (char_length(recipient_email) BETWEEN 3 AND 254),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_key, order_reference, template_version)
);

CREATE INDEX IF NOT EXISTS order_confirmation_email_deliveries_status_idx
  ON public.order_confirmation_email_deliveries (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS order_confirmation_email_deliveries_created_idx
  ON public.order_confirmation_email_deliveries (created_at DESC);

ALTER TABLE public.order_confirmation_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_confirmation_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_confirmation_email_deliveries TO service_role;
DROP POLICY IF EXISTS order_confirmation_email_deliveries_service_role ON public.order_confirmation_email_deliveries;
CREATE POLICY order_confirmation_email_deliveries_service_role
  ON public.order_confirmation_email_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS order_confirmation_email_deliveries_set_updated_at ON public.order_confirmation_email_deliveries;
CREATE TRIGGER order_confirmation_email_deliveries_set_updated_at
  BEFORE UPDATE ON public.order_confirmation_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();

COMMENT ON TABLE public.order_confirmation_email_deliveries IS
  'Central idempotency and delivery status ledger for transactional order-confirmation emails sent through BINZEO SMTP.';

COMMIT;
