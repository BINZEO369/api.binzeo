-- Central Stripe payment foundation shared by BINZEO websites.
-- Secret API keys and webhook signing secrets remain in server environment variables.
-- No payment site is enabled until merchant country, currency and Stripe credentials are configured.

CREATE TABLE IF NOT EXISTS public.payment_provider_settings (
  provider text PRIMARY KEY CHECK (provider = 'stripe'),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  merchant_country text CHECK (merchant_country IS NULL OR (merchant_country = upper(merchant_country) AND merchant_country ~ '^[A-Z]{2}$')),
  default_currency text CHECK (default_currency IS NULL OR (default_currency = lower(default_currency) AND default_currency ~ '^[a-z]{3}$')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (merchant_country IS NOT NULL AND default_currency IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.payment_site_settings (
  project_id uuid PRIMARY KEY REFERENCES public.platform_projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  currency text CHECK (currency IS NULL OR (currency = lower(currency) AND currency ~ '^[a-z]{3}$')),
  success_path text NOT NULL DEFAULT '/payment/success'
    CHECK (success_path LIKE '/%' AND success_path NOT LIKE '//%' AND char_length(success_path) <= 500),
  cancel_path text NOT NULL DEFAULT '/payment/cancel'
    CHECK (cancel_path LIKE '/%' AND cancel_path NOT LIKE '//%' AND char_length(cancel_path) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR currency IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.platform_projects(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_order_reference text NOT NULL CHECK (char_length(external_order_reference) BETWEEN 1 AND 160),
  idempotency_key uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 999999999999),
  currency text NOT NULL CHECK (currency = lower(currency) AND currency ~ '^[a-z]{3}$'),
  line_items jsonb NOT NULL CHECK (jsonb_typeof(line_items) = 'array' AND jsonb_array_length(line_items) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired', 'refunded')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_order_reference),
  UNIQUE (project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  checkout_url text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 999999999999),
  currency text NOT NULL CHECK (currency = lower(currency) AND currency ~ '^[a-z]{3}$'),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'open', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_request_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  event_id text PRIMARY KEY CHECK (char_length(event_id) BETWEEN 1 AND 255),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 200),
  object_id text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  lease_expires_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_requests_user_created_idx
  ON public.payment_requests (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_requests_project_status_idx
  ON public.payment_requests (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_attempts_request_created_idx
  ON public.payment_attempts (payment_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_attempts_intent_idx
  ON public.payment_attempts (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_one_active_per_request_idx
  ON public.payment_attempts (payment_request_id) WHERE status IN ('creating', 'open');
CREATE INDEX IF NOT EXISTS payment_webhook_events_status_idx
  ON public.payment_webhook_events (status, lease_expires_at) WHERE status <> 'processed';

ALTER TABLE public.payment_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_provider_settings, public.payment_site_settings,
  public.payment_requests, public.payment_attempts, public.payment_webhook_events
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_provider_settings,
  public.payment_site_settings, public.payment_requests, public.payment_attempts,
  public.payment_webhook_events TO service_role;

DROP POLICY IF EXISTS payment_provider_settings_service_role ON public.payment_provider_settings;
CREATE POLICY payment_provider_settings_service_role ON public.payment_provider_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS payment_site_settings_service_role ON public.payment_site_settings;
CREATE POLICY payment_site_settings_service_role ON public.payment_site_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS payment_requests_service_role ON public.payment_requests;
CREATE POLICY payment_requests_service_role ON public.payment_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS payment_attempts_service_role ON public.payment_attempts;
CREATE POLICY payment_attempts_service_role ON public.payment_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS payment_webhook_events_service_role ON public.payment_webhook_events;
CREATE POLICY payment_webhook_events_service_role ON public.payment_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS payment_provider_settings_set_updated_at ON public.payment_provider_settings;
CREATE TRIGGER payment_provider_settings_set_updated_at BEFORE UPDATE ON public.payment_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
DROP TRIGGER IF EXISTS payment_site_settings_set_updated_at ON public.payment_site_settings;
CREATE TRIGGER payment_site_settings_set_updated_at BEFORE UPDATE ON public.payment_site_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
DROP TRIGGER IF EXISTS payment_requests_set_updated_at ON public.payment_requests;
CREATE TRIGGER payment_requests_set_updated_at BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
DROP TRIGGER IF EXISTS payment_attempts_set_updated_at ON public.payment_attempts;
CREATE TRIGGER payment_attempts_set_updated_at BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
DROP TRIGGER IF EXISTS payment_webhook_events_set_updated_at ON public.payment_webhook_events;
CREATE TRIGGER payment_webhook_events_set_updated_at BEFORE UPDATE ON public.payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();

CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
  p_event_id text,
  p_event_type text,
  p_object_id text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  INSERT INTO public.payment_webhook_events (event_id, event_type, object_id, status, attempt_count, lease_expires_at)
  VALUES (p_event_id, p_event_type, p_object_id, 'processing', 1, now() + interval '2 minutes')
  ON CONFLICT (event_id) DO UPDATE SET
    event_type = EXCLUDED.event_type,
    object_id = EXCLUDED.object_id,
    status = 'processing',
    attempt_count = public.payment_webhook_events.attempt_count + 1,
    lease_expires_at = now() + interval '2 minutes',
    last_error_code = NULL,
    updated_at = now()
  WHERE public.payment_webhook_events.status = 'failed'
     OR (public.payment_webhook_events.status = 'processing'
         AND public.payment_webhook_events.lease_expires_at < now())
  RETURNING status INTO v_status;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT status INTO v_status FROM public.payment_webhook_events WHERE event_id = p_event_id;
  IF v_status = 'processed' THEN
    RETURN 'processed';
  END IF;
  RETURN 'busy';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event(text, text, text) TO service_role;

COMMENT ON TABLE public.payment_provider_settings IS 'Central non-secret payment provider mode and merchant eligibility settings; Stripe keys remain in server secrets.';
COMMENT ON TABLE public.payment_site_settings IS 'Per-site enablement and safe relative return paths for the shared central payment service.';
COMMENT ON TABLE public.payment_requests IS 'Immutable server-verified order totals and line-item snapshots prepared by trusted site adapters.';
COMMENT ON TABLE public.payment_attempts IS 'Stripe Checkout attempts for central payment requests; no card data is stored.';
COMMENT ON TABLE public.payment_webhook_events IS 'Idempotent Stripe webhook inbox; raw payloads and card data are intentionally not stored.';
COMMENT ON FUNCTION public.claim_payment_webhook_event(text, text, text) IS 'Atomically claims a verified Stripe event, with a short lease to handle concurrent or retried deliveries.';

INSERT INTO public.payment_provider_settings (provider, enabled, mode, merchant_country, default_currency)
VALUES ('stripe', false, 'test', NULL, NULL)
ON CONFLICT (provider) DO NOTHING;

-- A completed Checkout Session can still be awaiting an asynchronous payment method.
ALTER TABLE public.payment_attempts DROP CONSTRAINT IF EXISTS payment_attempts_status_check;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_status_check
  CHECK (status IN ('creating', 'open', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded'));
DROP INDEX IF EXISTS public.payment_attempts_one_active_per_request_idx;
CREATE UNIQUE INDEX payment_attempts_one_active_per_request_idx
  ON public.payment_attempts (payment_request_id) WHERE status IN ('creating', 'open', 'processing');

CREATE OR REPLACE FUNCTION public.guard_payment_request_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.external_order_reference IS DISTINCT FROM NEW.external_order_reference
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.line_items IS DISTINCT FROM NEW.line_items
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'Payment request order snapshot is immutable' USING ERRCODE = '22000';
  END IF;
  IF OLD.user_id IS DISTINCT FROM NEW.user_id AND NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment request owner cannot be reassigned' USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payment_requests_guard_snapshot ON public.payment_requests;
CREATE TRIGGER payment_requests_guard_snapshot BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_request_snapshot();
COMMENT ON FUNCTION public.guard_payment_request_snapshot() IS 'Prevents a site adapter from changing a payment total, currency, line items or owner after payment request creation.';

-- Map Central Auth users to Stripe Customer IDs so Checkout can prefill the verified
-- account email and profile name. This does not save or expose card/payment-method data.
CREATE TABLE IF NOT EXISTS public.payment_customers (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  email_snapshot text NOT NULL CHECK (char_length(email_snapshot) BETWEEN 3 AND 254),
  name_snapshot text CHECK (name_snapshot IS NULL OR char_length(name_snapshot) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_customers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_customers TO service_role;
DROP POLICY IF EXISTS payment_customers_service_role ON public.payment_customers;
CREATE POLICY payment_customers_service_role ON public.payment_customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS payment_customers_set_updated_at ON public.payment_customers;
CREATE TRIGGER payment_customers_set_updated_at BEFORE UPDATE ON public.payment_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_updated_at();
COMMENT ON TABLE public.payment_customers IS 'Central Auth user to Stripe Customer mapping; stores no card or payment-method data.';
