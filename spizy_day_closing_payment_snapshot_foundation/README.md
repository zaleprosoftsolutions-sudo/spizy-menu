# Spizy Menu — Day Closing Payment Snapshot Foundation

This package connects payment reconciliation with future Day Closing / Z Report / Cash & Bank posting.

## Included

```text
supabase/sql/20260628_day_closing_payment_snapshot_foundation.sql
supabase/functions/create-day-closing-payment-snapshot/index.ts
README.md
```

## What it adds

1. New table: `restaurant_day_closing_payment_snapshots`
2. One payment snapshot per restaurant per closing date
3. Collected total
4. Cash collected
5. Card collected
6. COD collected
7. Online/gateway collected
8. COD pending
9. Online pending
10. Refund total
11. Net collected after refunds
12. Gateway breakdown JSON
13. Issue breakdown JSON
14. Protected Edge Function to create/update the day snapshot
15. Safe RLS policies using `rm.role::text` to avoid the `app_role: ""` enum error

## Run SQL

```bash
# Run in Supabase SQL editor
supabase/sql/20260628_day_closing_payment_snapshot_foundation.sql
```

## Deploy function

```bash
supabase functions deploy create-day-closing-payment-snapshot
```

## Required global secret

```bash
supabase secrets set PUBLIC_SITE_URL="https://spizy.site"
```

No gateway secret is required here.

## Important rule

```text
Mamo Pay = Spizy restaurant subscription payments
Ziina / Stripe / Razorpay / Cashfree / PhonePe / Network / PayPal = each restaurant's own customer-payment account
```

## Notes

This package does not overwrite Day Closing UI files because the latest Day Closing module file was not provided in this step. It safely prepares the backend snapshot foundation first.

Next recommended step:

```text
Send latest DayClosingManagement.jsx / DayClosing CSS file so the snapshot button and summary cards can be added inside the Day Closing screen.
```
