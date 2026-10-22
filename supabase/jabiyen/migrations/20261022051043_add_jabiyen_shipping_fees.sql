begin;

create table if not exists public.shipping_fees (
  id uuid primary key default gen_random_uuid(),
  country_code varchar(2) not null check (country_code ~ '^[A-Z]{2}$'),
  country_name varchar(100) not null check (char_length(btrim(country_name)) between 2 and 100),
  state varchar(120) not null default '*',
  city varchar(120) not null default '*',
  postal_code varchar(20),
  delivery_type varchar(16) not null check (delivery_type in ('Standard', 'Express')),
  delivery_fee numeric(12,2) not null check (delivery_fee >= 0),
  free_shipping_minimum numeric(12,2) not null default 0 check (free_shipping_minimum >= 0),
  estimated_days_min integer not null check (estimated_days_min > 0),
  estimated_days_max integer not null check (estimated_days_max >= estimated_days_min),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shipping_fees_location_type_unique
  on public.shipping_fees (
    country_code,
    lower(state),
    lower(city),
    coalesce(postal_code, ''),
    delivery_type
  );
create index if not exists shipping_fees_active_country_idx
  on public.shipping_fees (country_code, is_active, delivery_type);

alter table public.shipping_fees enable row level security;
revoke all on table public.shipping_fees from anon, authenticated;
grant all on table public.shipping_fees to service_role;

create or replace function public.set_shipping_fees_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shipping_fees_set_updated_at on public.shipping_fees;
create trigger shipping_fees_set_updated_at
before update on public.shipping_fees
for each row execute function public.set_shipping_fees_updated_at();

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

-- Suggested initial BDT rate card. Exact location rules take precedence over wildcards.
insert into public.shipping_fees (
  country_code, country_name, state, city, postal_code, delivery_type,
  delivery_fee, free_shipping_minimum, estimated_days_min, estimated_days_max, is_active
) values
  ('BD', 'Bangladesh', 'Dhaka', '*', null, 'Standard', 80, 9999999999.99, 2, 3, true),
  ('BD', 'Bangladesh', 'Dhaka', '*', null, 'Express', 150, 9999999999.99, 1, 2, true),
  ('BD', 'Bangladesh', '*', '*', null, 'Standard', 120, 9999999999.99, 3, 5, true),
  ('BD', 'Bangladesh', '*', '*', null, 'Express', 220, 9999999999.99, 2, 3, true),
  ('US', 'United States', '*', '*', null, 'Standard', 6000, 9999999999.99, 12, 21, true),
  ('US', 'United States', '*', '*', null, 'Express', 10000, 9999999999.99, 7, 12, true)
on conflict do nothing;

alter table public.checkout_sessions
  add column if not exists delivery_type text not null default 'Standard',
  add column if not exists estimated_days_min integer,
  add column if not exists estimated_days_max integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'checkout_sessions_delivery_type_check'
       and conrelid = 'public.checkout_sessions'::regclass
  ) then
    alter table public.checkout_sessions
      add constraint checkout_sessions_delivery_type_check
      check (delivery_type in ('Standard', 'Express'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'checkout_sessions_estimated_days_check'
       and conrelid = 'public.checkout_sessions'::regclass
  ) then
    alter table public.checkout_sessions
      add constraint checkout_sessions_estimated_days_check
      check (
        (estimated_days_min is null and estimated_days_max is null)
        or (estimated_days_min > 0 and estimated_days_max >= estimated_days_min)
      );
  end if;
end;
$$;

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
     and (
       sf.postal_code is null or btrim(sf.postal_code) = ''
       or lower(btrim(sf.postal_code)) = lower(v_postal_code)
     )
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
  return jsonb_build_object(
    'ok', true,
    'quote', jsonb_build_object(
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
    )
  );
end;
$$;

create or replace function public.create_jabiyen_cod_order(
  p_idempotency_key uuid,
  p_access_token_hash text,
  p_request_fingerprint text,
  p_customer jsonb,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing record;
  v_item jsonb;
  v_product record;
  v_product_id bigint;
  v_variant_id bigint;
  v_variant_name text;
  v_variant_sku text;
  v_variant_stock integer;
  v_variant_is_active boolean;
  v_color_name text;
  v_size_name text;
  v_quantity integer;
  v_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_line_count integer := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_order_id uuid;
  v_checkout_id uuid;
  v_order_number text;
  v_created_at timestamptz;
  v_name text;
  v_phone text;
  v_email text;
  v_address jsonb;
  v_notes text;
  v_ip_fingerprint text;
  v_count integer;
  v_delivery_type text;
  v_expected_delivery_fee numeric(12,2);
  v_shipping_quote jsonb;
  v_delivery_fee numeric(12,2);
  v_total_amount numeric(12,2);
  v_estimated_days_min integer;
  v_estimated_days_max integer;
begin
  if p_idempotency_key is null or p_access_token_hash is null or p_access_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST', 'message', 'Checkout request is invalid.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS', 'message', 'The cart must contain between 1 and 20 items.');
  end if;
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'message', 'Customer and delivery details are required.');
  end if;

  select o.id, o.order_number, o.status, o.created_at, c.subtotal, c.delivery_fee, c.total_amount,
         c.delivery_type, c.estimated_days_min, c.estimated_days_max
    into v_existing
    from public.orders o
    join public.checkout_sessions c on c.id = o.checkout_id
   where c.idempotency_key = p_idempotency_key
     and o.access_token_hash = p_access_token_hash;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'order', jsonb_build_object(
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'created_at', v_existing.created_at,
      'subtotal', v_existing.subtotal,
      'delivery_fee', v_existing.delivery_fee,
      'total_amount', v_existing.total_amount,
      'delivery_type', v_existing.delivery_type,
      'estimated_days_min', v_existing.estimated_days_min,
      'estimated_days_max', v_existing.estimated_days_max,
      'currency', 'BDT',
      'payment_method', 'cod',
      'item_count', (select count(*) from public.order_items where order_id = v_existing.id)
    ));
  end if;
  if exists (select 1 from public.checkout_sessions where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This checkout request was already submitted.');
  end if;

  v_name := nullif(btrim(coalesce(p_customer->>'name', '')), '');
  v_phone := nullif(btrim(coalesce(p_customer->>'phone', '')), '');
  v_email := nullif(btrim(coalesce(p_customer->>'email', '')), '');
  v_address := p_customer->'address';
  v_notes := nullif(btrim(coalesce(p_customer->>'delivery_notes', '')), '');
  v_ip_fingerprint := nullif(p_request_fingerprint, '');
  v_delivery_type := coalesce(nullif(p_customer->>'delivery_type', ''), 'Standard');
  v_expected_delivery_fee := nullif(p_customer->>'quoted_delivery_fee', '')::numeric(12,2);
  if (v_name is not null and char_length(v_name) not between 2 and 120)
     or (v_phone is not null and char_length(v_phone) not between 8 and 24)
     or v_address is null or jsonb_typeof(v_address) <> 'object'
     or v_delivery_type not in ('Standard', 'Express') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'message', 'A saved delivery address and delivery type are required.');
  end if;

  if v_ip_fingerprint is not null then
    select count(*) into v_count
      from public.checkout_sessions
     where request_fingerprint = v_ip_fingerprint
       and created_at > now() - interval '10 minutes';
    if v_count >= 5 then
      return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', 'Too many checkout submissions. Please try again later.');
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product_id := (v_item->>'product_id')::bigint;
      v_quantity := (v_item->>'quantity')::integer;
      v_variant_id := nullif(v_item->>'variant_id', '')::bigint;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS', 'message', 'One or more cart items are invalid.');
    end;
    if v_product_id is null or v_quantity is null or v_quantity < 1 or v_quantity > 10 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS', 'message', 'One or more cart items are invalid.');
    end if;

    select p.id, p.title, p.img, p.price, p.is_out_of_stock
      into v_product
      from public.products p
     where p.id = v_product_id
     for share;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_UNAVAILABLE', 'message', 'A product in your cart is no longer available.');
    end if;
    if coalesce(v_product.is_out_of_stock, false) then
      return jsonb_build_object('ok', false, 'code', 'OUT_OF_STOCK', 'message', 'A product in your cart is out of stock.');
    end if;

    v_variant_name := null;
    v_variant_sku := null;
    v_variant_stock := null;
    v_variant_is_active := null;
    v_color_name := null;
    v_size_name := null;
    if v_variant_id is not null then
      select pv.name, pv.sku, pv.stock, pv.is_active, pc.color_name, cs.size_name, pv.price
        into v_variant_name, v_variant_sku, v_variant_stock, v_variant_is_active, v_color_name, v_size_name, v_price
        from public.product_variants pv
        left join public.product_colors pc on pc.id = pv.color_id
        left join public.color_sizes cs on cs.id = pv.size_id
       where pv.id = v_variant_id and pv.product_id = v_product_id
       for share of pv;
      if not found or not coalesce(v_variant_is_active, false) then
        return jsonb_build_object('ok', false, 'code', 'VARIANT_UNAVAILABLE', 'message', 'A selected size or colour is no longer available.');
      end if;
      if coalesce(v_variant_stock, 0) < v_quantity then
        return jsonb_build_object('ok', false, 'code', 'OUT_OF_STOCK', 'message', 'There is not enough stock for a selected size or colour.');
      end if;
    else
      if exists (select 1 from public.product_variants pv where pv.product_id = v_product_id) then
        return jsonb_build_object('ok', false, 'code', 'VARIANT_REQUIRED', 'message', 'Please select a size and colour for each item.');
      end if;
      v_price := v_product.price;
    end if;
    if v_price is null or v_price < 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_PRICE', 'message', 'A product price is not available. Please contact the store.');
    end if;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_line_count := v_line_count + 1;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'variant_id', v_variant_id,
      'product_name', v_product.title,
      'variant_name', v_variant_name,
      'sku', coalesce(v_variant_sku, case when v_variant_id is null then null else v_product.id::text end),
      'color_name', v_color_name,
      'size_name', v_size_name,
      'image_url', v_product.img,
      'quantity', v_quantity,
      'unit_price', v_price,
      'line_total', v_price * v_quantity
    ));
  end loop;

  if v_subtotal <= 0 or v_subtotal > 10000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TOTAL', 'message', 'The cart total is invalid.');
  end if;

  v_shipping_quote := public.get_jabiyen_shipping_quote(
    v_address->>'country_code',
    coalesce(v_address->>'state', v_address->>'state_province', v_address->>'district', ''),
    coalesce(v_address->>'city', ''),
    coalesce(v_address->>'postal_code', ''),
    v_delivery_type,
    v_subtotal
  );
  if not coalesce((v_shipping_quote->>'ok')::boolean, false) then
    return v_shipping_quote;
  end if;
  v_delivery_fee := (v_shipping_quote->'quote'->>'delivery_fee')::numeric(12,2);
  v_estimated_days_min := (v_shipping_quote->'quote'->>'estimated_days_min')::integer;
  v_estimated_days_max := (v_shipping_quote->'quote'->>'estimated_days_max')::integer;
  if v_expected_delivery_fee is not null and v_expected_delivery_fee <> v_delivery_fee then
    return jsonb_build_object(
      'ok', false,
      'code', 'SHIPPING_QUOTE_CHANGED',
      'message', 'The delivery fee changed. Please return to checkout and review the updated fee.'
    );
  end if;
  v_total_amount := case when v_delivery_fee is null then null else v_subtotal + v_delivery_fee end;

  insert into public.checkout_sessions (
    idempotency_key, customer_name, customer_phone, customer_email, shipping_address,
    delivery_notes, subtotal, delivery_fee, total_amount, delivery_fee_status,
    delivery_type, estimated_days_min, estimated_days_max,
    payment_method, status, request_fingerprint
  ) values (
    p_idempotency_key, v_name, v_phone, v_email, v_address,
    v_notes, v_subtotal, v_delivery_fee, v_total_amount,
    case when v_delivery_fee is null then 'to_be_confirmed' else 'confirmed' end,
    v_delivery_type, v_estimated_days_min, v_estimated_days_max,
    'cod', 'converted', v_ip_fingerprint
  ) returning id, created_at into v_checkout_id, v_created_at;

  v_order_number := 'JBY-' || to_char(v_created_at at time zone 'Asia/Dhaka', 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (order_number, checkout_id, status, access_token_hash)
  values (v_order_number, v_checkout_id, 'pending_confirmation', p_access_token_hash)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_snapshot) loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_name, sku,
      color_name, size_name, image_url, quantity, unit_price, line_total
    ) values (
      v_order_id,
      (v_item->>'product_id')::bigint,
      nullif(v_item->>'variant_id', '')::bigint,
      v_item->>'product_name', v_item->>'variant_name', v_item->>'sku',
      v_item->>'color_name', v_item->>'size_name', v_item->>'image_url',
      (v_item->>'quantity')::integer, (v_item->>'unit_price')::numeric, (v_item->>'line_total')::numeric
    );
  end loop;

  insert into public.order_payments (order_id, method, status, currency, amount_due)
  values (v_order_id, 'cod', 'awaiting_collection', 'BDT', v_total_amount);
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (
    v_order_id, null, 'pending_confirmation', 'system',
    case when v_delivery_fee is null then 'COD order submitted; delivery charge to be advised later.' else 'COD order submitted; delivery fee calculated in BDT.' end
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'order', jsonb_build_object(
    'order_number', v_order_number,
    'status', 'pending_confirmation',
    'created_at', v_created_at,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'total_amount', v_total_amount,
    'delivery_type', v_delivery_type,
    'estimated_days_min', v_estimated_days_min,
    'estimated_days_max', v_estimated_days_max,
    'currency', 'BDT',
    'payment_method', 'cod',
    'item_count', v_line_count
  ));
