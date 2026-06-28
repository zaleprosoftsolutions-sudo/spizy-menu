#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Spizy launch check"
echo "----------------------"

if [ ! -f package.json ]; then
  echo "❌ package.json not found. Run this from the project root."
  exit 1
fi

echo "1) Checking for unsupported CREATE POLICY IF NOT EXISTS..."
if grep -R "create policy if not exists" -i supabase/sql >/dev/null 2>&1; then
  echo "❌ Found unsupported CREATE POLICY IF NOT EXISTS in supabase/sql"
  grep -R "create policy if not exists" -in supabase/sql || true
  exit 1
fi
echo "✅ SQL policy syntax check passed"

echo "2) Running production build..."
npm run build

echo "✅ Build completed"
echo ""
echo "Next manual checks:"
echo "- Open Dashboard, Onboarding, POS, Orders, Day Closing, Cash & Bank, Subscription, Launch QA"
echo "- Open public QR menu on mobile"
echo "- Place one test order and complete bill flow"
