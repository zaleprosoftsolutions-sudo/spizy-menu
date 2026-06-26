-- Spizy Delivery Management foundation
-- Adds dispatch fields and keeps delivery order status values safe for the dashboard.

alter table public.restaurant_orders
add column if not exists delivery_assignee_name text,
add column if not exists delivery_assignee_phone text,
add column if not exists delivery_payment_collection_method text,
add column if not exists delivery_notes text,
add column if not exists out_for_delivery_at timestamptz,
add column if not exists delivered_at timestamptz;

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_status_check;

alter table public.restaurant_orders
add constraint restaurant_orders_status_check
check (
  status in (
    'order_received',
    'preparing',
    'ready',
    'served',
    'bill_requested',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled'
  )
);

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_delivery_payment_collection_method_check;

alter table public.restaurant_orders
add constraint restaurant_orders_delivery_payment_collection_method_check
check (
  delivery_payment_collection_method is null
  or delivery_payment_collection_method in ('cash', 'card_machine')
);

create index if not exists restaurant_orders_delivery_board_idx
on public.restaurant_orders (restaurant_id, order_type, status, created_at);