end;
$$;

create or replace function public.get_jabiyen_public_order(
  p_order_number text,
  p_access_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'customer', jsonb_build_object(
      'name', c.customer_name,
      'phone', c.customer_phone,
      'email', c.customer_email
    ),
    'shipping_address', c.shipping_address,
    'delivery_notes', c.delivery_notes,
    'subtotal', c.subtotal,
    'delivery_fee', c.delivery_fee,
    'total_amount', c.total_amount,
    'delivery_fee_status', c.delivery_fee_status,
    'delivery_type', c.delivery_type,
    'estimated_days_min', c.estimated_days_min,
    'estimated_days_max', c.estimated_days_max,
    'currency', c.currency,
    'payment', jsonb_build_object(
      'method', p.method,
      'status', p.status,
      'amount_due', p.amount_due,
      'currency', p.currency
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', i.product_name,
        'variant_name', i.variant_name,
        'sku', i.sku,
        'color_name', i.color_name,
        'size_name', i.size_name,
        'image_url', i.image_url,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'line_total', i.line_total
      ) order by i.created_at, i.id)
        from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  ) into v_result
    from public.orders o
    join public.checkout_sessions c on c.id = o.checkout_id
    join public.order_payments p on p.order_id = o.id
   where o.order_number = p_order_number
     and o.access_token_hash = p_access_token_hash;
  return v_result;
end;
$$;

revoke all on function public.set_shipping_fees_updated_at() from public, anon, authenticated;
revoke all on function public.set_checkout_delivery_fee_status() from public, anon, authenticated;
revoke all on function public.get_jabiyen_shipping_quote(text, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.create_jabiyen_cod_order(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.get_jabiyen_public_order(text, text) from public, anon, authenticated;
grant execute on function public.get_jabiyen_shipping_quote(text, text, text, text, text, numeric) to service_role;
grant execute on function public.create_jabiyen_cod_order(uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.get_jabiyen_public_order(text, text) to service_role;
grant execute on function public.set_shipping_fees_updated_at() to service_role;
grant execute on function public.set_checkout_delivery_fee_status() to service_role;

commit;
