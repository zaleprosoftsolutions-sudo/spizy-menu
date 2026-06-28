# Spizy Menu - VAT Period Close Foundation

This package adds a VAT period close workflow inside Cash & Bank → Tax / VAT.

## Files included

- `src/features/restaurant/CashBankManagement.jsx`
- `src/features/restaurant/CashBankVatClose.css`
- `supabase/sql/20260628_vat_period_close_foundation.sql`

## What it adds

- VAT Period Close panel inside Tax / VAT
- Mark Reviewed button
- Close VAT Period button
- Reopen Period button
- VAT close status in Tax CSV
- VAT close status in printable Tax report
- New table: `restaurant_tax_vat_period_closings`
- Safe RLS policies using `rm.role::text`

## Required setup

Run this SQL in Supabase:

```text
supabase/sql/20260628_vat_period_close_foundation.sql
```

No Edge Function is required.

## Important

This remains a management VAT estimate workflow. It is not final statutory VAT filing. Later you can add TRN, VAT filing boxes, item-level taxes, accountant approval and official return export.
