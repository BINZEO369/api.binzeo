CREATE TABLE IF NOT EXISTS public.currency_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code varchar(10) NOT NULL UNIQUE,
  currency_name varchar(100) NOT NULL,
  currency_symbol varchar(10) NOT NULL,
  exchange_rate numeric(15,6) NOT NULL CHECK (exchange_rate > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT currency_rates_default_only_bdt CHECK (NOT is_default OR currency_code = 'BDT')
);

CREATE UNIQUE INDEX IF NOT EXISTS currency_rates_single_default_idx
  ON public.currency_rates (is_default) WHERE is_default = true;

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS currency_rates_public_read_active ON public.currency_rates;
CREATE POLICY currency_rates_public_read_active
  ON public.currency_rates FOR SELECT TO anon, authenticated
  USING (is_active = true);
GRANT SELECT ON public.currency_rates TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_currency_rates_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS currency_rates_updated_at_trigger ON public.currency_rates;
CREATE TRIGGER currency_rates_updated_at_trigger
  BEFORE UPDATE ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_currency_rates_updated_at();

WITH source_rows AS (
  SELECT DISTINCT ON (upper(currency_code))
    upper(currency_code) AS currency_code,
    currency_symbol,
    exchange_rate::numeric AS legacy_bdt_per_unit,
    is_active,
    is_default
  FROM public.footer_country_selector
  WHERE currency_code IS NOT NULL AND currency_symbol IS NOT NULL
  ORDER BY upper(currency_code), is_default DESC, sort_order ASC
)
INSERT INTO public.currency_rates
  (currency_code, currency_name, currency_symbol, exchange_rate, is_active, is_default)
SELECT
  currency_code,
  CASE currency_code
    WHEN 'BDT' THEN 'Bangladeshi Taka'
    WHEN 'USD' THEN 'US Dollar'
    WHEN 'GBP' THEN 'British Pound Sterling'
    WHEN 'INR' THEN 'Indian Rupee'
    WHEN 'SAR' THEN 'Saudi Riyal'
    ELSE currency_code
  END,
  currency_symbol,
  CASE WHEN currency_code = 'BDT' THEN 1 ELSE round(1 / NULLIF(legacy_bdt_per_unit, 0), 6) END,
  is_active,
  currency_code = 'BDT'
FROM source_rows
WHERE is_active = true AND legacy_bdt_per_unit > 0
ON CONFLICT (currency_code) DO NOTHING;
