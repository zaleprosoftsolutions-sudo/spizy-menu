# Spizy Subscription Launch Upgrade

## Apply

```bash
unzip -o ~/Downloads/spizy_subscription_launch_upgrade.zip -d .
npm run build
```

## SQL

Run this in Supabase SQL Editor:

```txt
supabase/sql/20260629_subscription_coupons_superadmin.sql
```

## Edge Functions

Deploy:

```bash
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
supabase functions deploy manage-spizy-subscription-coupons
```

## Required secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
supabase secrets set MAMO_API_KEY="your_mamo_api_key"
supabase secrets set MAMO_API_BASE_URL="https://sandbox.dev.business.mamopay.com/manage_api/v1"
supabase secrets set SPIZY_APP_URL="https://spizy.site"
```

## Super admin coupon UI

The component is included at:

```txt
src/features/superadmin/SubscriptionCouponAdmin.jsx
```

Wire this into the existing Super Admin dashboard file after sharing that file. The backend function protects coupon management and allows only users with `app_metadata.role` or `user_metadata.role` equal to `super_admin` or `partner_admin`.
