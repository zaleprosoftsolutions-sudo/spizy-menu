# Spizy Menu launch-tomorrow checklist

## 1. Apply latest launch accelerator package

```bash
unzip -o ~/Downloads/spizy_launch_accelerator_safe_mode.zip -d .
npm run build
```

## 2. Keep launch-safe mode enabled

Default behavior hides risky beta/foundation modules from the sidebar.

To keep it explicit in Vercel/local env:

```bash
VITE_SPIZY_LAUNCH_MODE=true
```

After launch, reveal every module again with:

```bash
VITE_SPIZY_SHOW_BETA_MODULES=true
```

## 3. Run SQL files before launch

Run all pending Supabase SQL files in order, especially:

- `20260628_staff_shift_closing_foundation.sql`
- `20260628_mamo_subscription_billing_foundation.sql`
- `20260628_inventory_cogs_profit_foundation.sql`
- `20260628_gateway_refund_automation_center.sql`
- `20260628_vat_statutory_upgrade_foundation.sql`
- `20260628_restaurant_notification_center_foundation.sql`
- `20260628_tax_invoice_vat_center_foundation.sql`
- `20260628_notification_event_generator_foundation.sql`
- `20260628_notification_delivery_outbox_foundation.sql`
- `20260628_notification_provider_settings_foundation.sql`

## 4. Deploy must-have functions

```bash
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
supabase functions deploy generate-restaurant-notification-events
supabase functions deploy dispatch-restaurant-notifications
```

Confirm already existing payment/day closing functions are deployed before customer testing.

## 5. Launch smoke test

Test this minimum flow:

1. Owner login
2. Onboarding opens
3. Add menu item
4. Create QR table
5. Public QR menu opens
6. Customer places order
7. Owner sees order
8. Customer requests bill/complete
9. Owner completes bill/payment
10. Day Closing opens
11. Cash & Bank opens
12. Subscription page opens
13. Launch QA page opens
14. Public menu works on mobile
