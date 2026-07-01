# Spizy Subscription Scratch Rebuild

This package rebuilds the restaurant subscription screen flow from scratch with a new internal section id: `subscriptions`.

Why:
- The old `subscription-billing` route was conflicting with sidebar hard redirects, launch-safe filtering, and fallback-to-overview logic.
- This package keeps `subscription-billing` as a backward-compatible alias but renders the new page through `subscriptions`.

What changed:
- New `SubscriptionCenterScratch.jsx` page rendered inside the right workspace.
- Sidebar menu item now uses `subscriptions`, not the old broken `subscription-billing` path.
- `/dashboard?section=subscription-billing` maps to the new `subscriptions` section.
- `/dashboard?section=subscriptions` directly opens the new subscription page.
- Trial restaurants show Trial, not Monthly.
- Monthly plan: AED 75/month.
- Yearly plan: AED 750/year.
- Monthly subscribers can upgrade to yearly.
- Mamo Pay checkout still uses the backend `create-mamo-subscription-checkout` Edge Function.

After applying:
1. Run `npm run build`.
2. Redeploy Mamo subscription Edge Functions.
3. Clear browser localStorage keys listed in the assistant response.
