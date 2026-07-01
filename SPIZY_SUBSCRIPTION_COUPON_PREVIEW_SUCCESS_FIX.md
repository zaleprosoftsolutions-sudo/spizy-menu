# Spizy subscription coupon preview + success refresh fix

This package improves the restaurant-owner subscription checkout flow after the Mamo integration started working.

## Changed files

- `src/features/restaurant/SubscriptionBillingManagement.jsx`
- `src/features/restaurant/SubscriptionBillingManagement.css`
- `supabase/functions/create-mamo-subscription-checkout/index.ts`

## What changed

1. Adds an Apply Coupon button inside the checkout review popup.
2. Validates coupon before checkout using `preview_only: true` on the existing checkout Edge Function.
3. Shows plan price, discount amount, and final Mamo amount before redirecting to Mamo.
4. If a user types a coupon but does not apply it, Go to Checkout is blocked and says Apply Coupon First.
5. After Mamo redirects back, the page verifies payment, fetches the latest restaurant subscription row, updates the status cards without manual refresh, shows a success message, refreshes billing history, and cleans Mamo return params from the URL.
6. Keeps Mamo custom_data within the 5-key limit.

## Deploy

```bash
unzip -o ~/Downloads/spizy_subscription_coupon_preview_success_fix.zip -d .
npm run build
supabase functions deploy create-mamo-subscription-checkout
```

Restart Vite during local testing:

```bash
Ctrl + C
npm run dev
```
