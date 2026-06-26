-- Spizy Auto Stock Deduction foundation
-- Deducts inventory automatically from direct stock items or recipe ingredients when an order reaches a food-consumed status.
-- Safe and idempotent: the same order item will not deduct stock twice.

create table if not exists public.restaurant_order_stock_deductions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  order_item_id uuid not null references public.restaurant_order_items(id) on delete cascade,
  sold_menu_item_id uuid references public.menu_items(id) on delete set null,
  stock_item_id uuid not null references public.menu_items(id) on delete restrict,
  source_type text not null,
  quantity_sold numeric(12,3) not null default 0,
  quantity_deducted numeric(12,3) not null default 0,
  inventory_movement_id uuid references public.inventory_movements(id) on delete set null,
  is_restored boolean not null default false,
  restored_movement_id uuid references public.inventory_movements(id) on delete set null,
  restored_at timestamptz,
  created_at timestamptz not null default now(),
  constraint restaurant_order_stock_deductions_source_type_check check (source_type in ('direct', 'recipe')),
  constraint restaurant_order_stock_deductions_quantity_check check (quantity_deducted > 0),
  constraint restaurant_order_stock_deductions_unique_active unique (order_item_id, stock_item_id, source_type)
);

create index if not exists restaurant_order_stock_deductions_order_idx
on public.restaurant_order_stock_deductions (restaurant_id, order_id, created_at desc);

create index if not exists restaurant_order_stock_deductions_stock_item_idx
on public.restaurant_order_stock_deductions (stock_item_id, created_at desc);

alter table public.restaurant_order_stock_deductions enable row level security;

drop policy if exists "Order stock deductions select access" on public.restaurant_order_stock_deductions;

create policy "Order stock deductions select access"
on public.restaurant_order_stock_deductions
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.spizy_order_stock_status_can_deduct(p_status text)
returns boolean
language sql
stable
as $$
  select coalesce(p_status, '') in ('served', 'out_for_delivery', 'delivered', 'completed')
$$;

