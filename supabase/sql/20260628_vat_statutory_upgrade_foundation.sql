-- Spizy Menu - UAE VAT statutory workflow foundation
-- Adds TRN, invoice numbering, VAT filing period lock/review and FTA-style return workpaper storage.
-- This is a management/statutory-preparation foundation. Accountant review is still recommended before official filing.

alter table public.restaurants
  add column if not exists tax_registration_number text,
  add column if not exists tax_invoice_prefix text default 'SPZ',
  add column if not exists tax_invoice_next_number integer not null default 1,
  add column if not exists tax_invoice_number_padding integer not null default 5,
  add column if not exists vat_pricing_mode text not null default 'tax_inclusive',
  add column if not exists vat_return_frequency text not null default 'quarterly',
  add column if not exists vat_accountant_email text;

alter table public.restaurants
  drop constraint if exists restaurants_vat_pricing_mode_check;

alter table public.restaurants
  add constraint restaurants_vat_pricing_mode_check
  check (vat_pricing_mode in ('tax_inclusive', 'tax_exclusive'));

alter table public.restaurants
  drop constraint if exists restaurants_vat_return_frequency_check;

alter table public.restaurants
  add constraint restaurants_vat_return_frequency_check
  check (vat_return_frequency in ('monthly', 'quarterly'));

alter table public.restaurants
  drop constraint if exists restaurants_tax_invoice_number_padding_check;

alter table public.restaurants
  add constraint restaurants_tax_invoice_number_padding_check
  check (tax_invoice_number_padding between 3 and 10);

create table if not exists public.restaurant_vat_filing_periods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  currency text not null default 'AED',
  trn text,
  pricing_mode text not null default 'tax_inclusive',
  taxable_sales numeric(14, 2) not null default 0,
  zero_rated_sales numeric(14, 2) not null default 0,
  exempt_sales numeric(14, 2) not null default 0,
  output_tax numeric(14, 2) not null default 0,
  input_tax numeric(14, 2) not null default 0,
  estimated_vat_payable numeric(14, 2) not null default 0,
  total_sales_gross numeric(14, 2) not null default 0,
  total_purchase_gross numeric(14, 2) not null default 0,
  return_payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_vat_filing_periods_status_check check (status in ('open', 'reviewed', 'closed')),
  constraint restaurant_vat_filing_periods_pricing_mode_check check (pricing_mode in ('tax_inclusive', 'tax_exclusive')),
  constraint restaurant_vat_filing_periods_period_check check (period_end >= period_start),
  constraint restaurant_vat_filing_periods_unique unique (restaurant_id, period_start, period_end)
);

create table if not exists public.restaurant_tax_invoice_sequences (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  invoice_prefix text not null default 'SPZ',
  next_invoice_number integer not null default 1,
  number_padding integer not null default 5,
  last_invoice_number text,
  last_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_tax_invoice_sequences_unique unique (restaurant_id),
  constraint restaurant_tax_invoice_sequences_next_number_check check (next_invoice_number >= 1),
  constraint restaurant_tax_invoice_sequences_padding_check check (number_padding between 3 and 10)
);

create table if not exists public.restaurant_vat_category_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_key text not null,
  category_label text not null,
  tax_rate numeric(8, 4) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_vat_category_settings_unique unique (restaurant_id, category_key),
  constraint restaurant_vat_category_settings_key_check check (category_key in ('standard', 'zero_rated', 'exempt', 'out_of_scope'))
);

create index if not exists idx_restaurant_vat_filing_periods_restaurant_period
  on public.restaurant_vat_filing_periods (restaurant_id, period_start, period_end);

create index if not exists idx_restaurant_vat_filing_periods_status
  on public.restaurant_vat_filing_periods (restaurant_id, status);

alter table public.restaurant_vat_filing_periods enable row level security;
alter table public.restaurant_tax_invoice_sequences enable row level security;
alter table public.restaurant_vat_category_settings enable row level security;

drop policy if exists restaurant_vat_filing_periods_select on public.restaurant_vat_filing_periods;
drop policy if exists restaurant_vat_filing_periods_modify on public.restaurant_vat_filing_periods;
drop policy if exists restaurant_tax_invoice_sequences_select on public.restaurant_tax_invoice_sequences;
drop policy if exists restaurant_tax_invoice_sequences_modify on public.restaurant_tax_invoice_sequences;
drop policy if exists restaurant_vat_category_settings_select on public.restaurant_vat_category_settings;
drop policy if exists restaurant_vat_category_settings_modify on public.restaurant_vat_category_settings;

create policy restaurant_vat_filing_periods_select
on public.restaurant_vat_filing_periods
for select
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_vat_filing_periods.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_vat_filing_periods.restaurant_id
      and rs.email = auth.email()
      and rs.is_active = true
      and rs.is_deleted = false
  )
);

create policy restaurant_vat_filing_periods_modify
on public.restaurant_vat_filing_periods
for all
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_vat_filing_periods.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_vat_filing_periods.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

create policy restaurant_tax_invoice_sequences_select
on public.restaurant_tax_invoice_sequences
for select
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_tax_invoice_sequences.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

create policy restaurant_tax_invoice_sequences_modify
on public.restaurant_tax_invoice_sequences
for all
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_tax_invoice_sequences.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_tax_invoice_sequences.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

create policy restaurant_vat_category_settings_select
on public.restaurant_vat_category_settings
for select
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_vat_category_settings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

create policy restaurant_vat_category_settings_modify
on public.restaurant_vat_category_settings
for all
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_vat_category_settings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_vat_category_settings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

insert into public.restaurant_vat_category_settings (restaurant_id, category_key, category_label, tax_rate, notes)
select r.id, seed.category_key, seed.category_label, seed.tax_rate, seed.notes
from public.restaurants r
cross join (
  values
    ('standard', 'Standard rated', 5, 'Normal UAE VAT taxable sales.'),
    ('zero_rated', 'Zero-rated', 0, 'Eligible zero-rated supply.'),
    ('exempt', 'Exempt', 0, 'Exempt supply, no output VAT.'),
    ('out_of_scope', 'Out of scope', 0, 'Not part of UAE VAT return.')
) as seed(category_key, category_label, tax_rate, notes)
on conflict (restaurant_id, category_key) do nothing;

insert into public.restaurant_tax_invoice_sequences (restaurant_id, invoice_prefix, next_invoice_number, number_padding)
select id, coalesce(tax_invoice_prefix, 'SPZ'), coalesce(tax_invoice_next_number, 1), coalesce(tax_invoice_number_padding, 5)
from public.restaurants
on conflict (restaurant_id) do nothing;
