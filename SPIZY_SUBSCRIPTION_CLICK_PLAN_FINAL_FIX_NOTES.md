# Spizy Subscription Click + Plan Pricing Final Fix

This package fixes the restaurant subscription menu click issue and updates Spizy subscription pricing.

## Fixes

- Subscription & Plans remains visible in restaurant sidebar.
- Clicking Subscription & Plans now opens `subscription-billing` even if launch-safe filtering or older `launchMode` filtering would otherwise hide it.
- Trial countdown bar is rendered inside the right workspace as a visible sticky bar.
- Subscribe Now button opens the subscription page.
- Monthly plan updated to AED 75.
- Yearly plan updated to AED 750.
- Monthly active subscribers see upgrade to yearly option.
- Mamo Pay checkout function updated to use AED 75 / AED 750 pricing.

## Apply

```bash
unzip -o ~/Downloads/spizy_subscription_click_plan_final_fix.zip -d .
npm run build
```

## Deploy function

```bash
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
```

Mamo Pay remains only for Spizy subscription billing, not restaurant customer payments.
