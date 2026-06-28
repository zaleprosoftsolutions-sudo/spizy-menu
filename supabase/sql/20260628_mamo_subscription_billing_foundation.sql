-- Spizy Menu Mamo subscription billing foundation
-- IMPORTANT:
-- Mamo Pay is for Spizy restaurant subscription payments only.
-- Restaurant customer order payments must continue to use restaurant-owned gateway accounts.

alter table public.restaurants
  add column if not exists subscription_plan text not null default 'qr_menu_monthly',
  add column if not exists subscription_current_period_start date null,
  add column if not exists subscription_current_period_end date null,
  add column if not exists subscription_grace_until date null,
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_last_payment_at timestamptz null,
  add column if not exists subscription_payment_gateway text null,
  add column if not exists subscription_mamo_customer_ref text null;

-- Many existing builds already have subscription_status. Keep this safe if the column exists already.
alter table public.restaurants
  add column if not exists subscription_status text not null default 'trialing';

create table if not exists public.restaurant_subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_key text not null,
  plan_name text not null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'quarterly', 'yearly', 'manual')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AED',
  status text not null default 'created' check (
    status in (
      'created',
      'checkout_created',
      'pending',
      'captured',
      'failed',
      'cancelled',
      'expired',
      'manual_review'
    )
  ),
  external_id text not null unique,
  mamo_link_id text null,
  mamo_checkout_url text null,
  mamo_transaction_id text null,
  mamo_status text null,
  billing_period_start date null,
  billing_period_end date null,
  grace_until date null,
  return_url text null,
  failure_return_url text null,
  customer_name text null,
  customer_email text null,
  raw_response jsonb not null default '{}'::jsonb,
  webhook_payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  verified_by uuid null references auth.users(id) on delete set null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_attempts_restaurant_created
  on public.restaurant_subscription_payment_attempts (restaurant_id, created_at desc);

create index if not exists idx_subscription_attempts_mamo_link
  on public.restaurant_subscription_payment_attempts (mamo_link_id)
  where mamo_link_id is not null;

create index if not exists idx_subscription_attempts_transaction
  on public.restaurant_subscription_payment_attempts (mamo_transaction_id)
  where mamo_transaction_id is not null;

create table if not exists public.restaurant_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  attempt_id uuid null references public.restaurant_subscription_payment_attempts(id) on delete set null,
  invoice_number text not null unique,
  plan_key text not null,
  plan_name text not null,
  billing_cycle text not null default 'monthly',
  amount numeric(12,2) not null default 0,
  currency text not null default 'AED',
  status text not null default 'paid' check (status in ('draft', 'paid', 'voided', 'refunded')),
  payment_gateway text not null default 'mamo_pay',
  gateway_transaction_id text null,
  period_start date not null,
  period_end date not null,
  paid_at timestamptz null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_invoices_restaurant_created
  on public.restaurant_subscription_invoices (restaurant_id, created_at desc);

create or replace function public.set_subscription_billing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_subscription_attempts_updated_at on public.restaurant_subscription_payment_attempts;
create trigger trg_subscription_attempts_updated_at
before update on public.restaurant_subscription_payment_attempts
for each row execute function public.set_subscription_billing_updated_at();

drop trigger if exists trg_subscription_invoices_updated_at on public.restaurant_subscription_invoices;
create trigger trg_subscription_invoices_updated_at
before update on public.restaurant_subscription_invoices
for each row execute function public.set_subscription_billing_updated_at();

alter table public.restaurant_subscription_payment_attempts enable row level security;
alter table public.restaurant_subscription_invoices enable row level security;

-- Owner/admin/manager can read subscription billing. Restaurant staff should not manage SaaS subscription by default.
drop policy if exists "restaurant admins can read subscription attempts" on public.restaurant_subscription_payment_attempts;
create policy "restaurant admins can read subscription attempts"
on public.restaurant_subscription_payment_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscription_payment_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can insert subscription attempts" on public.restaurant_subscription_payment_attempts;
create policy "restaurant admins can insert subscription attempts"
on public.restaurant_subscription_payment_attempts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscription_payment_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can update subscription attempts" on public.restaurant_subscription_payment_attempts;
create policy "restaurant admins can update subscription attempts"
on public.restaurant_subscription_payment_attempts
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscription_payment_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscription_payment_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can read subscription invoices" on public.restaurant_subscription_invoices;
create policy "restaurant admins can read subscription invoices"
on public.restaurant_subscription_invoices
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscription_invoices.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can insert subscription invoices" on public.restaurant_subscription_invoices;
create policy "restaurant admins can insert subscription invoices"
on public.restaurant_subscription_invoices
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscription_invoices.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

-- Service role bypasses RLS automatically for Edge Function updates.
