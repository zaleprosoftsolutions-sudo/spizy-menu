-- Spizy Menu - Customer Payments / Accounts Receivable Foundation
-- Run this file in Supabase SQL Editor.

alter table public.restaurant_orders
add column if not exists paid_amount numeric(12, 2) not null default 0;

update public.restaurant_orders
set paid_amount = coalesce(total_amount, 0)
where payment_status = 'paid'
  and coalesce(paid_amount, 0) = 0;

create table if not exists public.restaurant_customer_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  customer_name text,
  customer_phone text,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash' check (
    payment_method in ('cash', 'card', 'upi', 'online', 'bank', 'wallet', 'other')
  ),
  payment_reference text,
  notes text,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  is_void boolean not null default false,
  void_reason text,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_customer_payments_restaurant_idx
on public.restaurant_customer_payments (restaurant_id, received_at desc);

create index if not exists restaurant_customer_payments_order_idx
on public.restaurant_customer_payments (order_id);

alter table public.restaurant_customer_payments enable row level security;

drop policy if exists "Restaurant customer payments select access" on public.restaurant_customer_payments;

create policy "Restaurant customer payments select access"
on public.restaurant_customer_payments
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant customer payments insert access" on public.restaurant_customer_payments;

create policy "Restaurant customer payments insert access"
on public.restaurant_customer_payments
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant customer payments update access" on public.restaurant_customer_payments;

create policy "Restaurant customer payments update access"
on public.restaurant_customer_payments
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

create or replace function public.record_restaurant_customer_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_payment_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.restaurant_orders%rowtype;
  v_payment_id uuid;
  v_amount numeric(12, 2);
  v_total numeric(12, 2);
  v_existing_paid numeric(12, 2);
  v_new_paid numeric(12, 2);
  v_new_status text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount should be greater than zero.';
  end if;

  if p_payment_method not in ('cash', 'card', 'upi', 'online', 'bank', 'wallet', 'other') then
    raise exception 'Unsupported payment method.';
  end if;

  select *
  into v_order
  from public.restaurant_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if not (
    public.is_restaurant_member(v_order.restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have permission to record payment for this order.';
  end if;

  v_total := coalesce(v_order.total_amount, 0);
  v_existing_paid := coalesce(v_order.paid_amount, 0);
  v_amount := least(p_amount, greatest(v_total - v_existing_paid, 0));

  if v_amount <= 0 then
    raise exception 'This order is already fully paid.';
  end if;

  insert into public.restaurant_customer_payments (
    restaurant_id,
    order_id,
    customer_name,
    customer_phone,
    amount,
    payment_method,
    payment_reference,
    notes,
    received_by
  ) values (
    v_order.restaurant_id,
    v_order.id,
    v_order.customer_name,
    v_order.customer_phone,
    v_amount,
    p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  v_new_paid := least(v_existing_paid + v_amount, v_total);
  v_new_status := case when v_new_paid >= v_total then 'paid' else 'unpaid' end;

  update public.restaurant_orders
  set
    paid_amount = v_new_paid,
    payment_status = v_new_status,
    updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'order_id', v_order.id,
    'amount', v_amount,
    'paid_amount', v_new_paid,
    'balance_amount', greatest(v_total - v_new_paid, 0),
    'payment_status', v_new_status
  );
end;
$$;

create or replace function public.void_restaurant_customer_payment(
  p_payment_id uuid,
  p_void_reason text default 'Voided by restaurant'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.restaurant_customer_payments%rowtype;
  v_order public.restaurant_orders%rowtype;
  v_new_paid numeric(12, 2);
  v_new_status text;
begin
  select *
  into v_payment
  from public.restaurant_customer_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.';
  end if;

  if v_payment.is_void then
    raise exception 'This payment is already voided.';
  end if;

  if not (
    public.is_restaurant_member(v_payment.restaurant_id)
    or public.get_my_role() = 'super_admin'
  ) then
    raise exception 'You do not have permission to void this payment.';
  end if;

  select *
  into v_order
  from public.restaurant_orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'Linked order not found.';
  end if;

  update public.restaurant_customer_payments
  set
    is_void = true,
    void_reason = nullif(trim(coalesce(p_void_reason, '')), ''),
    voided_by = auth.uid(),
    voided_at = now(),
    updated_at = now()
  where id = v_payment.id;

  v_new_paid := greatest(coalesce(v_order.paid_amount, 0) - coalesce(v_payment.amount, 0), 0);
  v_new_status := case when v_new_paid >= coalesce(v_order.total_amount, 0) then 'paid' else 'unpaid' end;

  update public.restaurant_orders
  set
    paid_amount = v_new_paid,
    payment_status = v_new_status,
    updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'paid_amount', v_new_paid,
    'balance_amount', greatest(coalesce(v_order.total_amount, 0) - v_new_paid, 0),
    'payment_status', v_new_status
  );
end;
$$;

grant execute on function public.record_restaurant_customer_payment(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.void_restaurant_customer_payment(uuid, text) to authenticated;
