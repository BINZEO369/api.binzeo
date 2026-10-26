-- Product admin filters and archive/restore actions rely on this column.
-- Existing products remain visible after the migration.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.products
SET is_active = TRUE
WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_is_active
  ON public.products(is_active);
