# Spizy Mamo custom_data 5 keys fix

Fixes Mamo validation error:

```json
{"errors":["custom_data max keys allowed is 5"]}
```

## Changed file

- `supabase/functions/create-mamo-subscription-checkout/index.ts`

## Change

The Mamo `custom_data` payload is reduced to exactly 5 keys:

- `source`
- `attempt_id`
- `restaurant_id`
- `plan_key`
- `coupon_code`

All other subscription details remain saved in Supabase in `restaurant_subscription_payment_attempts` before the Mamo checkout request is created.

## Deploy

```bash
unzip -o ~/Downloads/spizy_mamo_custom_data_5_keys_fix.zip -d .
supabase functions deploy create-mamo-subscription-checkout
```
