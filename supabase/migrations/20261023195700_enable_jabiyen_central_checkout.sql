BEGIN;

-- The Auth payment page is the only customer-facing Stripe entry point.
-- This origin is also checked by the Central Auth cookie-session bridge.
UPDATE public.platform_projects
SET allowed_origins = CASE
  WHEN 'https://auth-binzeo.vercel.app' = ANY(allowed_origins) THEN allowed_origins
  ELSE array_append(allowed_origins, 'https://auth-binzeo.vercel.app')
END
WHERE project_key = 'jabiyen';

-- Store the selected merchant configuration centrally. Actual charges remain fail-closed
-- until live Stripe secrets and STRIPE_LIVE_CHARGES_ENABLED=true are set in Vercel.
INSERT INTO public.payment_provider_settings (
  provider, enabled, mode, merchant_country, default_currency
) VALUES (
  'stripe', true, 'live', 'US', 'usd'
)
ON CONFLICT (provider) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  mode = EXCLUDED.mode,
  merchant_country = EXCLUDED.merchant_country,
  default_currency = EXCLUDED.default_currency;

INSERT INTO public.payment_site_settings (
  project_id, enabled, currency, success_path, cancel_path
)
SELECT
  id, true, 'usd', '/payment?payment=success', '/payment?payment=cancelled'
FROM public.platform_projects
WHERE project_key = 'jabiyen'
ON CONFLICT (project_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  currency = EXCLUDED.currency,
  success_path = EXCLUDED.success_path,
  cancel_path = EXCLUDED.cancel_path;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_projects WHERE project_key = 'jabiyen') THEN
    RAISE EXCEPTION 'JABIYEN central project is not registered';
  END IF;
END;
$$;

COMMIT;
