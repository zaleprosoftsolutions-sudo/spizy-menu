# Spizy Active Role Dashboard Subscription Fix

Root cause found: `/dashboard` uses `src/features/dashboard/roleDashboards/RestaurantDashboard.jsx`, not `src/features/dashboard/RestaurantDashboard.jsx`.

This package updates the active role dashboard file and keeps the subscription flow inside the right workspace.

## Updated

- `src/features/dashboard/roleDashboards/RestaurantDashboard.jsx`
  - imports SubscriptionBillingManagement
  - imports SubscriptionTrialHeaderBar
  - adds `subscription-billing` to permissions and section list
  - maps `subscriptions` alias to `subscription-billing`
  - renders SubscriptionBillingManagement when active section is `subscription-billing`
  - keeps trial bar visible above workspace content

- `src/features/restaurant/RestaurantSidebar.jsx`
  - removes old hard redirect/localStorage force route for subscription
  - subscription opens through the same React state flow as other menu items

- `src/features/restaurant/SubscriptionBillingManagement.jsx`
  - keeps AED 75 monthly / AED 750 yearly
  - redirects same-tab to Mamo checkout after link creation

- Mamo Edge Functions included with AED 75 / AED 750 plan pricing.
