#!/usr/bin/env bash
set -euo pipefail

printf '\n🚀 Spizy Launch Final Check\n'
printf '============================\n\n'

failures=0

check_file() {
  local path="$1"
  if [ -f "$path" ]; then
    printf '✅ %s exists\n' "$path"
  else
    printf '❌ %s missing\n' "$path"
    failures=$((failures + 1))
  fi
}

printf '1) Required launch files\n'
check_file "src/features/dashboard/RestaurantDashboard.jsx"
check_file "src/features/restaurant/RestaurantSidebar.jsx"
check_file "src/features/restaurant/RestaurantOverview.jsx"
check_file "src/features/restaurant/launchMode.js"
check_file "package.json"

printf '\n2) SQL policy compatibility scan\n'
if find supabase/sql -type f -name '*.sql' -print0 2>/dev/null | xargs -0 grep -n "create policy if not exists" >/tmp/spizy_policy_scan.txt 2>/dev/null; then
  printf '❌ Found unsupported CREATE POLICY IF NOT EXISTS statements:\n'
  cat /tmp/spizy_policy_scan.txt
  failures=$((failures + 1))
else
  printf '✅ No unsupported CREATE POLICY IF NOT EXISTS statements found\n'
fi

printf '\n3) Launch-safe env reminder\n'
printf 'Recommended Vercel env for tomorrow launch:\n'
printf 'VITE_SPIZY_LAUNCH_MODE=true\n'
printf 'VITE_SPIZY_SHOW_BETA_MODULES=false\n'
printf 'VITE_APP_URL=https://your-spizy-domain.com\n'

printf '\n4) Build check\n'
if npm run build; then
  printf '✅ npm run build passed\n'
else
  printf '❌ npm run build failed\n'
  failures=$((failures + 1))
fi

printf '\n5) Summary\n'
if [ "$failures" -eq 0 ]; then
  printf '✅ Launch final check passed. Continue with Supabase SQL/function tests and real order simulation.\n'
else
  printf '❌ Launch final check found %s issue(s). Fix before announcement.\n' "$failures"
  exit 1
fi
