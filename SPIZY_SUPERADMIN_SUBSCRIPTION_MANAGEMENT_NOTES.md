# Spizy Super Admin Subscription Management

This package connects the Super Admin dashboard to subscription management and subscription discount coupons.

## Apply

```bash
unzip -o ~/Downloads/spizy_superadmin_subscription_management.zip -d .
npm run build
```

## SQL

Run this if not already applied from the previous subscription launch package:

```txt
supabase/sql/20260629_subscription_coupons_superadmin.sql
```

## Edge Functions

Deploy:

```bash
supabase functions deploy manage-spizy-subscription-coupons
supabase functions deploy manage-spizy-subscriptions
```

## What is included

- Super Admin dashboard now renders:
  - RestaurantsManagement
  - SuperAdminSubscriptionsManagement
  - SubscriptionCouponAdmin
  - ProjectExpensesManagement
  - SalesChannelAnalytics
- Super admin can create/toggle coupons through the existing coupon Edge Function.
- Super admin can view subscription status, manually extend trial, mark monthly/yearly active, and suspend subscriptions through the new service-role Edge Function.

Mamo Pay remains only for Spizy SaaS subscription payments. Restaurant customer payments are still restaurant-owned gateway flows.
