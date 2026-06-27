-- Spizy Supplier Payments / Accounts Payable foundation
-- Adds supplier payment ledger, payment reversal, and automatic purchase due updates.

alter table public.restaurant_purchases
  drop constraint if exists restaurant_purchases_payment_method_check;

alter table public.restaurant_purchases
  add constraint restaurant_purchases_payment_method_check
  check (
    payment_method in (
      'cash',
      'card',
      'bank',
      'online',
      'upi',
      'wallet',
      'cheque',
      'credit',
      'other'
    )
  );

create table if not exists public.restaurant_supplier_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  supplier_id uuid references public.restaurant_suppliers(id) on delete set null,
  purchase_id uuid references public.restaurant_purchases(id) on delete set null,
  supplier_name text,
  amount numeric(12,2) not null default 0,
  payment_method text not null default 'cash',
  paid_at timestamptz not null default now(),
  reference_no text,
  notes text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_supplier_payments_amount_check check (amount > 0),
  constraint restaurant_supplier_payments_method_check check (
    payment_method in (
      'cash',
      'card',
      'bank',
      'online',
      'upi',
      'wallet',
      'cheque',
      'credit',
      'other'
    )
  )
);

create index if not exists restaurant_supplier_payments_restaurant_idx
on public.restaurant_supplier_payments (restaurant_id, is_deleted, paid_at desc, created_at desc);

create index if not exists restaurant_supplier_payments_supplier_idx
on public.restaurant_supplier_payments (supplier_id, paid_at desc);

create index if not exists restaurant_supplier_payments_purchase_idx
on public.restaurant_supplier_payments (purchase_id, paid_at desc);

alter table public.restaurant_supplier_payments enable row level security;

drop policy if exists "Restaurant supplier payments select access" on public.restaurant_supplier_payments;
drop policy if exists "Restaurant supplier payments insert access" on public.restaurant_supplier_payments;
drop policy if exists "Restaurant supplier payments update access" on public.restaurant_supplier_payments;
drop policy if exists "Restaurant supplier payments delete access" on public.restaurant_supplier_payments;

create policy "Restaurant supplier payments select access"
on public.restaurant_supplier_payments
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant supplier payments insert access"
on public.restaurant_supplier_payments
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant supplier payments update access"
on public.restaurant_supplier_payments
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

create policy "Restaurant supplier payments delete access"
on public.restaurant_supplier_payments
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.touch_supplier_payment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_supplier_payments_touch_updated_at on public.restaurant_supplier_payments;
create trigger restaurant_supplier_payments_touch_updated_at
before update on public.restaurant_supplier_payments
for each row execute function public.touch_supplier_payment_updated_at();

create or replace function public.get_purchase_payment_status(
  p_total numeric,
  p_paid numeric
)
returns text
language plpgsql
immutable
as $$
begin
  if coalesce(p_paid, 0) <= 0 then
    return 'unpaid';
  end if;

  if coalesce(p_paid, 0) >= coalesce(p_total, 0) then
    return 'paid';
  end if;

  return 'partial';
end;
$$;

