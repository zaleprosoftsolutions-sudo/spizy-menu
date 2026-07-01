# Spizy Super Admin Coupon + Mamo Checkout Popup Fix

## Fixes
- Super Admin coupon Edge Function 403 by reading app role from `profiles.role` instead of JWT platform role.
- Super Admin subscriptions Edge Function gets the same role fix.
- Coupon admin UI shows real Edge Function error messages instead of only “non-2xx”.
- Restaurant subscription buttons are shortened to “Subscribe Now” / “Upgrade Yearly”.
- Restaurant subscription checkout now opens a pricing review popup with optional coupon code before creating the Mamo Pay checkout link.
- Keeps Mamo custom_data within the 5-key limit.

## Apply
```bash
unzip -o ~/Downloads/spizy_superadmin_coupon_mamo_popup_fix.zip -d .
npm run build
```

## Deploy required functions
```bash
supabase functions deploy manage-spizy-subscription-coupons
supabase functions deploy manage-spizy-subscriptions
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
```

## SQL if not already applied
Run `supabase/sql/20260701_superadmin_subscription_coupon_center.sql` in Supabase SQL editor or `supabase db push`.
