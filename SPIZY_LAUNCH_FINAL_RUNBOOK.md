# Spizy Menu Launch Final Runbook

Use this as the final launch-day checklist before public announcement.

## 1. Apply latest launch-safe ZIP

```bash
unzip -o ~/Downloads/spizy_launch_accelerator_safe_mode.zip -d .
npm run build
```

Launch-safe mode hides heavy beta/foundation modules by default and keeps the stable launch modules visible.

## 2. Run final local checks

```bash
bash scripts/spizy-launch-final-check.sh
```

This checks:
- unsupported `CREATE POLICY IF NOT EXISTS`
- duplicate obvious dashboard section IDs
- required launch files
- build status

## 3. Run SQL migrations in Supabase SQL Editor

Run only the SQL files for the features you want enabled before launch.

Core launch recommended:

```txt
supabase/sql/20260628_staff_shift_closing_foundation.sql
supabase/sql/20260628_mamo_subscription_billing_foundation.sql
supabase/sql/20260628_restaurant_notification_center_foundation.sql
supabase/sql/20260628_notification_event_generator_foundation.sql
supabase/sql/20260628_notification_delivery_outbox_foundation.sql
supabase/sql/20260628_notification_provider_settings_foundation.sql
supabase/sql/20260628_tax_invoice_vat_center_foundation.sql
```

Optional beta/foundation SQL, run after launch if you are not showing beta modules:

```txt
supabase/sql/20260628_inventory_cogs_profit_foundation.sql
supabase/sql/20260628_gateway_refund_automation_center.sql
supabase/sql/20260628_vat_statutory_upgrade_foundation.sql
```

Important: PostgreSQL does not support `CREATE POLICY IF NOT EXISTS`. If you see this error, replace with:

```sql
drop policy if exists "Policy name" on table_name;
create policy "Policy name" on table_name ...;
```

## 4. Set required Supabase secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
supabase secrets set SPIZY_APP_URL="https://your-spizy-domain.com"
supabase secrets set SPIZY_CRON_SECRET="your_private_random_secret"
supabase secrets set MAMO_API_KEY="your_mamo_api_key"
supabase secrets set MAMO_API_BASE_URL="https://sandbox.dev.business.mamopay.com/manage_api/v1"
```

For live Mamo, change `MAMO_API_BASE_URL` to the live URL from your Mamo dashboard/docs.

Never place service role keys, Mamo keys, WhatsApp keys, or email provider keys in frontend `.env` files.

## 5. Deploy Supabase Edge Functions

Core launch recommended:

```bash
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
supabase functions deploy generate-restaurant-notification-events
supabase functions deploy dispatch-restaurant-notifications
```

Also confirm older functions are deployed if used:

```bash
supabase functions deploy create-day-closing-payment-snapshot
supabase functions deploy post-day-closing-to-cash-bank
supabase functions deploy reverse-day-closing-cash-bank-posting
supabase functions deploy recalculate-cash-bank-balances
supabase functions deploy create-daily-finance-summary
supabase functions deploy record-payment-refund
supabase functions deploy create-paypal-checkout-order
supabase functions deploy capture-paypal-checkout-order
```

## 6. Vercel environment variables for launch

Recommended for launch-safe mode:

```txt
VITE_SPIZY_LAUNCH_MODE=true
VITE_SPIZY_SHOW_BETA_MODULES=false
VITE_APP_URL=https://your-spizy-domain.com
```

After launch, you can show beta/foundation modules:

```txt
VITE_SPIZY_SHOW_BETA_MODULES=true
```

## 7. Final real restaurant simulation

Before announcement, complete one full flow:

1. Create/login restaurant owner.
2. Open Dashboard.
3. Open Onboarding.
4. Add restaurant name, slug, phone, currency, VAT/tax rate.
5. Add menu category and product.
6. Create QR table.
7. Open public QR menu.
8. Place test dine-in order.
9. Open Orders and confirm order appears.
10. Customer requests bill/completion.
11. Owner completes bill.
12. Create Day Closing payment snapshot.
13. Save/close day.
14. Open Cash & Bank.
15. Check receipt/KOT print preview.
16. Open Launch QA.
17. Confirm no blank screens.
18. Test mobile screen width.
19. Test Mamo subscription checkout in sandbox.
20. Confirm public menu URL works in private/incognito browser.

## 8. Launch announcement positioning

Recommended launch wording:

> Spizy Menu is launching as a QR menu + restaurant operations platform. The launch version focuses on QR menu, orders, POS, customer payments, day closing, cash/bank tracking, receipts/KOT print readiness, onboarding, and owner dashboard. Advanced finance, VAT, notifications, COGS, and gateway refund automation are being opened step-by-step after launch.

This avoids overpromising unfinished beta modules while still presenting a strong product.
