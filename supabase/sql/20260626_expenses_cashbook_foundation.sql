-- Spizy Expenses & Cashbook foundation
-- Run this once in Supabase SQL Editor.

create table if not exists public.restaurant_expense_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  color text,
  is_system boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table if not exists public.restaurant_expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.restaurant_expense_categories(id) on delete set null,
  title text not null,
  expense_date date not null default current_date,
  amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  payment_method text not null default 'cash',
  vendor_name text,
  invoice_number text,
  notes text,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_expenses_payment_method_check check (
    payment_method in ('cash', 'card', 'bank', 'online', 'upi', 'wallet', 'other')
  ),
  constraint restaurant_expenses_amount_check check (amount >= 0),
  constraint restaurant_expenses_tax_amount_check check (tax_amount >= 0),
  constraint restaurant_expenses_total_amount_check check (total_amount >= 0)
);

create index if not exists restaurant_expense_categories_restaurant_idx
on public.restaurant_expense_categories (restaurant_id, is_deleted);

create index if not exists restaurant_expenses_restaurant_date_idx
on public.restaurant_expenses (restaurant_id, expense_date desc, is_deleted);

create index if not exists restaurant_expenses_category_idx
on public.restaurant_expenses (category_id);

alter table public.restaurant_expense_categories enable row level security;
alter table public.restaurant_expenses enable row level security;

drop policy if exists "Restaurant expense categories select access" on public.restaurant_expense_categories;
drop policy if exists "Restaurant expense categories insert access" on public.restaurant_expense_categories;
drop policy if exists "Restaurant expense categories update access" on public.restaurant_expense_categories;
drop policy if exists "Restaurant expenses select access" on public.restaurant_expenses;
drop policy if exists "Restaurant expenses insert access" on public.restaurant_expenses;
drop policy if exists "Restaurant expenses update access" on public.restaurant_expenses;

create policy "Restaurant expense categories select access"
on public.restaurant_expense_categories
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant expense categories insert access"
on public.restaurant_expense_categories
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant expense categories update access"
on public.restaurant_expense_categories
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

create policy "Restaurant expenses select access"
on public.restaurant_expenses
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant expenses insert access"
on public.restaurant_expenses
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant expenses update access"
on public.restaurant_expenses
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

create or replace function public.set_restaurant_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_restaurant_expense_categories_updated_at on public.restaurant_expense_categories;
create trigger set_restaurant_expense_categories_updated_at
before update on public.restaurant_expense_categories
for each row execute function public.set_restaurant_expenses_updated_at();

drop trigger if exists set_restaurant_expenses_updated_at on public.restaurant_expenses;
create trigger set_restaurant_expenses_updated_at
before update on public.restaurant_expenses
for each row execute function public.set_restaurant_expenses_updated_at();
