# Spizy Pro Dashboard + Subscription Visibility Fix

This package fixes the launch dashboard UI concerns:

- Left restaurant sidebar and right workspace now scroll independently.
- Main dashboard header area is kept sticky by constraining the dashboard card to the viewport.
- Trial countdown / Subscribe Now bar is visible inside the restaurant workspace and stays sticky while right side scrolls.
- Subscription & Plans is visible in the restaurant sidebar Daily Operations group.
- Sidebar search and accordion group open/scroll memory are preserved.
- Super Admin dashboard now has a left-side navigation and independent right workspace.
- Super Admin subscription management and discount coupon management are connected using the correct `src/superAdmin` folder path.

Run after applying:

```bash
npm run build
```

SQL and function deploys if not already done:

```bash
supabase sql # run supabase/sql/20260629_subscription_coupons_superadmin.sql in SQL editor
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
supabase functions deploy manage-spizy-subscription-coupons
supabase functions deploy manage-spizy-subscriptions
```

Mamo Pay remains only for Spizy subscription payments. Restaurant customer payment gateway architecture is untouched.
