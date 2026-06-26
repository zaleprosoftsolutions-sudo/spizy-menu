create table if not exists public.restaurant_print_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  printer_mode text not null default 'browser_print',
  paper_size text not null default '80mm',
  receipt_print_enabled boolean not null default true,
  kitchen_print_enabled boolean not null default true,
  auto_print_pos_order boolean not null default false,
  auto_print_customer_order boolean not null default false,
  receipt_title text not null default 'Tax Invoice / Receipt',
  receipt_footer_note text not null default 'Thank you. Visit again.',
  tax_registration_number text,
  invoice_prefix text not null default 'INV',
  next_invoice_number integer not null default 1001,
  receipt_copy_count integer not null default 1,
  show_restaurant_logo boolean not null default true,
  show_customer_info boolean not null default true,
  show_payment_info boolean not null default true,
  show_qr_code boolean not null default false,
  kot_group_by_category boolean not null default true,
  kot_show_customer_notes boolean not null default true,
  kot_show_table_name boolean not null default true,
  kot_large_item_text boolean not null default true,
  kot_highlight_variations boolean not null default true,
  print_header_text text,
  print_footer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_print_settings_restaurant_unique unique (restaurant_id),
  constraint restaurant_print_settings_printer_mode_check check (
    printer_mode in ('browser_print', 'silent_print_later', 'manual_only')
  ),
  constraint restaurant_print_settings_paper_size_check check (
    paper_size in ('58mm', '80mm', 'a4')
  ),
  constraint restaurant_print_settings_copy_count_check check (
    receipt_copy_count between 1 and 5
  ),
  constraint restaurant_print_settings_next_invoice_check check (
    next_invoice_number >= 1
  )
);

alter table public.restaurant_print_settings enable row level security;

create index if not exists restaurant_print_settings_restaurant_idx
on public.restaurant_print_settings (restaurant_id);

drop policy if exists "Restaurant print settings select access" on public.restaurant_print_settings;
drop policy if exists "Restaurant print settings insert access" on public.restaurant_print_settings;
drop policy if exists "Restaurant print settings update access" on public.restaurant_print_settings;
drop policy if exists "Restaurant print settings delete access" on public.restaurant_print_settings;

create policy "Restaurant print settings select access"
on public.restaurant_print_settings
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant print settings insert access"
on public.restaurant_print_settings
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant print settings update access"
on public.restaurant_print_settings
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

create policy "Restaurant print settings delete access"
on public.restaurant_print_settings
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
