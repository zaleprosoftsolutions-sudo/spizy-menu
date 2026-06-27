# Spizy SQL Fix — app_role enum policy error

This fixes:

`ERROR: 22P02: invalid input value for enum app_role: ""`

Cause:

`coalesce(rm.role, '')` is invalid when `rm.role` is a PostgreSQL enum. PostgreSQL tries to cast the empty string into the enum type.

Fix:

Policies now use `rm.role::text in (...)` and `p.role::text = 'super_admin'`.

## Run this SQL

`supabase/sql/20260628_fix_app_role_enum_policy.sql`

After it succeeds, rerun:

`supabase/sql/20260628_payment_reconciliation_summary.sql`

If the original SQL still contains the broken policy block, skip rerunning it and continue with the app because this fix creates the needed snapshot table/policies safely.
