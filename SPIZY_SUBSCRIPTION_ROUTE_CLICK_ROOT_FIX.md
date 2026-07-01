# Spizy Subscription Route Click Root Fix

This package is based on the latest files provided after the repeated subscription click issue.

Main fixes:
- Removes sidebar hard reload/window.location special case for subscription.
- Prevents the dashboard fallback effect from forcing subscription-billing back to overview.
- Keeps subscription-billing visible for owner/settings access.
- Keeps trial countdown visible in the right workspace.

Apply:
```bash
unzip -o ~/Downloads/spizy_subscription_route_click_root_fix.zip -d .
npm run build
```

Then clear stale localStorage:
```js
localStorage.removeItem('spizy.restaurant.forceSection.v1')
localStorage.removeItem('spizy.restaurant.sidebar.openGroups.v5')
localStorage.removeItem('spizy.restaurant.sidebar.scrollTop.v5')
location.reload()
```
