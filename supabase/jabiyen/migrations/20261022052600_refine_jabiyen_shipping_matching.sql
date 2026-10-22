begin;

update public.shipping_fees
   set free_shipping_minimum = 9999999999.99
 where is_active
   and country_code in ('BD', 'US')
   and delivery_fee > 0;

create or replace function public.get_jabiyen_shipping_quote(
  p_country_code text,
  p_state text,
  p_city text,
  p_postal_code text,
  p_delivery_type text,
  p_subtotal numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule public.shipping_fees%rowtype;
  v_fee numeric(12,2);
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_state text := btrim(coalesce(p_state, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_postal_code text := btrim(coalesce(p_postal_code, ''));
begin
  if v_country_code !~ '^[A-Z]{2}$'
     or p_delivery_type is null or p_delivery_type not in ('Standard', 'Express')
     or p_subtotal is null or p_subtotal < 0 or p_subtotal > 10000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SHIPPING_REQUEST', 'message', 'Delivery details are invalid.');
  end if;

  select sf.*
    into v_rule
    from public.shipping_fees sf
   where sf.is_active
     and sf.country_code = v_country_code
     and sf.delivery_type = p_delivery_type
     and (sf.state = '*' or lower(sf.state) = lower(v_state))
     and (sf.city = '*' or lower(sf.city) = lower(v_city))
     and (sf.postal_code is null or btrim(sf.postal_code) = '' or lower(btrim(sf.postal_code)) = lower(v_postal_code))
   order by
     case when sf.postal_code is not null and btrim(sf.postal_code) <> '' then 1 else 0 end desc,
     case when sf.state <> '*' then 1 else 0 end desc,
     case when sf.city <> '*' then 1 else 0 end desc,
     sf.created_at asc
   limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'quote', jsonb_build_object(
        'country_code', v_country_code,
        'country_name', case v_country_code when 'BD' then 'Bangladesh' when 'US' then 'United States' else v_country_code end,
        'state', v_state,
        'city', v_city,
        'delivery_type', p_delivery_type,
        'delivery_fee', null,
        'free_shipping_minimum', null,
        'estimated_days_min', null,
        'estimated_days_max', null,
        'quote_required', true,
        'message', 'আপনাকে পরে জানানো হবে',
        'currency', 'BDT'
      )
    );
  end if;

  v_fee := case when p_subtotal >= v_rule.free_shipping_minimum then 0 else v_rule.delivery_fee end;
  return jsonb_build_object('ok', true, 'quote', jsonb_build_object(
    'country_code', v_rule.country_code,
    'country_name', v_rule.country_name,
    'state', v_state,
    'city', v_city,
    'delivery_type', v_rule.delivery_type,
    'delivery_fee', v_fee,
    'base_delivery_fee', v_rule.delivery_fee,
    'free_shipping_minimum', v_rule.free_shipping_minimum,
    'estimated_days_min', v_rule.estimated_days_min,
    'estimated_days_max', v_rule.estimated_days_max,
    'currency', 'BDT'
  ));
end;
$$;

create or replace function public.set_checkout_delivery_fee_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.delivery_fee is null or new.total_amount is null then
    new.delivery_fee_status := 'to_be_confirmed';
  else
    new.delivery_fee_status := 'confirmed';
  end if;
  return new;
end;
$$;

drop trigger if exists checkout_sessions_set_delivery_fee_status on public.checkout_sessions;
create trigger checkout_sessions_set_delivery_fee_status
before insert or update of delivery_fee, total_amount on public.checkout_sessions
for each row execute function public.set_checkout_delivery_fee_status();

revoke all on function public.get_jabiyen_shipping_quote(text, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.set_checkout_delivery_fee_status() from public, anon, authenticated;
grant execute on function public.get_jabiyen_shipping_quote(text, text, text, text, text, numeric) to service_role;
grant execute on function public.set_checkout_delivery_fee_status() to service_role;

select pg_notify('pgrst', 'reload schema');
commit;
