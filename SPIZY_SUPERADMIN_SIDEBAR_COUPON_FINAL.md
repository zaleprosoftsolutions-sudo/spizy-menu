# Spizy Super Admin Sidebar + Subscription Coupon Final

This package updates the active Super Admin dashboard file path:

- src/features/dashboard/roleDashboards/SuperAdminDashboard.jsx
- src/features/dashboard/roleDashboards/SuperAdminDashboard.css

It also adds/updates:

- src/features/superAdmin/SubscriptionCouponAdmin.jsx
- src/features/superAdmin/SubscriptionCouponAdmin.css
- src/features/superAdmin/SuperAdminSubscriptionsManagement.jsx
- src/features/superAdmin/SuperAdminSubscriptionsManagement.css
- src/features/restaurant/SubscriptionBillingManagement.jsx
- src/features/restaurant/SubscriptionBillingManagement.css
- supabase/functions/manage-spizy-subscription-coupons/index.ts
- supabase/functions/manage-spizy-subscriptions/index.ts
- supabase/functions/create-mamo-subscription-checkout/index.ts
- supabase/functions/verify-mamo-subscription-payment/index.ts
- supabase/sql/20260701_superadmin_subscription_coupon_center.sql

## Key fixes

1. Super Admin dashboard is now a left sidebar + right workspace.
2. Super Admin has a Discount Coupons page.
3. Super Admin can create AED 70 fixed discount coupon for testing.
4. Restaurant subscription page has optional coupon code input.
5. Mamo checkout function sends only 5 custom_data keys to satisfy Mamo validation.
6. Mamo checkout uses restaurant/user email automatically.
7. After payment verification, the restaurant subscription is activated and coupon redemption is recorded.

## Apply

unzip -o ~/Downloads/spizy_superadmin_sidebar_coupon_final.zip -d .
npm run build

Run SQL:

supabase db push

or manually run:

supabase/sql/20260701_superadmin_subscription_coupon_center.sql

Deploy functions:

supabase functions deploy manage-spizy-subscription-coupons
supabase functions deploy manage-spizy-subscriptions
supabase functions deploy create-mamo-subscription-checkout
supabase functions deploy verify-mamo-subscription-payment

## Testing AED 5 payment

1. Login as Super Admin.
2. Open Discount Coupons.
3. Click “Fill AED 70 test coupon”.
4. Save coupon.
5. Login as restaurant owner.
6. Open Subscription & Plans.
7. Enter coupon code TEST70.
8. Click Subscribe Monthly with Mamo Pay.
9. Mamo should show AED 5.00.