create or replace function public.record_supplier_payment(
  p_restaurant_id uuid,
  p_supplier_id uuid default null,
  p_purchase_id uuid default null,
  p_amount numeric default 0,
  p_payment_method text default 'cash',
  p_paid_at timestamptz default now(),
  p_reference_no text default null,
  p_notes text default null
)
returns table (
  payment_id uuid,
  purchase_id uuid,
  purchase_amount_paid numeric,
  purchase_due numeric,
  purchase_payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier record;
  v_purchase record;
  v_payment_id uuid;
  v_supplier_id uuid;
  v_supplier_name text;
  v_new_paid numeric(12,2);
  v_new_due numeric(12,2);
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  if not (
    public.is_restaurant_member(p_restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this restaurant.';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount should be greater than zero.';
  end if;

  if p_payment_method not in (
    'cash',
    'card',
    'bank',
    'online',
    'upi',
    'wallet',
    'cheque',
    'credit',
    'other'
  ) then
    raise exception 'Invalid payment method.';
  end if;

  if p_purchase_id is not null then
    select *
      into v_purchase
    from public.restaurant_purchases
    where id = p_purchase_id
      and restaurant_id = p_restaurant_id
    for update;

    if v_purchase.id is null then
      raise exception 'Purchase bill not found.';
    end if;

    if v_purchase.status = 'cancelled' then
      raise exception 'Cancelled purchase bill cannot receive payment.';
    end if;

    if coalesce(v_purchase.total_amount, 0) - coalesce(v_purchase.amount_paid, 0) <= 0 then
      raise exception 'This purchase bill is already paid.';
    end if;

    if p_amount > (coalesce(v_purchase.total_amount, 0) - coalesce(v_purchase.amount_paid, 0)) then
      raise exception 'Payment amount is higher than bill due.';
    end if;

    v_supplier_id := coalesce(p_supplier_id, v_purchase.supplier_id);
    v_supplier_name := v_purchase.supplier_name;
  else
    v_supplier_id := p_supplier_id;
  end if;

  if v_supplier_id is null then
    raise exception 'Supplier is required.';
  end if;

  select *
    into v_supplier
  from public.restaurant_suppliers
  where id = v_supplier_id
    and restaurant_id = p_restaurant_id;

  if v_supplier.id is null then
    raise exception 'Supplier not found.';
  end if;

  v_supplier_name := coalesce(v_supplier_name, v_supplier.name);

  insert into public.restaurant_supplier_payments (
    restaurant_id,
    supplier_id,
    purchase_id,
    supplier_name,
    amount,
    payment_method,
    paid_at,
    reference_no,
    notes,
    created_by
  )
  values (
    p_restaurant_id,
    v_supplier_id,
    p_purchase_id,
    v_supplier_name,
    round(p_amount::numeric, 2),
    p_payment_method,
    coalesce(p_paid_at, now()),
    nullif(trim(coalesce(p_reference_no, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  if p_purchase_id is not null then
    v_new_paid := round((coalesce(v_purchase.amount_paid, 0) + p_amount)::numeric, 2);
    v_new_due := greatest(round((coalesce(v_purchase.total_amount, 0) - v_new_paid)::numeric, 2), 0);
    v_new_status := public.get_purchase_payment_status(v_purchase.total_amount, v_new_paid);

    update public.restaurant_purchases
    set
      amount_paid = v_new_paid,
      payment_status = v_new_status,
      payment_method = p_payment_method
    where id = p_purchase_id;
  else
    v_new_paid := null;
    v_new_due := null;
    v_new_status := null;
  end if;

  return query
  select v_payment_id, p_purchase_id, v_new_paid, v_new_due, v_new_status;
end;
$$;

create or replace function public.void_supplier_payment(
  p_payment_id uuid
)
returns table (
  payment_id uuid,
  purchase_id uuid,
  purchase_amount_paid numeric,
  purchase_due numeric,
  purchase_payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_purchase record;
  v_new_paid numeric(12,2);
  v_new_due numeric(12,2);
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Login required.';
  end if;

  select *
    into v_payment
  from public.restaurant_supplier_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Supplier payment not found.';
  end if;

  if v_payment.is_deleted then
    raise exception 'This supplier payment is already voided.';
  end if;

  if not (
    public.is_restaurant_member(v_payment.restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have access to this supplier payment.';
  end if;

  update public.restaurant_supplier_payments
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_payment_id;

  if v_payment.purchase_id is not null then
    select *
      into v_purchase
    from public.restaurant_purchases
    where id = v_payment.purchase_id
      and restaurant_id = v_payment.restaurant_id
    for update;

    if v_purchase.id is not null then
      v_new_paid := greatest(round((coalesce(v_purchase.amount_paid, 0) - coalesce(v_payment.amount, 0))::numeric, 2), 0);
      v_new_due := greatest(round((coalesce(v_purchase.total_amount, 0) - v_new_paid)::numeric, 2), 0);
      v_new_status := public.get_purchase_payment_status(v_purchase.total_amount, v_new_paid);

      update public.restaurant_purchases
      set
        amount_paid = v_new_paid,
        payment_status = v_new_status
      where id = v_purchase.id;
    end if;
  else
    v_new_paid := null;
    v_new_due := null;
    v_new_status := null;
  end if;

  return query
  select p_payment_id, v_payment.purchase_id, v_new_paid, v_new_due, v_new_status;
end;
$$;

grant execute on function public.record_supplier_payment(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  timestamptz,
  text,
  text
) to authenticated;

grant execute on function public.void_supplier_payment(uuid) to authenticated;
