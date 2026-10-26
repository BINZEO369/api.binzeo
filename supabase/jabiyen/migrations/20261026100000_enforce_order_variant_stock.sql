-- Enforce variant stock at the database boundary.
-- The checkout RPC already derives product/variant names and prices from trusted
-- database rows. This trigger makes the stock reservation atomic with the
-- order_items insert, so client-edited cart data cannot bypass inventory.

create or replace function public.reserve_jabiyen_variant_stock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_remaining_stock integer;
begin
  if new.variant_id is null then
    return new;
  end if;

  if new.product_id is null or new.quantity is null or new.quantity < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Invalid order item quantity or product.';
  end if;

  update public.product_variants pv
     set stock = pv.stock - new.quantity,
         updated_at = now()
   where pv.id = new.variant_id
     and pv.product_id = new.product_id
     and coalesce(pv.is_active, false)
     and coalesce(pv.stock, 0) >= new.quantity
   returning pv.stock into v_remaining_stock;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Selected variant is inactive or does not have enough stock.';
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_reserve_jabiyen_variant_stock on public.order_items;
create trigger order_items_reserve_jabiyen_variant_stock
before insert on public.order_items
for each row
execute function public.reserve_jabiyen_variant_stock();

revoke all on function public.reserve_jabiyen_variant_stock() from public, anon, authenticated;
grant execute on function public.reserve_jabiyen_variant_stock() to service_role;
