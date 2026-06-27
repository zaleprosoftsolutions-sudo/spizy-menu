# Spizy Menu — Gateway Connection Test + Activation Safety

This package continues the restaurant-owned gateway architecture.

Important payment rule:
- Mamo Pay is for Spizy/Zalepro collecting restaurant subscription fees.
- Ziina/Stripe/Razorpay/etc. are for each restaurant collecting payments from its own customers.
- Spizy only provides the SaaS platform and must not use a shared Spizy/Zalepro merchant account for restaurant customer payments.

## What changed

1. Restaurant Settings now shows a Ziina connection status panel.
2. Restaurant owners can click **Test Ziina connection** after saving their own Ziina token.
3. The test is performed by a protected Supabase Edge Function.
4. The public menu will hide Ziina checkout if Ziina is enabled but the restaurant has not saved backend credentials yet.
5. The credential table now stores public-safe test metadata: last tested time, status, and message.
6. The save credentials function updates public-safe `payment_gateway_settings.ziina.connection_status` without exposing secrets.

## Included files

```text
src/pages/PublicMenuPage.jsx
src/features/restaurant/SettingsManagement.jsx
src/features/restaurant/SettingsManagement.css
supabase/sql/20260627_gateway_connection_tests.sql
supabase/functions/save-restaurant-gateway-credentials/index.ts
supabase/functions/test-restaurant-gateway-connection/index.ts
README.md
```

## Install

From your project root:

```bash
unzip -o ~/Downloads/spizy_gateway_connection_tests.zip -d .
```

## Supabase SQL

Run this SQL after unzip:

```text
supabase/sql/20260627_gateway_connection_tests.sql
```

## Deploy functions

```bash
supabase functions deploy save-restaurant-gateway-credentials
supabase functions deploy test-restaurant-gateway-connection
```

Keep your existing function deployments too:

```bash
supabase functions deploy create-ziina-payment-intent
supabase functions deploy ziina-payment-webhook
```

## Required runtime secret

```bash
supabase secrets set PUBLIC_SITE_URL="https://spizy.site"
```

Do **not** set a global `ZIINA_ACCESS_TOKEN` for restaurant customer orders. Each restaurant saves its own Ziina access token from Settings.
