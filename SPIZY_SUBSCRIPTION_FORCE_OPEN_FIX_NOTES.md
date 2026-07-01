# Spizy Subscription Force Open + Trial Visibility Fix

This package fixes the restaurant sidebar Subscription & Plans click reliability.

## Key changes

- `Subscription & Plans` sidebar item now uses a direct `/dashboard?section=subscription-billing` route assignment, so it opens even if older launch-safe state or router search params block the SPA handler.
- `RestaurantDashboard.jsx` reads a forced section key from localStorage and uses React Router navigate to keep URL and active section in sync.
- `RestaurantOverview.jsx` now also shows a visible subscription/trial action inside the Owner Command Center hero, so the trial countdown/subscribe action is visible even if the sticky trial bar is hidden by old CSS.
- `SubscriptionBillingManagement.jsx` keeps the requested prices: AED 75 monthly and AED 750 yearly.
- Mamo Pay functions are included and remain for Spizy subscription payments only.

## Apply

```bash
unzip -o ~/Downloads/spizy_subscription_force_open_trial_visibility_fix.zip -d .
npm run build
```

## Deploy functions

```bash
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
```
