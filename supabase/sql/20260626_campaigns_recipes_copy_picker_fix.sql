alter table public.restaurant_campaigns
  drop constraint if exists restaurant_campaigns_button_target_check;

alter table public.restaurant_campaigns
  add constraint restaurant_campaigns_button_target_check
  check (button_target in ('coupon', 'cart', 'recipes', 'link', 'none'));
