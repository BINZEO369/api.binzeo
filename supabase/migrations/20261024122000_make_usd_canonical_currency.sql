begin;

-- Product and variant prices entered by the admin are canonical USD amounts.
alter table if exists public.products
  add column if not exists currency text not null default 'USD';
update public.products set currency = 'USD' where currency is null or currency <> 'USD';
alter table public.products drop constraint if exists products_currency_check;
alter table public.products
  add constraint products_currency_check check (currency = 'USD');

alter table if exists public.product_variants
  add column if not exists currency text not null default 'USD';
update public.product_variants set currency = 'USD' where currency is null or currency <> 'USD';
alter table public.product_variants drop constraint if exists product_variants_currency_check;
alter table public.product_variants
  add constraint product_variants_currency_check check (currency = 'USD');

-- Existing rates were stored as foreign currency per 1 BDT. Normalize them
-- to foreign currency per 1 USD, preserving their relative values.
do $$
declare
  v_usd_per_bdt numeric;
begin
  select exchange_rate into v_usd_per_bdt
    from public.currency_rates
   where upper(currency_code) = 'USD'
   limit 1;
  if v_usd_per_bdt is null or v_usd_per_bdt <= 0 then
    raise exception 'USD currency rate is required before switching the base currency';
  end if;

  alter table public.currency_rates
    drop constraint if exists currency_rates_default_only_bdt;
  update public.currency_rates
     set exchange_rate = case
       when upper(currency_code) = 'USD' then 1
       else round(exchange_rate / v_usd_per_bdt, 6)
     end,
         is_default = (upper(currency_code) = 'USD');
  alter table public.currency_rates
    add constraint currency_rates_default_only_usd
    check (not is_default or upper(currency_code) = 'USD');
end;
$$;

-- New order amounts are USD; historical BDT orders remain auditable as-is.
alter table if exists public.checkout_sessions
  alter column currency set default 'USD';
alter table public.checkout_sessions drop constraint if exists checkout_sessions_currency_check;
alter table public.checkout_sessions
  add constraint checkout_sessions_currency_check check (currency in ('BDT', 'USD'));

alter table if exists public.order_payments
  alter column currency set default 'USD';
alter table public.order_payments drop constraint if exists order_payments_currency_check;
alter table public.order_payments
  add constraint order_payments_currency_check check (currency in ('BDT', 'USD'));

commit;
