-- Spizy Menu - Input Tax / Purchase VAT foundation
-- Run this after the Tax / VAT report foundation package.

create table if not exists public.restaurant_tax_input_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month_key text not null,
  purchase_date date not null default current_date,
  supplier_name text not null,
  invoice_number text,
  category text not null default 'other',
  currency text not null default 'AED',
  gross_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  input_tax_amount numeric(14,2) not null default 0,
  tax_rate numeric(8,4) not null default 0,
  notes text,
  is_voided boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz
);

alter table public.restaurant_tax_input_records
  add column if not exists month_key text,
  add column if not exists purchase_date date default current_date,
  add column if not exists supplier_name text,
  add column if not exists invoice_number text,
  add column if not exists category text default 'other',
  add column if not exists currency text default 'AED',
  add column if not exists gross_amount numeric(14,2) default 0,
  add column if not exists net_amount numeric(14,2) default 0,
  add column if not exists input_tax_amount numeric(14,2) default 0,
  add column if not exists tax_rate numeric(8,4) default 0,
  add column if not exists notes text,
  add column if not exists is_voided boolean default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz;

update public.restaurant_tax_input_records
set month_key = to_char(purchase_date, 'YYYY-MM')
where month_key is null and purchase_date is not null;

create index if not exists idx_restaurant_tax_input_records_restaurant_month
  on public.restaurant_tax_input_records (restaurant_id, month_key, is_voided, purchase_date desc);

create index if not exists idx_restaurant_tax_input_records_restaurant_date
  on public.restaurant_tax_input_records (restaurant_id, purchase_date desc);

create or replace function public.set_restaurant_tax_input_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.month_key is null and new.purchase_date is not null then
    new.month_key = to_char(new.purchase_date, 'YYYY-MM');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurant_tax_input_records_updated_at on public.restaurant_tax_input_records;
create trigger trg_restaurant_tax_input_records_updated_at
before insert or update on public.restaurant_tax_input_records
for each row execute function public.set_restaurant_tax_input_records_updated_at();

alter table public.restaurant_tax_input_records enable row level security;

drop policy if exists "Restaurant members can read input tax records" on public.restaurant_tax_input_records;
create policy "Restaurant members can read input tax records"
  on public.restaurant_tax_input_records
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_input_records.restaurant_id
        and rm.user_id = auth.uid()
    )
  );

drop policy if exists "Restaurant finance users can insert input tax records" on public.restaurant_tax_input_records;
create policy "Restaurant finance users can insert input tax records"
  on public.restaurant_tax_input_records
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_input_records.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  );

drop policy if exists "Restaurant finance users can update input tax records" on public.restaurant_tax_input_records;
create policy "Restaurant finance users can update input tax records"
  on public.restaurant_tax_input_records
  for update
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_input_records.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_tax_input_records.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  );