create or replace function public.spizy_deduct_one_stock_item(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_order_item_id uuid,
  p_sold_menu_item_id uuid,
  p_stock_item_id uuid,
  p_source_type text,
  p_quantity_sold numeric,
  p_quantity_to_deduct numeric,
  p_reason text,
  p_created_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_stock numeric(12,3);
  v_new_stock numeric(12,3);
  v_movement_id uuid;
  v_should_track boolean;
begin
  if p_quantity_to_deduct is null or p_quantity_to_deduct <= 0 then
    return;
  end if;

  if exists (
    select 1
    from public.restaurant_order_stock_deductions d
    where d.order_item_id = p_order_item_id
      and d.stock_item_id = p_stock_item_id
      and d.source_type = p_source_type
      and d.is_restored = false
  ) then
    return;
  end if;

  select coalesce(mi.stock_quantity, 0), coalesce(mi.track_stock, false)
    into v_old_stock, v_should_track
  from public.menu_items mi
  where mi.id = p_stock_item_id
    and mi.restaurant_id = p_restaurant_id
    and coalesce(mi.is_deleted, false) = false
  for update;

  if v_old_stock is null then
    return;
  end if;

  -- Only stock-tracked items are deducted. This prevents accidental stock changes for normal menu items.
  if not v_should_track then
    return;
  end if;

  v_new_stock := greatest(v_old_stock - p_quantity_to_deduct, 0);

  update public.menu_items
  set stock_quantity = v_new_stock
  where id = p_stock_item_id
    and restaurant_id = p_restaurant_id;

  insert into public.inventory_movements (
    restaurant_id,
    item_id,
    order_id,
    order_item_id,
    movement_type,
    quantity_delta,
    previous_stock,
    new_stock,
    reason,
    created_by
  )
  values (
    p_restaurant_id,
    p_stock_item_id,
    p_order_id,
    p_order_item_id,
    'sale',
    p_quantity_to_deduct * -1,
    v_old_stock,
    v_new_stock,
    p_reason,
    p_created_by
  )
  returning id into v_movement_id;

  insert into public.restaurant_order_stock_deductions (
    restaurant_id,
    order_id,
    order_item_id,
    sold_menu_item_id,
    stock_item_id,
    source_type,
    quantity_sold,
    quantity_deducted,
    inventory_movement_id
  )
  values (
    p_restaurant_id,
    p_order_id,
    p_order_item_id,
    p_sold_menu_item_id,
    p_stock_item_id,
    p_source_type,
    coalesce(p_quantity_sold, 0),
    p_quantity_to_deduct,
    v_movement_id
  )
  on conflict (order_item_id, stock_item_id, source_type)
  do nothing;
end;
$$;

create or replace function public.deduct_stock_for_order_item(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_item record;
  v_order record;
  v_recipe record;
  v_ingredient record;
  v_reason text;
begin
  select *
    into v_order_item
  from public.restaurant_order_items
  where id = p_order_item_id;

  if v_order_item.id is null then
    return;
  end if;

  select *
    into v_order
  from public.restaurant_orders
  where id = v_order_item.order_id;

  if v_order.id is null then
    return;
  end if;

  if not public.spizy_order_stock_status_can_deduct(v_order.status) then
    return;
  end if;

  if v_order_item.item_id is null then
    return;
  end if;

  -- If this order item has already produced stock deduction rows, do not deduct again.
  if exists (
    select 1
    from public.restaurant_order_stock_deductions d
    where d.order_item_id = v_order_item.id
      and d.is_restored = false
  ) then
    return;
  end if;

  select r.*
    into v_recipe
  from public.restaurant_recipes r
  where r.restaurant_id = v_order.restaurant_id
    and r.menu_item_id = v_order_item.item_id
    and coalesce(r.is_active, true) = true
  limit 1;

  if v_order.order_code is not null and trim(v_order.order_code) <> '' then
    v_reason := concat('Recipe/direct sale stock deduction • Order ', v_order.order_code);
  else
    v_reason := 'Recipe/direct sale stock deduction';
  end if;

  if v_recipe.id is not null then
    for v_ingredient in
      select
        ri.ingredient_item_id as stock_item_id,
        sum(
          (
            coalesce(ri.quantity, 0)
            * (1 + (coalesce(ri.wastage_percent, 0) / 100.0))
            / greatest(coalesce(v_recipe.yield_quantity, 1), 0.0001)
          ) * coalesce(v_order_item.quantity, 0)
        ) as quantity_to_deduct
      from public.restaurant_recipe_ingredients ri
      where ri.recipe_id = v_recipe.id
        and ri.restaurant_id = v_order.restaurant_id
      group by ri.ingredient_item_id
    loop
      perform public.spizy_deduct_one_stock_item(
        v_order.restaurant_id,
        v_order.id,
        v_order_item.id,
        v_order_item.item_id,
        v_ingredient.stock_item_id,
        'recipe',
        coalesce(v_order_item.quantity, 0),
        coalesce(v_ingredient.quantity_to_deduct, 0),
        v_reason,
        v_order.created_by
      );
    end loop;
  else
    -- If no recipe is configured, deduct the sold menu item itself if it is stock-tracked.
    perform public.spizy_deduct_one_stock_item(
      v_order.restaurant_id,
      v_order.id,
      v_order_item.id,
      v_order_item.item_id,
      v_order_item.item_id,
      'direct',
      coalesce(v_order_item.quantity, 0),
      coalesce(v_order_item.quantity, 0),
      v_reason,
      v_order.created_by
    );
  end if;
end;
$$;

create or replace function public.deduct_stock_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  for v_item in
    select id
    from public.restaurant_order_items
    where order_id = p_order_id
    order by created_at asc
  loop
    perform public.deduct_stock_for_order_item(v_item.id);
  end loop;
end;
$$;

create or replace function public.restore_stock_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_deduction record;
  v_old_stock numeric(12,3);
  v_new_stock numeric(12,3);
  v_restore_movement_id uuid;
  v_reason text;
begin
  select *
    into v_order
  from public.restaurant_orders
  where id = p_order_id;

  if v_order.id is null then
    return;
  end if;

  if v_order.order_code is not null and trim(v_order.order_code) <> '' then
    v_reason := concat('Cancelled order stock return • Order ', v_order.order_code);
  else
    v_reason := 'Cancelled order stock return';
  end if;

  for v_deduction in
    select *
    from public.restaurant_order_stock_deductions
    where order_id = p_order_id
      and is_restored = false
    order by created_at asc
    for update
  loop
    select coalesce(stock_quantity, 0)
      into v_old_stock
    from public.menu_items
    where id = v_deduction.stock_item_id
      and restaurant_id = v_deduction.restaurant_id
    for update;

    if v_old_stock is null then
      continue;
    end if;

    v_new_stock := v_old_stock + coalesce(v_deduction.quantity_deducted, 0);

    update public.menu_items
    set stock_quantity = v_new_stock
    where id = v_deduction.stock_item_id
      and restaurant_id = v_deduction.restaurant_id;

    insert into public.inventory_movements (
      restaurant_id,
      item_id,
      order_id,
      order_item_id,
      movement_type,
      quantity_delta,
      previous_stock,
      new_stock,
      reason,
      created_by
    )
    values (
      v_deduction.restaurant_id,
      v_deduction.stock_item_id,
      v_deduction.order_id,
      v_deduction.order_item_id,
      'return',
      coalesce(v_deduction.quantity_deducted, 0),
      v_old_stock,
      v_new_stock,
      v_reason,
      v_order.created_by
    )
    returning id into v_restore_movement_id;

    update public.restaurant_order_stock_deductions
    set
      is_restored = true,
      restored_movement_id = v_restore_movement_id,
      restored_at = now()
    where id = v_deduction.id;
  end loop;
end;
$$;

create or replace function public.handle_order_item_auto_stock_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.deduct_stock_for_order_item(new.id);
  return new;
end;
$$;

drop trigger if exists order_item_auto_stock_deduction on public.restaurant_order_items;
create trigger order_item_auto_stock_deduction
after insert on public.restaurant_order_items
for each row
execute function public.handle_order_item_auto_stock_deduction();

create or replace function public.handle_order_status_auto_stock_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if public.spizy_order_stock_status_can_deduct(new.status) then
      perform public.deduct_stock_for_order(new.id);
    elsif new.status = 'cancelled' then
      perform public.restore_stock_for_order(new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists order_status_auto_stock_deduction on public.restaurant_orders;
create trigger order_status_auto_stock_deduction
after update of status on public.restaurant_orders
for each row
execute function public.handle_order_status_auto_stock_deduction();

grant execute on function public.deduct_stock_for_order_item(uuid) to authenticated;
grant execute on function public.deduct_stock_for_order(uuid) to authenticated;
grant execute on function public.restore_stock_for_order(uuid) to authenticated;

-- Notes:
-- 1) If a sold item has an active recipe, Spizy deducts the recipe ingredients.
-- 2) If there is no active recipe, Spizy deducts the sold item itself.
-- 3) Only items with track_stock = true are deducted.
-- 4) Deduction is triggered when orders reach served, out_for_delivery, delivered or completed.
-- 5) If a deducted order is cancelled later, stock is restored once.
