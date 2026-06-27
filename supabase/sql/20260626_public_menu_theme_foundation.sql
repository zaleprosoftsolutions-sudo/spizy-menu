-- Spizy public menu appearance / branding foundation

alter table public.restaurants
add column if not exists public_cover_url text,
add column if not exists public_menu_theme jsonb not null default '{
  "accent_color": "#ff7a18",
  "secondary_color": "#ffbf4d",
  "background_style": "dark",
  "header_style": "premium",
  "product_card_style": "compact",
  "show_cover_image": true,
  "show_logo": true,
  "show_social_links": true,
  "show_directions": true,
  "show_campaigns": true,
  "show_reviews": true
}'::jsonb;

comment on column public.restaurants.public_cover_url is 'Wide cover/banner image shown on public QR menu.';
comment on column public.restaurants.public_menu_theme is 'Public QR menu theme and visibility settings.';
