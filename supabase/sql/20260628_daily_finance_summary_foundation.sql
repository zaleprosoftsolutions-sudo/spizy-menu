create table if not exists public.restaurant_daily_finance_summaries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  summary_date date not null,
  currency text not null default 'AED',
  total_sales numeric(14,2) not null default 0,
  collected_total numeric(14,2) not null default 0,
  pending_total numeric(14,2) not null default 0,
  cod_pending numeric(14,2) not null default 0,
  online_pending numeric(14,2) not null default 0,
  refund_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  cash_bank_money_in numeric(14,2) not null default 0,
  cash_bank_money_out numeric(14,2) not null default 0,
  net_collection numeric(14,2) not null default 0,
  net_after_expenses numeric(14,2) not null default 0,
  cash_difference numeric(14,2) not null default 0,
  day_closing_status text not null default 'open',
  day_closing_id uuid,
  payment_snapshot_id uuid,
  summary_breakdown jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, summary_date)
);

create index if not exists restaurant_daily_finance_summaries_restaurant_date_idx
  on public.restaurant_daily_finance_summaries (restaurant_id, summary_date desc);

alter table public.restaurant_daily_finance_summaries enable row level security;

do $$
begin
  drop policy if exists "Restaurant members can read daily finance summaries"
    on public.restaurant_daily_finance_summaries;

  create policy "Restaurant members can read daily finance summaries"
    on public.restaurant_daily_finance_summaries
    for select
    using (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_daily_finance_summaries.restaurant_id
          and rm.user_id = auth.uid()
      )
    );

  drop policy if exists "Restaurant owners can insert daily finance summaries"
    on public.restaurant_daily_finance_summaries;

  create policy "Restaurant owners can insert daily finance summaries"
    on public.restaurant_daily_finance_summaries
    for insert
    with check (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_daily_finance_summaries.restaurant_id
          and rm.user_id = auth.uid()
          and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
      )
    );

  drop policy if exists "Restaurant owners can update daily finance summaries"
    on public.restaurant_daily_finance_summaries;

  create policy "Restaurant owners can update daily finance summaries"
    on public.restaurant_daily_finance_summaries
    for update
    using (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_daily_finance_summaries.restaurant_id
          and rm.user_id = auth.uid()
          and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
      )
    )
    with check (
      exists (
        select 1
        from public.restaurant_members rm
        where rm.restaurant_id = restaurant_daily_finance_summaries.restaurant_id
          and rm.user_id = auth.uid()
          and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
      )
    );
end $$;
