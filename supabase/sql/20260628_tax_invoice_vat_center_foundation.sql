-- Spizy Menu - Tax Invoice / VAT Invoice Center foundation
-- Safe additive migration. Creates a draft invoice register for accountant review.

create table if not exists public.restaurant_tax_invoice_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.restaurant_orders(id) on delete set null,
  invoice_number text not null,
  invoice_date date not null default current_date,
  invoice_type text not null default 'tax_invoice',
  status text not null default 'draft',
  order_code text,
  customer_name text,
  customer_phone text,
  customer_tax_number text,
  customer_address text,
  currency text not null default 'AED',
  subtotal_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  taxable_amount numeric(12,2) not null default 0,
  tax_rate numeric(8,3) not null default 5,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  restaurant_trn text,
  pricing_mode text not null default 'inclusive',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_tax_invoice_records_status_check check (status in ('draft', 'issued', 'voided')),
  constraint restaurant_tax_invoice_records_type_check check (invoice_type in ('tax_invoice', 'simplified_tax_invoice', 'credit_note', 'debit_note')),
  constraint restaurant_tax_invoice_records_unique_number unique (restaurant_id, invoice_number)
);

create index if not exists restaurant_tax_invoice_records_restaurant_date_idx
  on public.restaurant_tax_invoice_records (restaurant_id, invoice_date desc);

create index if not exists restaurant_tax_invoice_records_order_idx
  on public.restaurant_tax_invoice_records (order_id);

alter table public.restaurant_tax_invoice_records enable row level security;

drop policy if exists "Restaurant members can read tax invoice records" on public.restaurant_tax_invoice_records;
create policy "Restaurant members can read tax invoice records"
  on public.restaurant_tax_invoice_records
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_invoice_records.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'accountant')
    )
    or exists (
      select 1
      from public.restaurant_staffs rs
      where rs.restaurant_id = restaurant_tax_invoice_records.restaurant_id
        and rs.is_deleted = false
        and rs.is_active = true
        and lower(rs.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
        and coalesce((rs.permissions ->> 'reports')::boolean, false) = true
    )
  );

drop policy if exists "Restaurant managers can manage tax invoice records" on public.restaurant_tax_invoice_records;
create policy "Restaurant managers can manage tax invoice records"
  on public.restaurant_tax_invoice_records
  for all
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_invoice_records.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'accountant')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_invoice_records.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'accountant')
    )
  );

create or replace function public.set_restaurant_tax_invoice_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_tax_invoice_records_updated_at on public.restaurant_tax_invoice_records;
create trigger restaurant_tax_invoice_records_updated_at
before update on public.restaurant_tax_invoice_records
for each row execute function public.set_restaurant_tax_invoice_records_updated_at();
