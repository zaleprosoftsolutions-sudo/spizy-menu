-- Spizy Purchases / Suppliers foundation
-- Creates supplier bills, purchase items, and a safe receive-stock flow.

create table if not exists public.restaurant_suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  supplier_id uuid references public.restaurant_suppliers(id) on delete set null,
  supplier_name text,
  invoice_number text,
  purchase_date timestamptz not null default now(),
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  payment_method text not null default 'cash',
  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  notes text,
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_purchases_status_check check (status in ('draft', 'received', 'cancelled')),
  constraint restaurant_purchases_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid')),
  constraint restaurant_purchases_payment_method_check check (payment_method in ('cash', 'card', 'bank', 'online', 'credit'))
);

create table if not exists public.restaurant_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.restaurant_purchases(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete restrict,
  item_name text not null,
  quantity numeric(12,3) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  stock_unit text not null default 'pcs',
  created_at timestamptz not null default now(),
  constraint restaurant_purchase_items_quantity_check check (quantity > 0),
  constraint restaurant_purchase_items_unit_cost_check check (unit_cost >= 0)
);

create index if not exists restaurant_suppliers_restaurant_idx
on public.restaurant_suppliers (restaurant_id, is_active, created_at desc);

create index if not exists restaurant_purchases_restaurant_idx
on public.restaurant_purchases (restaurant_id, purchase_date desc, created_at desc);

create index if not exists restaurant_purchases_supplier_idx
on public.restaurant_purchases (supplier_id, purchase_date desc);

create index if not exists restaurant_purchase_items_purchase_idx
on public.restaurant_purchase_items (purchase_id);

create index if not exists restaurant_purchase_items_item_idx
on public.restaurant_purchase_items (item_id, created_at desc);

alter table public.restaurant_suppliers enable row level security;
alter table public.restaurant_purchases enable row level security;
alter table public.restaurant_purchase_items enable row level security;

drop policy if exists "Restaurant suppliers select access" on public.restaurant_suppliers;
drop policy if exists "Restaurant suppliers insert access" on public.restaurant_suppliers;
drop policy if exists "Restaurant suppliers update access" on public.restaurant_suppliers;
drop policy if exists "Restaurant suppliers delete access" on public.restaurant_suppliers;

create policy "Restaurant suppliers select access"
on public.restaurant_suppliers
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant suppliers insert access"
on public.restaurant_suppliers
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant suppliers update access"
on public.restaurant_suppliers
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant suppliers delete access"
on public.restaurant_suppliers
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant purchases select access" on public.restaurant_purchases;
drop policy if exists "Restaurant purchases insert access" on public.restaurant_purchases;
drop policy if exists "Restaurant purchases update access" on public.restaurant_purchases;
drop policy if exists "Restaurant purchases delete access" on public.restaurant_purchases;

create policy "Restaurant purchases select access"
on public.restaurant_purchases
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant purchases insert access"
on public.restaurant_purchases
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant purchases update access"
on public.restaurant_purchases
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant purchases delete access"
on public.restaurant_purchases
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant purchase items select access" on public.restaurant_purchase_items;
drop policy if exists "Restaurant purchase items insert access" on public.restaurant_purchase_items;
drop policy if exists "Restaurant purchase items update access" on public.restaurant_purchase_items;
drop policy if exists "Restaurant purchase items delete access" on public.restaurant_purchase_items;

create policy "Restaurant purchase items select access"
on public.restaurant_purchase_items
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant purchase items insert access"
on public.restaurant_purchase_items
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant purchase items update access"
on public.restaurant_purchase_items
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant purchase items delete access"
on public.restaurant_purchase_items
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.touch_restaurant_purchase_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_suppliers_touch_updated_at on public.restaurant_suppliers;
create trigger restaurant_suppliers_touch_updated_at
before update on public.restaurant_suppliers
for each row execute function public.touch_restaurant_purchase_updated_at();

drop trigger if exists restaurant_purchases_touch_updated_at on public.restaurant_purchases;
create trigger restaurant_purchases_touch_updated_at
before update on public.restaurant_purchases
for each row execute function public.touch_restaurant_purchase_updated_at();

create or replace function public.receive_restaurant_purchase(p_purchase_id uuid)
returns table (
  purchase_id uuid,
  total_items integer,
  total_quantity numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase record;
  v_item record;
  v_old_stock numeric(12,3);
  v_new_stock numeric(12,3);
  v_total_items integer := 0;
  v_total_quantity numeric(12,3) := 0;
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  select *
    into v_purchase
  from public.restaurant_purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'Purchase not found.';
  end if;

  if not (
    public.is_restaurant_member(v_purchase.restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this purchase.';
  end if;

  if v_purchase.status = 'received' then
    raise exception 'This purchase is already received.';
  end if;

  if v_purchase.status = 'cancelled' then
    raise exception 'Cancelled purchases cannot be received.';
  end if;

  for v_item in
    select *
    from public.restaurant_purchase_items
    where purchase_id = p_purchase_id
      and restaurant_id = v_purchase.restaurant_id
    order by created_at asc
  loop
    select coalesce(stock_quantity, 0)
      into v_old_stock
    from public.menu_items
    where id = v_item.item_id
      and restaurant_id = v_purchase.restaurant_id
      and coalesce(is_deleted, false) = false
    for update;

    if v_old_stock is null then
      raise exception 'Menu item not found for purchase item %.', v_item.item_name;
    end if;

    v_new_stock := v_old_stock + coalesce(v_item.quantity, 0);

    update public.menu_items
    set
      track_stock = true,
      stock_quantity = v_new_stock,
      stock_unit = coalesce(nullif(trim(v_item.stock_unit), ''), stock_unit, 'pcs')
    where id = v_item.item_id
      and restaurant_id = v_purchase.restaurant_id;

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
      v_purchase.restaurant_id,
      v_item.item_id,
      'purchase',
      coalesce(v_item.quantity, 0),
      v_old_stock,
      v_new_stock,
      concat(
        'Purchase received',
        case
          when v_purchase.invoice_number is null or trim(v_purchase.invoice_number) = '' then ''
          else concat(' • Invoice ', v_purchase.invoice_number)
        end,
        case
          when v_purchase.supplier_name is null or trim(v_purchase.supplier_name) = '' then ''
          else concat(' • ', v_purchase.supplier_name)
        end
      ),
      auth.uid()
    );

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + coalesce(v_item.quantity, 0);
  end loop;

  if v_total_items = 0 then
    raise exception 'Add purchase items before receiving stock.';
  end if;

  update public.restaurant_purchases
  set
    status = 'received',
    received_at = now()
  where id = p_purchase_id;

  return query
  select p_purchase_id, v_total_items, v_total_quantity;
end;
$$;

grant execute on function public.receive_restaurant_purchase(uuid) to authenticated;
