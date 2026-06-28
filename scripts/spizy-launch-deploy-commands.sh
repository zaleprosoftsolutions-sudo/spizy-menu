#!/usr/bin/env bash
set -euo pipefail

cat <<'COMMANDS'
# Spizy launch deploy commands
# Review values before running.

# 1) Required secrets
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
supabase secrets set SPIZY_APP_URL="https://your-spizy-domain.com"
supabase secrets set SPIZY_CRON_SECRET="your_private_random_secret"
supabase secrets set MAMO_API_KEY="your_mamo_api_key"
supabase secrets set MAMO_API_BASE_URL="https://sandbox.dev.business.mamopay.com/manage_api/v1"

# 2) Core functions for launch
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment
supabase functions deploy generate-restaurant-notification-events
supabase functions deploy dispatch-restaurant-notifications

# 3) Existing operational functions to confirm/deploy
supabase functions deploy create-day-closing-payment-snapshot
supabase functions deploy post-day-closing-to-cash-bank
supabase functions deploy reverse-day-closing-cash-bank-posting
supabase functions deploy recalculate-cash-bank-balances
supabase functions deploy create-daily-finance-summary
supabase functions deploy record-payment-refund
supabase functions deploy create-paypal-checkout-order
supabase functions deploy capture-paypal-checkout-order

# 4) Final frontend build
npm run build
COMMANDS
