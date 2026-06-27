-- Spizy Menu - Branch Stock / Inter-Branch Transfers foundation
-- Run this in Supabase SQL Editor after Branches and Inventory modules are installed.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_branch_stock (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid not null references public.restaurant_branches(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  track_stock boolean not null default true,
  stock_quantity numeric(12,3) not null default 0,
  low_stock_quantity numeric(12,3) not null default 5,
  stock_unit text not null default 'pcs',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_branch_stock_qty_check check (
    stock_quantity >= 0 and low_stock_quantity >= 0
  ),
  constraint restaurant_branch_stock_unique unique (branch_id, item_id)
);

create index if not exists restaurant_branch_stock_restaurant_idx
on public.restaurant_branch_stock (restaurant_id, branch_id, item_id);

create index if not exists restaurant_branch_stock_low_idx
on public.restaurant_branch_stock (restaurant_id, branch_id, track_stock, stock_quantity, low_stock_quantity)
where track_stock = true;

create table if not exists public.restaurant_branch_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  transfer_code text not null,
  from_branch_id uuid not null references public.restaurant_branches(id) on delete restrict,
  to_branch_id uuid not null references public.restaurant_branches(id) on delete restrict,
  item_id uuid not null references public.menu_items(id) on delete restrict,
  quantity numeric(12,3) not null,
  unit text not null default 'pcs',
  status text not null default 'in_transit',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_branch_transfer_qty_check check (quantity > 0),
  constraint restaurant_branch_transfer_status_check check (
    status in ('in_transit', 'received', 'cancelled')
  ),
  constraint restaurant_branch_transfer_different_branch_check check (
    from_branch_id <> to_branch_id
  )
);

create index if not exists restaurant_branch_transfers_restaurant_idx
on public.restaurant_branch_stock_transfers (restaurant_id, created_at desc);

create index if not exists restaurant_branch_transfers_status_idx
on public.restaurant_branch_stock_transfers (restaurant_id, status, created_at desc);

create table if not exists public.restaurant_branch_stock_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid not null references public.restaurant_branches(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  transfer_id uuid references public.restaurant_branch_stock_transfers(id) on delete set null,
  movement_type text not null,
  quantity_delta numeric(12,3) not null,
  previous_stock numeric(12,3) not null default 0,
  new_stock numeric(12,3) not null default 0,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint restaurant_branch_stock_movement_type_check check (
    movement_type in (
      'opening',
      'adjustment_add',
      'adjustment_remove',
      'transfer_out',
      'transfer_in',
      'cancel_return'
    )
  )
);

create index if not exists restaurant_branch_stock_movements_restaurant_idx
on public.restaurant_branch_stock_movements (restaurant_id, created_at desc);

create index if not exists restaurant_branch_stock_movements_branch_idx
on public.restaurant_branch_stock_movements (branch_id, item_id, created_at desc);

alter table public.restaurant_branch_stock enable row level security;
alter table public.restaurant_branch_stock_transfers enable row level security;
alter table public.restaurant_branch_stock_movements enable row level security;

-- RLS

drop policy if exists "Branch stock select access" on public.restaurant_branch_stock;
create policy "Branch stock select access"
on public.restaurant_branch_stock
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Branch stock insert access" on public.restaurant_branch_stock;
create policy "Branch stock insert access"
on public.restaurant_branch_stock
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Branch stock update access" on public.restaurant_branch_stock;
create policy "Branch stock update access"
on public.restaurant_branch_stock
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

drop policy if exists "Branch transfers select access" on public.restaurant_branch_stock_transfers;
create policy "Branch transfers select access"
on public.restaurant_branch_stock_transfers
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Branch transfers insert access" on public.restaurant_branch_stock_transfers;
create policy "Branch transfers insert access"
on public.restaurant_branch_stock_transfers
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Branch transfers update access" on public.restaurant_branch_stock_transfers;
create policy "Branch transfers update access"
on public.restaurant_branch_stock_transfers
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

