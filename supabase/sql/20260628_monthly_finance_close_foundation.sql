-- Spizy Menu - Monthly Finance Close foundation
-- Adds an owner review / close record for month-end finance snapshots.

create table if not exists public.restaurant_monthly_finance_closings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month_key text not null,
  currency text not null default 'AED',
  status text not null default 'reviewed' check (status in ('reviewed', 'closed', 'reopened')),
  days_loaded integer not null default 0,
  healthy_days integer not null default 0,
  warning_days integer not null default 0,
  total_sales numeric(14,2) not null default 0,
  collected_total numeric(14,2) not null default 0,
  pending_total numeric(14,2) not null default 0,
  cod_pending numeric(14,2) not null default 0,
  online_pending numeric(14,2) not null default 0,
  refund_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  net_collection numeric(14,2) not null default 0,
  net_after_expenses numeric(14,2) not null default 0,
  cash_difference_total numeric(14,2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (restaurant_id, month_key)
);

alter table public.restaurant_monthly_finance_closings enable row level security;

create index if not exists restaurant_monthly_finance_closings_restaurant_month_idx
  on public.restaurant_monthly_finance_closings (restaurant_id, month_key desc);

create or replace function public.set_restaurant_monthly_finance_closings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_restaurant_monthly_finance_closings_updated_at
  on public.restaurant_monthly_finance_closings;

create trigger trg_restaurant_monthly_finance_closings_updated_at
before update on public.restaurant_monthly_finance_closings
for each row
execute function public.set_restaurant_monthly_finance_closings_updated_at();

do $$
begin
  drop policy if exists "Restaurant members can read monthly finance closings" on public.restaurant_monthly_finance_closings;
  drop policy if exists "Restaurant managers can insert monthly finance closings" on public.restaurant_monthly_finance_closings;
  drop policy if exists "Restaurant managers can update monthly finance closings" on public.restaurant_monthly_finance_closings;

  create policy "Restaurant members can read monthly finance closings"
    on public.restaurant_monthly_finance_closings
    for select
    using (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_monthly_finance_closings.restaurant_id
          and rm.user_id = auth.uid()
      )
    );

  create policy "Restaurant managers can insert monthly finance closings"
    on public.restaurant_monthly_finance_closings
    for insert
    with check (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_monthly_finance_closings.restaurant_id
          and rm.user_id = auth.uid()
          and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
      )
    );

  create policy "Restaurant managers can update monthly finance closings"
    on public.restaurant_monthly_finance_closings
    for update
    using (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_monthly_finance_closings.restaurant_id
          and rm.user_id = auth.uid()
          and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
      )
    )
    with check (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_monthly_finance_closings.restaurant_id
          and rm.user_id = auth.uid()
          and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
      )
    );
end $$;
