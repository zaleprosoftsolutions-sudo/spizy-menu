-- Fix: app_role enum cannot be compared with an empty string through coalesce(rm.role, '').
-- Cause: rm.role is an enum, so PostgreSQL tries to cast '' into app_role and fails.
-- This repair drops/recreates the reconciliation snapshot policies using rm.role::text.

create table if not exists public.restaurant_payment_reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  snapshot_date date not null default current_date,
  snapshot_payload jsonb not null default '{}'::jsonb,
  collected_total numeric(12,2) not null default 0,
  pending_total numeric(12,2) not null default 0,
  cod_pending_total numeric(12,2) not null default 0,
  online_pending_total numeric(12,2) not null default 0,
  refunded_total numeric(12,2) not null default 0,
  cancelled_unpaid_total numeric(12,2) not null default 0,
  net_collected_total numeric(12,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_payment_reconciliation_snapshots
  enable row level security;

-- Drop the broken policies if they were partially created or created earlier.
drop policy if exists "Restaurant owners can view payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots;

drop policy if exists "Restaurant owners can insert payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots;

drop policy if exists "Restaurant owners can update payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots;

drop policy if exists "Super admins can manage payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots;

-- Recreate policies safely by casting enum roles to text.
create policy "Restaurant owners can view payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_reconciliation_snapshots.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'super_admin'
    )
  );

create policy "Restaurant owners can insert payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_reconciliation_snapshots.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'super_admin'
    )
  );

create policy "Restaurant owners can update payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots
  for update
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_reconciliation_snapshots.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_reconciliation_snapshots.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'super_admin'
    )
  );

create policy "Super admins can manage payment reconciliation snapshots"
  on public.restaurant_payment_reconciliation_snapshots
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'super_admin'
    )
  );

create index if not exists restaurant_payment_reconciliation_snapshots_restaurant_idx
  on public.restaurant_payment_reconciliation_snapshots (restaurant_id, snapshot_date desc);
