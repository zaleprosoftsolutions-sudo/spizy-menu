create table if not exists public.restaurant_payroll_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references public.restaurant_staffs(id) on delete cascade,
  salary_month text not null,
  base_salary numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  overtime_amount numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  advance_paid numeric(12,2) not null default 0,
  gross_pay numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_amount numeric(12,2) not null default 0,
  payment_method text not null default 'cash',
  status text not null default 'pending',
  paid_at date,
  notes text,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_payroll_salary_month_check check (salary_month ~ '^\d{4}-\d{2}$'),
  constraint restaurant_payroll_payment_method_check check (
    payment_method in ('cash', 'card', 'bank', 'online', 'upi', 'wallet', 'other')
  ),
  constraint restaurant_payroll_status_check check (
    status in ('pending', 'partially_paid', 'paid', 'cancelled')
  ),
  constraint restaurant_payroll_amounts_check check (
    base_salary >= 0
    and allowances >= 0
    and bonus_amount >= 0
    and overtime_amount >= 0
    and deductions >= 0
    and advance_paid >= 0
    and gross_pay >= 0
    and net_pay >= 0
    and paid_amount >= 0
    and balance_amount >= 0
  )
);

create index if not exists restaurant_payroll_restaurant_month_idx
on public.restaurant_payroll_records (restaurant_id, salary_month, is_deleted);

create index if not exists restaurant_payroll_staff_month_idx
on public.restaurant_payroll_records (staff_id, salary_month, is_deleted);

create unique index if not exists restaurant_payroll_unique_staff_month_idx
on public.restaurant_payroll_records (restaurant_id, staff_id, salary_month)
where is_deleted = false;

alter table public.restaurant_payroll_records enable row level security;

drop policy if exists "Restaurant payroll member select" on public.restaurant_payroll_records;
drop policy if exists "Restaurant payroll member insert" on public.restaurant_payroll_records;
drop policy if exists "Restaurant payroll member update" on public.restaurant_payroll_records;
drop policy if exists "Restaurant payroll member delete" on public.restaurant_payroll_records;

create policy "Restaurant payroll member select"
on public.restaurant_payroll_records
for select
to authenticated
using (
  is_deleted = false
  and (
    public.is_restaurant_member(restaurant_id)
    or public.get_my_role() = 'super_admin'
  )
);

create policy "Restaurant payroll member insert"
on public.restaurant_payroll_records
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant payroll member update"
on public.restaurant_payroll_records
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

create policy "Restaurant payroll member delete"
on public.restaurant_payroll_records
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
