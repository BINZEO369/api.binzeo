BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payment_provider_settings
    WHERE default_currency IS NOT NULL AND default_currency <> 'usd'
  ) THEN
    RAISE EXCEPTION 'Cannot enforce USD-only payments: provider currency is not USD';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_site_settings
    WHERE currency IS NOT NULL AND currency <> 'usd'
  ) THEN
    RAISE EXCEPTION 'Cannot enforce USD-only payments: a site currency is not USD';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_requests WHERE currency <> 'usd') THEN
    RAISE EXCEPTION 'Cannot enforce USD-only payments: a payment request is not USD';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_attempts WHERE currency <> 'usd') THEN
    RAISE EXCEPTION 'Cannot enforce USD-only payments: a payment attempt is not USD';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_projects WHERE project_key = 'jabiyen') THEN
    RAISE EXCEPTION 'JABIYEN central project is not registered';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_provider_settings_default_currency_usd_check' AND conrelid = 'public.payment_provider_settings'::regclass) THEN
    ALTER TABLE public.payment_provider_settings
      ADD CONSTRAINT payment_provider_settings_default_currency_usd_check
      CHECK (default_currency IS NULL OR default_currency = 'usd');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_site_settings_currency_usd_check' AND conrelid = 'public.payment_site_settings'::regclass) THEN
    ALTER TABLE public.payment_site_settings
      ADD CONSTRAINT payment_site_settings_currency_usd_check
      CHECK (currency IS NULL OR currency = 'usd');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_currency_usd_check' AND conrelid = 'public.payment_requests'::regclass) THEN
    ALTER TABLE public.payment_requests
      ADD CONSTRAINT payment_requests_currency_usd_check CHECK (currency = 'usd');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_currency_usd_check' AND conrelid = 'public.payment_attempts'::regclass) THEN
    ALTER TABLE public.payment_attempts
      ADD CONSTRAINT payment_attempts_currency_usd_check CHECK (currency = 'usd');
  END IF;
END;
$$;

-- This is an explicit site allowlist. New site settings are disabled by default;
-- activating a website remains a deliberate database configuration change.
COMMENT ON COLUMN public.payment_site_settings.enabled IS
  'Explicit central payment allowlist gate. Defaults to false; a site must also be active and have an allowlisted origin before checkout is accepted.';
COMMENT ON COLUMN public.payment_site_settings.currency IS
  'Central Checkout currency. All enabled payment sites must use USD.';

-- Keep only the user-confirmed JABIYEN storefront and central Auth payment page.
-- The previously configured jayenware.shop origins were explicitly disowned by the user.
UPDATE public.platform_projects
SET allowed_origins = ARRAY[
  'https://jabiyen-website.vercel.app',
  'https://auth-binzeo.vercel.app'
]
WHERE project_key = 'jabiyen';

INSERT INTO public.payment_site_settings (
  project_id, enabled, currency, success_path, cancel_path
)
SELECT id, true, 'usd', '/payment?payment=success', '/payment?payment=cancelled'
FROM public.platform_projects
WHERE project_key = 'jabiyen'
ON CONFLICT (project_id) DO UPDATE SET
  enabled = true,
  currency = 'usd';

-- No other website is enabled by this baseline. Future sites must be opted in
-- explicitly by inserting/updating their payment_site_settings row in the DB.
UPDATE public.payment_site_settings AS settings
SET enabled = false
FROM public.platform_projects AS project
WHERE project.id = settings.project_id
  AND project.project_key <> 'jabiyen';

COMMIT;
