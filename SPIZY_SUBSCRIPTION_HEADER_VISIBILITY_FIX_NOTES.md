# Spizy Subscription Header Visibility Fix

This package fixes the post-deploy visibility issues reported on 2026-06-29:

1. Restaurant dashboard header was scrolling away.
2. Trial countdown + Subscribe Now button was not visible.
3. Subscription menu was not visible in the left sidebar.
4. Super Admin discount/subscription management was not visible.
5. Sidebar and right workspace needed stable independent scrolling.

## Main changes

- Adds `SubscriptionTrialHeaderBar` to the restaurant dashboard.
- Adds `Subscription & Plans` to the top Daily Operations sidebar group.
- Adds stronger layout CSS so the top dashboard header stays visible and right/left panels scroll independently.
- Connects Super Admin Subscription Management and Coupon Management into `SuperAdminDashboard.jsx`.
- Re-includes subscription/coupon management Edge Functions and SQL.

## Apply

```bash
unzip -o ~/Downloads/spizy_subscription_header_visibility_fix.zip -d .
npm run build
```

## SQL

Run if not already applied:

```txt
supabase/sql/20260629_subscription_coupons_superadmin.sql
```

## Functions

```bash
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
supabase functions deploy manage-spizy-subscription-coupons
supabase functions deploy manage-spizy-subscriptions
```

## Secrets

```bash
supabase secrets set MAMO_API_KEY="your_mamo_api_key"
supabase secrets set MAMO_API_BASE_URL="https://sandbox.dev.business.mamopay.com/manage_api/v1"
supabase secrets set SPIZY_APP_URL="https://spizy.site"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
```

Mamo Pay remains only for Spizy SaaS subscription payments, not restaurant customer payments.
