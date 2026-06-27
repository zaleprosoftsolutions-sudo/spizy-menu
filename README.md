# Spizy Menu — Day Closing to Cash & Bank Posting

This package connects the Day Closing payment snapshot to the Cash & Bank ledger.

## Included

- `src/features/restaurant/DayClosingManagement.jsx`
- `src/features/restaurant/DayClosingPaymentSnapshot.css`
- `src/features/restaurant/CashBankManagement.jsx`
- `supabase/sql/20260628_day_closing_cash_bank_posting.sql`
- `supabase/functions/post-day-closing-to-cash-bank/index.ts`

## What it adds

1. **Post to Cash & Bank** button inside Day Closing.
2. Duplicate posting protection per restaurant/date.
3. Posts ledger entries for:
   - cash + COD collections
   - card machine collections
   - online gateway collections
   - refund adjustments
   - cash surplus/shortage adjustment
4. Auto-creates default Cash & Bank accounts if missing:
   - Main Cash Drawer
   - Card Machine Settlement
   - Online Gateway Clearing
5. Cash & Bank ledger now shows entries as “Posted from Day Closing”.
6. Adds SQL-safe source/reference fields to account transactions.
7. Uses `rm.role::text` in policies to avoid enum empty-string errors.

## Install

From your project root:

```bash
unzip -o ~/Downloads/spizy_day_closing_cash_bank_posting.zip -d .
```

## Run SQL

Run this in Supabase SQL editor:

```text
supabase/sql/20260628_day_closing_cash_bank_posting.sql
```

## Deploy Edge Function

```bash
supabase functions deploy post-day-closing-to-cash-bank
```

## Usage flow

1. Open Day Closing.
2. Choose the closing date.
3. Click **Payment Snapshot**.
4. Save Draft or Close Day.
5. Click **Post to Cash & Bank**.
6. Open Cash & Bank and confirm the ledger entries.

## Important

This does not move money through gateways. It only posts accounting/ledger records inside Spizy. Customer gateway payments still belong to each restaurant’s own connected gateway account.
