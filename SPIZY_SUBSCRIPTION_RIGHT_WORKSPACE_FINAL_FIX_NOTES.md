# Spizy Subscription Right Workspace Final Fix

Fixes:
- Subscription & Plans opens in the right workspace again, not a popup/modal.
- Direct `/dashboard?section=subscription-billing` renders through `RestaurantDashboard.jsx` normal routing.
- Trial restaurants now show Current Plan = Trial, not Monthly.
- Monthly plan is clickable during trial.
- Yearly plan is clickable during trial and remains available as an upgrade for monthly subscribers.
- Pricing updated: AED 75/month and AED 750/year.
- Mamo Pay checkout remains backend-only through `create-mamo-subscription-checkout`.

After applying:
```bash
unzip -o ~/Downloads/spizy_subscription_right_workspace_final_fix.zip -d .
npm run build
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
```
