BEGIN;

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_requests_fulfillment_status_check'
      AND conrelid = 'public.payment_requests'::regclass
  ) THEN
    ALTER TABLE public.payment_requests
      ADD CONSTRAINT payment_requests_fulfillment_status_check
      CHECK (fulfillment_status IN ('not_required', 'pending', 'fulfilled'));
  END IF;
END;
$$;

ALTER TABLE public.payment_site_settings
  ADD COLUMN IF NOT EXISTS order_return_origin text,
  ADD COLUMN IF NOT EXISTS order_return_path text NOT NULL DEFAULT '/order-confirmation?order={ORDER_NUMBER}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_site_settings_order_return_origin_check'
      AND conrelid = 'public.payment_site_settings'::regclass
  ) THEN
    ALTER TABLE public.payment_site_settings
      ADD CONSTRAINT payment_site_settings_order_return_origin_check
      CHECK (order_return_origin IS NULL OR order_return_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_site_settings_order_return_path_check'
      AND conrelid = 'public.payment_site_settings'::regclass
  ) THEN
    ALTER TABLE public.payment_site_settings
      ADD CONSTRAINT payment_site_settings_order_return_path_check
      CHECK (
        order_return_path LIKE '/%'
        AND order_return_path NOT LIKE '//%'
        AND position('#' in order_return_path) = 0
        AND char_length(order_return_path) <= 500
      );
  END IF;
END;
$$;

-- The order return host is configuration, not a URL hard-coded in the Auth frontend.
-- The API also requires this origin to remain in platform_projects.allowed_origins.
UPDATE public.payment_site_settings AS settings
SET order_return_origin = 'https://jabiyen-website.vercel.app',
    order_return_path = '/order-confirmation?order={ORDER_NUMBER}',
    updated_at = now()
FROM public.platform_projects AS project
WHERE settings.project_id = project.id
  AND project.project_key = 'jabiyen'
  AND 'https://jabiyen-website.vercel.app' = ANY(project.allowed_origins);

CREATE TABLE IF NOT EXISTS public.payment_return_handoffs (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  payment_request_id uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.platform_projects(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_order_reference text NOT NULL CHECK (char_length(external_order_reference) BETWEEN 1 AND 160),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_return_handoffs_expiry_idx
  ON public.payment_return_handoffs (expires_at) WHERE redeemed_at IS NULL;
CREATE INDEX IF NOT EXISTS payment_return_handoffs_request_idx
  ON public.payment_return_handoffs (payment_request_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_return_handoffs_one_active_per_request_idx
  ON public.payment_return_handoffs (payment_request_id)
  WHERE redeemed_at IS NULL;

ALTER TABLE public.payment_return_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_return_handoffs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_return_handoffs TO service_role;
DROP POLICY IF EXISTS payment_return_handoffs_service_role ON public.payment_return_handoffs;
CREATE POLICY payment_return_handoffs_service_role ON public.payment_return_handoffs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON COLUMN public.payment_requests.fulfillment_status IS 'Server-side fulfillment state; for JABIYEN this becomes fulfilled only after the signed Stripe webhook confirms the site order transition.';
COMMENT ON TABLE public.payment_return_handoffs IS 'Hashed, expiring, single-use capabilities for returning a webhook-verified paid order to its registered site; raw tokens are never stored.';
COMMENT ON COLUMN public.payment_site_settings.order_return_origin IS 'HTTPS origin for a post-payment one-time order handoff; must also be present in the project origin allowlist.';
COMMENT ON COLUMN public.payment_site_settings.order_return_path IS 'Relative path template for the order-confirmation handoff; {ORDER_NUMBER} is replaced server-side and the token is placed in the URL fragment.';

COMMIT;