drop policy if exists "Branch movements select access" on public.restaurant_branch_stock_movements;
create policy "Branch movements select access"
on public.restaurant_branch_stock_movements
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Branch movements insert access" on public.restaurant_branch_stock_movements;
create policy "Branch movements insert access"
on public.restaurant_branch_stock_movements
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.touch_restaurant_branch_stock()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_restaurant_branch_stock on public.restaurant_branch_stock;
create trigger trg_touch_restaurant_branch_stock
before update on public.restaurant_branch_stock
for each row
execute function public.touch_restaurant_branch_stock();

create or replace function public.touch_restaurant_branch_stock_transfer()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_restaurant_branch_stock_transfer on public.restaurant_branch_stock_transfers;
create trigger trg_touch_restaurant_branch_stock_transfer
before update on public.restaurant_branch_stock_transfers
for each row
execute function public.touch_restaurant_branch_stock_transfer();

create or replace function public.set_branch_item_stock(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_item_id uuid,
  p_stock_quantity numeric,
  p_low_stock_quantity numeric default 5,
  p_stock_unit text default 'pcs',
  p_reason text default null
)
returns table (
  stock_id uuid,
  previous_stock numeric,
  new_stock numeric,
  movement_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_stock numeric(12,3) := 0;
  v_stock_id uuid;
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'Stock quantity cannot be negative.';
  end if;

  if p_low_stock_quantity is null or p_low_stock_quantity < 0 then
    raise exception 'Low stock alert cannot be negative.';
  end if;

  if not (
    public.is_restaurant_member(p_restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this restaurant branch stock.';
  end if;

  if not exists (
    select 1 from public.restaurant_branches rb
    where rb.id = p_branch_id
      and rb.restaurant_id = p_restaurant_id
      and coalesce(rb.is_deleted, false) = false
  ) then
    raise exception 'Branch not found.';
  end if;

  if not exists (
    select 1 from public.menu_items mi
    where mi.id = p_item_id
      and mi.restaurant_id = p_restaurant_id
      and coalesce(mi.is_deleted, false) = false
  ) then
    raise exception 'Menu item not found.';
  end if;

  select id, stock_quantity into v_stock_id, v_old_stock
  from public.restaurant_branch_stock
  where branch_id = p_branch_id
    and item_id = p_item_id
  for update;

  if v_stock_id is null then
    insert into public.restaurant_branch_stock (
      restaurant_id,
      branch_id,
      item_id,
      track_stock,
      stock_quantity,
      low_stock_quantity,
      stock_unit,
      updated_by
    ) values (
      p_restaurant_id,
      p_branch_id,
      p_item_id,
      true,
      p_stock_quantity,
      p_low_stock_quantity,
      coalesce(nullif(trim(p_stock_unit), ''), 'pcs'),
      auth.uid()
    )
    returning id into v_stock_id;
  else
    update public.restaurant_branch_stock
    set stock_quantity = p_stock_quantity,
        low_stock_quantity = p_low_stock_quantity,
        stock_unit = coalesce(nullif(trim(p_stock_unit), ''), 'pcs'),
        track_stock = true,
        updated_by = auth.uid()
    where id = v_stock_id;
  end if;

  insert into public.restaurant_branch_stock_movements (
    restaurant_id,
    branch_id,
    item_id,
    movement_type,
    quantity_delta,
    previous_stock,
    new_stock,
    reason,
    created_by
  ) values (
    p_restaurant_id,
    p_branch_id,
    p_item_id,
    'opening',
    p_stock_quantity - coalesce(v_old_stock, 0),
    coalesce(v_old_stock, 0),
    p_stock_quantity,
    nullif(trim(coalesce(p_reason, '')), ''),
    auth.uid()
  )
  returning id into v_movement_id;

  return query select v_stock_id, coalesce(v_old_stock, 0), p_stock_quantity, v_movement_id;
end;
$$;

create or replace function public.create_branch_stock_transfer(
  p_restaurant_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns table (
  transfer_id uuid,
  transfer_code text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_stock_id uuid;
  v_old_stock numeric(12,3) := 0;
  v_new_stock numeric(12,3);
  v_unit text := 'pcs';
  v_transfer_id uuid;
  v_transfer_code text;
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero.';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'From and To branch cannot be same.';
  end if;

  if not (
    public.is_restaurant_member(p_restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this restaurant.';
  end if;

  if (
    select count(*) from public.restaurant_branches rb
    where rb.id in (p_from_branch_id, p_to_branch_id)
      and rb.restaurant_id = p_restaurant_id
      and coalesce(rb.is_deleted, false) = false
  ) <> 2 then
    raise exception 'Branch not found.';
  end if;

  if not exists (
    select 1 from public.menu_items mi
    where mi.id = p_item_id
      and mi.restaurant_id = p_restaurant_id
      and coalesce(mi.is_deleted, false) = false
  ) then
    raise exception 'Menu item not found.';
  end if;

  select id, stock_quantity, stock_unit
    into v_source_stock_id, v_old_stock, v_unit
  from public.restaurant_branch_stock
  where restaurant_id = p_restaurant_id
    and branch_id = p_from_branch_id
    and item_id = p_item_id
  for update;

  if v_source_stock_id is null then
    raise exception 'Source branch stock is not set for this item.';
  end if;

  if coalesce(v_old_stock, 0) < p_quantity then
    raise exception 'Not enough stock in source branch.';
  end if;

  v_new_stock := coalesce(v_old_stock, 0) - p_quantity;
  v_transfer_code := 'TR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.restaurant_branch_stock_transfers (
    restaurant_id,
    transfer_code,
    from_branch_id,
    to_branch_id,
    item_id,
    quantity,
    unit,
    status,
    notes,
    created_by
  ) values (
    p_restaurant_id,
    v_transfer_code,
    p_from_branch_id,
    p_to_branch_id,
    p_item_id,
    p_quantity,
    coalesce(nullif(trim(v_unit), ''), 'pcs'),
    'in_transit',
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_transfer_id;

  update public.restaurant_branch_stock
  set stock_quantity = v_new_stock,
      updated_by = auth.uid()
  where id = v_source_stock_id;

  insert into public.restaurant_branch_stock_movements (
    restaurant_id,
    branch_id,
    item_id,
    transfer_id,
    movement_type,
    quantity_delta,
    previous_stock,
    new_stock,
    reason,
    created_by
  ) values (
    p_restaurant_id,
    p_from_branch_id,
    p_item_id,
    v_transfer_id,
    'transfer_out',
    p_quantity * -1,
    coalesce(v_old_stock, 0),
    v_new_stock,
    'Transfer dispatched to another branch',
    auth.uid()
  );

  return query select v_transfer_id, v_transfer_code, 'in_transit'::text;
end;
$$;

create or replace function public.receive_branch_stock_transfer(
  p_transfer_id uuid
)
returns table (
  transfer_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer record;
  v_dest_stock_id uuid;
  v_old_stock numeric(12,3) := 0;
  v_new_stock numeric(12,3);
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  select * into v_transfer
  from public.restaurant_branch_stock_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then
    raise exception 'Transfer not found.';
  end if;

  if not (
    public.is_restaurant_member(v_transfer.restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this transfer.';
  end if;

  if v_transfer.status <> 'in_transit' then
    raise exception 'Only in-transit transfers can be received.';
  end if;

  select id, stock_quantity into v_dest_stock_id, v_old_stock
  from public.restaurant_branch_stock
  where restaurant_id = v_transfer.restaurant_id
    and branch_id = v_transfer.to_branch_id
    and item_id = v_transfer.item_id
  for update;

  v_new_stock := coalesce(v_old_stock, 0) + v_transfer.quantity;

  if v_dest_stock_id is null then
    insert into public.restaurant_branch_stock (
      restaurant_id,
      branch_id,
      item_id,
      track_stock,
      stock_quantity,
      low_stock_quantity,
      stock_unit,
      updated_by
    ) values (
      v_transfer.restaurant_id,
      v_transfer.to_branch_id,
      v_transfer.item_id,
      true,
      v_new_stock,
      5,
      coalesce(nullif(trim(v_transfer.unit), ''), 'pcs'),
      auth.uid()
    )
    returning id into v_dest_stock_id;
  else
    update public.restaurant_branch_stock
    set stock_quantity = v_new_stock,
        track_stock = true,
        updated_by = auth.uid()
    where id = v_dest_stock_id;
  end if;

  insert into public.restaurant_branch_stock_movements (
    restaurant_id,
    branch_id,
    item_id,
    transfer_id,
    movement_type,
    quantity_delta,
    previous_stock,
    new_stock,
    reason,
    created_by
  ) values (
    v_transfer.restaurant_id,
    v_transfer.to_branch_id,
    v_transfer.item_id,
    v_transfer.id,
    'transfer_in',
    v_transfer.quantity,
    coalesce(v_old_stock, 0),
    v_new_stock,
    'Transfer received from another branch',
    auth.uid()
  );

  update public.restaurant_branch_stock_transfers
  set status = 'received',
      received_by = auth.uid(),
      received_at = now()
  where id = v_transfer.id;

  return query select v_transfer.id, 'received'::text;
end;
$$;

create or replace function public.cancel_branch_stock_transfer(
  p_transfer_id uuid
)
returns table (
  transfer_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer record;
  v_source_stock_id uuid;
  v_old_stock numeric(12,3) := 0;
  v_new_stock numeric(12,3);
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  select * into v_transfer
  from public.restaurant_branch_stock_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then
    raise exception 'Transfer not found.';
  end if;

  if not (
    public.is_restaurant_member(v_transfer.restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this transfer.';
  end if;

  if v_transfer.status <> 'in_transit' then
    raise exception 'Only in-transit transfers can be cancelled.';
  end if;

  select id, stock_quantity into v_source_stock_id, v_old_stock
  from public.restaurant_branch_stock
  where restaurant_id = v_transfer.restaurant_id
    and branch_id = v_transfer.from_branch_id
    and item_id = v_transfer.item_id
  for update;

  v_new_stock := coalesce(v_old_stock, 0) + v_transfer.quantity;

  if v_source_stock_id is null then
    insert into public.restaurant_branch_stock (
      restaurant_id,
      branch_id,
      item_id,
      track_stock,
      stock_quantity,
      low_stock_quantity,
      stock_unit,
      updated_by
    ) values (
      v_transfer.restaurant_id,
      v_transfer.from_branch_id,
      v_transfer.item_id,
      true,
      v_new_stock,
      5,
      coalesce(nullif(trim(v_transfer.unit), ''), 'pcs'),
      auth.uid()
    )
    returning id into v_source_stock_id;
  else
    update public.restaurant_branch_stock
    set stock_quantity = v_new_stock,
        updated_by = auth.uid()
    where id = v_source_stock_id;
  end if;

  insert into public.restaurant_branch_stock_movements (
    restaurant_id,
    branch_id,
    item_id,
    transfer_id,
    movement_type,
    quantity_delta,
    previous_stock,
    new_stock,
    reason,
    created_by
  ) values (
    v_transfer.restaurant_id,
    v_transfer.from_branch_id,
    v_transfer.item_id,
    v_transfer.id,
    'cancel_return',
    v_transfer.quantity,
    coalesce(v_old_stock, 0),
    v_new_stock,
    'Cancelled transfer stock returned to source branch',
    auth.uid()
  );

  update public.restaurant_branch_stock_transfers
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now()
  where id = v_transfer.id;

  return query select v_transfer.id, 'cancelled'::text;
end;
$$;

grant execute on function public.set_branch_item_stock(uuid, uuid, uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.create_branch_stock_transfer(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.receive_branch_stock_transfer(uuid) to authenticated;
grant execute on function public.cancel_branch_stock_transfer(uuid) to authenticated;
