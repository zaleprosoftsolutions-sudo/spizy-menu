-- Spizy Cash & Bank / Accounts Ledger foundation

create table if not exists public.restaurant_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  account_name text not null,
  account_type text not null default 'cash',
  currency text not null default 'AED',
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_finance_accounts_account_type_check check (
    account_type in (
      'cash',
      'petty_cash',
      'bank',
      'card_machine',
      'online_gateway',
      'wallet',
      'other'
    )
  ),
  constraint restaurant_finance_accounts_currency_check check (
    currency in ('AED', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR', 'INR')
  )
);

create index if not exists restaurant_finance_accounts_restaurant_idx
on public.restaurant_finance_accounts(restaurant_id, is_active, account_type);

create table if not exists public.restaurant_account_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  account_id uuid not null references public.restaurant_finance_accounts(id) on delete cascade,
  related_account_id uuid references public.restaurant_finance_accounts(id) on delete set null,
  transaction_type text not null,
  amount numeric(12,2) not null default 0,
  transaction_date date not null default current_date,
  title text,
  description text,
  reference_type text,
  reference_id uuid,
  payment_method text,
  is_voided boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint restaurant_account_transactions_type_check check (
    transaction_type in (
      'opening',
      'income',
      'expense',
      'transfer_in',
      'transfer_out',
      'adjustment_in',
      'adjustment_out'
    )
  ),
  constraint restaurant_account_transactions_amount_check check (amount >= 0)
);

create index if not exists restaurant_account_transactions_restaurant_idx
on public.restaurant_account_transactions(restaurant_id, transaction_date desc, created_at desc);

create index if not exists restaurant_account_transactions_account_idx
on public.restaurant_account_transactions(account_id, transaction_date desc, created_at desc);

alter table public.restaurant_finance_accounts enable row level security;
alter table public.restaurant_account_transactions enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_finance_accounts_touch_updated_at on public.restaurant_finance_accounts;
create trigger restaurant_finance_accounts_touch_updated_at
before update on public.restaurant_finance_accounts
for each row execute function public.touch_updated_at();

create or replace function public.restaurant_account_transaction_delta(
  p_type text,
  p_amount numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_type in ('opening', 'income', 'transfer_in', 'adjustment_in') then coalesce(p_amount, 0)
    when p_type in ('expense', 'transfer_out', 'adjustment_out') then -coalesce(p_amount, 0)
    else 0
  end;
$$;

create or replace function public.sync_restaurant_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_delta numeric := 0;
  new_delta numeric := 0;
begin
  if tg_op = 'INSERT' then
    if new.is_voided = false then
      new_delta := public.restaurant_account_transaction_delta(new.transaction_type, new.amount);

      update public.restaurant_finance_accounts
      set current_balance = current_balance + new_delta,
          updated_at = now()
      where id = new.account_id
        and restaurant_id = new.restaurant_id;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_voided = false then
      old_delta := public.restaurant_account_transaction_delta(old.transaction_type, old.amount);
    end if;

    if new.is_voided = false then
      new_delta := public.restaurant_account_transaction_delta(new.transaction_type, new.amount);
    end if;

    if old.account_id = new.account_id then
      update public.restaurant_finance_accounts
      set current_balance = current_balance - old_delta + new_delta,
          updated_at = now()
      where id = new.account_id
        and restaurant_id = new.restaurant_id;
    else
      update public.restaurant_finance_accounts
      set current_balance = current_balance - old_delta,
          updated_at = now()
      where id = old.account_id
        and restaurant_id = old.restaurant_id;

      update public.restaurant_finance_accounts
      set current_balance = current_balance + new_delta,
          updated_at = now()
      where id = new.account_id
        and restaurant_id = new.restaurant_id;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_voided = false then
      old_delta := public.restaurant_account_transaction_delta(old.transaction_type, old.amount);

      update public.restaurant_finance_accounts
      set current_balance = current_balance - old_delta,
          updated_at = now()
      where id = old.account_id
        and restaurant_id = old.restaurant_id;
    end if;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists restaurant_account_transactions_balance_sync on public.restaurant_account_transactions;
create trigger restaurant_account_transactions_balance_sync
after insert or update or delete on public.restaurant_account_transactions
for each row execute function public.sync_restaurant_account_balance();

drop policy if exists "Restaurant finance accounts member select" on public.restaurant_finance_accounts;
drop policy if exists "Restaurant finance accounts member insert" on public.restaurant_finance_accounts;
drop policy if exists "Restaurant finance accounts member update" on public.restaurant_finance_accounts;
drop policy if exists "Restaurant finance accounts member delete" on public.restaurant_finance_accounts;

create policy "Restaurant finance accounts member select"
on public.restaurant_finance_accounts
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant finance accounts member insert"
on public.restaurant_finance_accounts
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant finance accounts member update"
on public.restaurant_finance_accounts
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

create policy "Restaurant finance accounts member delete"
on public.restaurant_finance_accounts
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant account transactions member select" on public.restaurant_account_transactions;
drop policy if exists "Restaurant account transactions member insert" on public.restaurant_account_transactions;
drop policy if exists "Restaurant account transactions member update" on public.restaurant_account_transactions;
drop policy if exists "Restaurant account transactions member delete" on public.restaurant_account_transactions;

create policy "Restaurant account transactions member select"
on public.restaurant_account_transactions
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant account transactions member insert"
on public.restaurant_account_transactions
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant account transactions member update"
on public.restaurant_account_transactions
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

create policy "Restaurant account transactions member delete"
on public.restaurant_account_transactions
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
