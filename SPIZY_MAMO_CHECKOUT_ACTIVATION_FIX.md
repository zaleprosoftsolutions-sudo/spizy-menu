# Spizy Mamo checkout + activation fix

This package fixes the working subscription page's Mamo checkout flow.

Changed files:
- `src/features/restaurant/SubscriptionBillingManagement.jsx`
- `supabase/functions/create-mamo-subscription-checkout/index.ts`
- `supabase/functions/verify-mamo-subscription-payment/index.ts`

What changed:
- Mamo checkout creation now uses a simpler Mamo-compatible payment link payload.
- Localhost return URLs are not sent to Mamo; the Edge Function uses `SPIZY_APP_URL` / `SPIZY_LIVE_APP_URL` or falls back to `https://spizy.site`.
- Logged-in user email is passed and stored automatically as `customer_email`.
- Mamo errors are returned clearly in the UI and saved in `raw_response` on failed attempts.
- The UI no longer stays stuck forever; it has a 45-second timeout.
- After a captured Mamo return, the restaurant subscription is activated and the page reloads cleanly to show the updated plan.

Required Supabase secrets:
- `MAMO_API_KEY`
- `MAMO_API_BASE_URL` (use the correct sandbox or production base URL from Mamo API docs/dashboard)
- `SPIZY_APP_URL=https://spizy.site`

Deploy:
```bash
unzip -o ~/Downloads/spizy_mamo_checkout_activation_fix.zip -d .
npm run build
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
```
