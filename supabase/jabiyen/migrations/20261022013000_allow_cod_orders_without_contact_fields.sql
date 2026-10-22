begin;

-- A signed-in Central Auth account plus a saved address is sufficient to place a COD order.
-- Keep the order tables protected by RLS and keep writes behind the service-role-only RPC.
alter table public.checkout_sessions
  alter column customer_name drop not null,
  alter column customer_phone drop not null;
alter table public.checkout_sessions
  drop constraint if exists checkout_sessions_customer_name_check,
  drop constraint if exists checkout_sessions_customer_phone_check;
alter table public.checkout_sessions
  add constraint checkout_sessions_customer_name_check
    check (customer_name is null or char_length(customer_name) between 2 and 120),
  add constraint checkout_sessions_customer_phone_check
    check (customer_phone is null or char_length(customer_phone) between 8 and 24);

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

  select o.id, o.order_number, o.status, o.created_at, c.subtotal, c.delivery_fee, c.total_amount
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
  if (v_name is not null and char_length(v_name) not between 2 and 120)
     or (v_phone is not null and char_length(v_phone) not between 8 and 24)
     or v_address is null or jsonb_typeof(v_address) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'message', 'A saved delivery address is required.');
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

  insert into public.checkout_sessions (
    idempotency_key, customer_name, customer_phone, customer_email, shipping_address,
    delivery_notes, subtotal, delivery_fee, total_amount, delivery_fee_status,
    payment_method, status, request_fingerprint
  ) values (
    p_idempotency_key, v_name, v_phone, v_email, v_address,
    v_notes, v_subtotal, null, null, 'to_be_confirmed',
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
  values (v_order_id, 'cod', 'awaiting_collection', 'BDT', null);
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (v_order_id, null, 'pending_confirmation', 'system', 'COD order submitted from JABIYEN website');

  return jsonb_build_object('ok', true, 'duplicate', false, 'order', jsonb_build_object(
    'order_number', v_order_number,
    'status', 'pending_confirmation',
    'created_at', v_created_at,
    'subtotal', v_subtotal,
    'delivery_fee', null,
    'total_amount', null,
    'currency', 'BDT',
    'payment_method', 'cod',
    'item_count', v_line_count
  ));
end;
$$;

commit;
