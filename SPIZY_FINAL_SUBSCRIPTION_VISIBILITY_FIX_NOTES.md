# Spizy final subscription/sidebar visibility fix

This package fixes:

- Subscription & Plans menu missing from the restaurant sidebar.
- Trial countdown bar missing from the restaurant dashboard.
- Launch-safe mode card shown inside the sidebar.
- Sidebar/right workspace scroll connection issues.
- Super admin subscription and coupon management visibility.

After applying, run:

```bash
npm run build
```

Then hard refresh browser:

```txt
Cmd + Shift + R
```

If sidebar state looks old, run once in console:

```js
localStorage.removeItem('spizy.restaurant.sidebar.openGroups.v5')
localStorage.removeItem('spizy.restaurant.sidebar.scrollTop.v5')
localStorage.removeItem('spizy.superadmin.activeTab.v1')
location.reload()
```
