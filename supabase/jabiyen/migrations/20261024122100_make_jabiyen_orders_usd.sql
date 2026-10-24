begin;

-- Shipping rules and newly-created order totals use USD, matching product prices.
alter table if exists public.shipping_fees
  add column if not exists currency text not null default 'USD';

do $$
declare
  v_bdt_per_usd numeric;
begin
  select exchange_rate into v_bdt_per_usd
    from public.currency_rates
   where upper(currency_code) = 'BDT'
   limit 1;
  if v_bdt_per_usd is null or v_bdt_per_usd <= 0 then
    raise exception 'BDT currency rate is required before converting shipping fees to USD';
  end if;
  update public.shipping_fees
     set delivery_fee = round(delivery_fee / v_bdt_per_usd, 2),
         free_shipping_minimum = round(free_shipping_minimum / v_bdt_per_usd, 2),
         currency = 'USD'
   where currency = 'BDT';
end;
$$;

alter table public.shipping_fees drop constraint if exists shipping_fees_currency_check;
alter table public.shipping_fees
  add constraint shipping_fees_currency_check check (currency = 'USD');

-- Preserve the existing, tested order logic while changing only its currency literals.
do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.get_jabiyen_shipping_quote(text,text,text,text,text,numeric)',
    'public.create_jabiyen_cod_order(uuid,text,text,jsonb,jsonb)'
  ] loop
    execute replace(
      replace(pg_get_functiondef(v_function::regprocedure), '''BDT''', '''USD'''),
      'calculated in BDT', 'calculated in USD'
    );
  end loop;
end;
$$;

commit;
