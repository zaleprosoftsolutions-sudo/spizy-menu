-- Spizy Inventory / Stock Management foundation
-- Adds stock tracking fields, movement ledger and safe stock-adjustment RPC.

alter table public.menu_items
add column if not exists track_stock boolean not null default false,
add column if not exists stock_quantity numeric(12,3) not null default 0,
add column if not exists low_stock_quantity numeric(12,3) not null default 5,
add column if not exists stock_unit text not null default 'pcs';

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  order_id uuid references public.restaurant_orders(id) on delete set null,
  order_item_id uuid references public.restaurant_order_items(id) on delete set null,
  movement_type text not null,
  quantity_delta numeric(12,3) not null,
  previous_stock numeric(12,3) not null default 0,
  new_stock numeric(12,3) not null default 0,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_movement_type_check check (
    movement_type in (
      'opening',
      'purchase',
      'adjustment_add',
      'adjustment_remove',
      'waste',
      'return',
      'sale'
    )
  )
);

create index if not exists inventory_movements_restaurant_created_idx
on public.inventory_movements (restaurant_id, created_at desc);

create index if not exists inventory_movements_item_created_idx
on public.inventory_movements (item_id, created_at desc);

create index if not exists menu_items_stock_alert_idx
on public.menu_items (restaurant_id, track_stock, stock_quantity, low_stock_quantity)
where is_deleted = false;

alter table public.inventory_movements enable row level security;

drop policy if exists "Inventory movements select access" on public.inventory_movements;
drop policy if exists "Inventory movements insert access" on public.inventory_movements;

create policy "Inventory movements select access"
on public.inventory_movements
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Inventory movements insert access"
on public.inventory_movements
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.adjust_inventory_stock(
  p_restaurant_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text default null
)
returns table (
  item_id uuid,
  previous_stock numeric,
  new_stock numeric,
  quantity_delta numeric,
  movement_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_stock numeric(12,3);
  v_new_stock numeric(12,3);
  v_delta numeric(12,3);
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  if p_movement_type not in (
    'opening',
    'purchase',
    'adjustment_add',
    'adjustment_remove',
    'waste',
    'return',
    'sale'
  ) then
    raise exception 'Invalid movement type.';
  end if;

  if not (
    public.is_restaurant_member(p_restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this restaurant inventory.';
  end if;

  select coalesce(mi.stock_quantity, 0)
    into v_old_stock
  from public.menu_items mi
  where mi.id = p_item_id
    and mi.restaurant_id = p_restaurant_id
    and coalesce(mi.is_deleted, false) = false
  for update;

  if v_old_stock is null then
    raise exception 'Menu item not found.';
  end if;

  if p_movement_type = 'opening' then
    v_delta := p_quantity - v_old_stock;
    v_new_stock := p_quantity;
  elsif p_movement_type in ('purchase', 'adjustment_add', 'return') then
    v_delta := p_quantity;
    v_new_stock := v_old_stock + p_quantity;
  else
    v_delta := p_quantity * -1;
    v_new_stock := greatest(v_old_stock - p_quantity, 0);
  end if;

  update public.menu_items
  set
    track_stock = true,
    stock_quantity = v_new_stock
  where id = p_item_id
    and restaurant_id = p_restaurant_id;

  insert into public.inventory_movements (
    restaurant_id,
    item_id,
    movement_type,
    quantity_delta,
    previous_stock,
    new_stock,
    reason,
    created_by
  )
  values (
    p_restaurant_id,
    p_item_id,
    p_movement_type,
    v_delta,
    v_old_stock,
    v_new_stock,
    nullif(trim(coalesce(p_reason, '')), ''),
    auth.uid()
  )
  returning id into v_movement_id;

  return query
  select
    p_item_id,
    v_old_stock,
    v_new_stock,
    v_delta,
    v_movement_id;
end;
$$;

grant execute on function public.adjust_inventory_stock(uuid, uuid, text, numeric, text) to authenticated;
