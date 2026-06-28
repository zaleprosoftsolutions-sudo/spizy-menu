-- Spizy Menu - VAT Period Close foundation
-- Run this after the Input Tax / Purchase VAT package.

create table if not exists public.restaurant_tax_vat_period_closings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month_key text not null,
  status text not null default 'reviewed',
  currency text not null default 'AED',
  tax_rate numeric(8,4) not null default 0,
  gross_sales numeric(14,2) not null default 0,
  refunds_amount numeric(14,2) not null default 0,
  taxable_sales numeric(14,2) not null default 0,
  sales_excluding_tax numeric(14,2) not null default 0,
  output_tax numeric(14,2) not null default 0,
  input_tax numeric(14,2) not null default 0,
  vat_payable numeric(14,2) not null default 0,
  pending_collections numeric(14,2) not null default 0,
  daily_summary_count integer not null default 0,
  input_record_count integer not null default 0,
  health_label text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_tax_vat_period_closings_unique unique (restaurant_id, month_key),
  constraint restaurant_tax_vat_period_closings_status_check check (status in ('reviewed', 'closed', 'reopened'))
);

alter table public.restaurant_tax_vat_period_closings
  add column if not exists status text default 'reviewed',
  add column if not exists currency text default 'AED',
  add column if not exists tax_rate numeric(8,4) default 0,
  add column if not exists gross_sales numeric(14,2) default 0,
  add column if not exists refunds_amount numeric(14,2) default 0,
  add column if not exists taxable_sales numeric(14,2) default 0,
  add column if not exists sales_excluding_tax numeric(14,2) default 0,
  add column if not exists output_tax numeric(14,2) default 0,
  add column if not exists input_tax numeric(14,2) default 0,
  add column if not exists vat_payable numeric(14,2) default 0,
  add column if not exists pending_collections numeric(14,2) default 0,
  add column if not exists daily_summary_count integer default 0,
  add column if not exists input_record_count integer default 0,
  add column if not exists health_label text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_restaurant_tax_vat_period_closings_unique
  on public.restaurant_tax_vat_period_closings (restaurant_id, month_key);

create index if not exists idx_restaurant_tax_vat_period_closings_status
  on public.restaurant_tax_vat_period_closings (restaurant_id, status, month_key desc);

create or replace function public.set_restaurant_tax_vat_period_closings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_tax_vat_period_closings_updated_at on public.restaurant_tax_vat_period_closings;
create trigger trg_restaurant_tax_vat_period_closings_updated_at
before insert or update on public.restaurant_tax_vat_period_closings
for each row execute function public.set_restaurant_tax_vat_period_closings_updated_at();

alter table public.restaurant_tax_vat_period_closings enable row level security;

drop policy if exists "Restaurant members can read VAT period closings" on public.restaurant_tax_vat_period_closings;
create policy "Restaurant members can read VAT period closings"
  on public.restaurant_tax_vat_period_closings
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_vat_period_closings.restaurant_id
        and rm.user_id = auth.uid()
    )
  );

drop policy if exists "Restaurant finance users can insert VAT period closings" on public.restaurant_tax_vat_period_closings;
create policy "Restaurant finance users can insert VAT period closings"
  on public.restaurant_tax_vat_period_closings
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_vat_period_closings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  );

drop policy if exists "Restaurant finance users can update VAT period closings" on public.restaurant_tax_vat_period_closings;
create policy "Restaurant finance users can update VAT period closings"
  on public.restaurant_tax_vat_period_closings
  for update
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_vat_period_closings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_vat_period_closings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  );
