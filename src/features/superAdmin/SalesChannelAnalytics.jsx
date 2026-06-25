import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CreditCard,
  Globe2,
  Handshake,
  RefreshCw,
  Store,
  TrendingUp,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'

function SalesChannelAnalytics() {
  const { showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [restaurants, setRestaurants] = useState([])
  const [subscriptions, setSubscriptions] = useState([])

  const loadAnalytics = useCallback(async () => {
    setLoading(true)

    const { data: restaurantData, error: restaurantError } = await supabase
      .from('restaurants')
      .select(
        `
          id,
          name,
          subscription_status,
          is_active,
          created_at,
          sales_channel:sales_channels (
            id,
            name,
            slug,
            channel_type
          ),
          referred_partner:partners (
            id,
            name,
            partner_code
          )
        `,
      )
      .order('created_at', { ascending: false })

    if (restaurantError) {
      showToast({
        type: 'error',
        title: 'Channel analytics failed',
        message: restaurantError.message,
      })
      setRestaurants([])
      setSubscriptions([])
      setLoading(false)
      return
    }

    const { data: subscriptionData, error: subscriptionError } = await supabase
      .from('restaurant_subscriptions')
      .select(
        `
          id,
          restaurant_id,
          status,
          amount_paid,
          currency,
          created_at
        `,
      )

    if (subscriptionError) {
      showToast({
        type: 'error',
        title: 'Revenue analytics failed',
        message: subscriptionError.message,
      })
      setSubscriptions([])
    } else {
      setSubscriptions(subscriptionData || [])
    }

    setRestaurants(restaurantData || [])
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const analytics = useMemo(() => {
    const subscriptionRevenueByRestaurant = subscriptions.reduce(
      (result, subscription) => {
        const restaurantId = subscription.restaurant_id
        const currency = subscription.currency || 'AED'
        const amount = Number(subscription.amount_paid || 0)

        if (!result[restaurantId]) result[restaurantId] = {}
        result[restaurantId][currency] =
          (result[restaurantId][currency] || 0) + amount

        return result
      },
      {},
    )

    const base = {
      overall: createEmptyBucket('Overall'),
      channels: {},
      partners: {},
    }

    restaurants.forEach((restaurant) => {
      const channelSlug = restaurant.sales_channel?.slug || 'not-tracked'
      const channelName = restaurant.sales_channel?.name || 'Not Tracked'
      const partnerCode =
        restaurant.referred_partner?.partner_code || 'direct'
      const partnerName = restaurant.referred_partner?.name || 'Direct'

      if (!base.channels[channelSlug]) {
        base.channels[channelSlug] = createEmptyBucket(channelName)
      }

      if (!base.partners[partnerCode]) {
        base.partners[partnerCode] = createEmptyBucket(partnerName)
      }

      addRestaurantToBucket(base.overall, restaurant)
      addRestaurantToBucket(base.channels[channelSlug], restaurant)
      addRestaurantToBucket(base.partners[partnerCode], restaurant)

      const revenue = subscriptionRevenueByRestaurant[restaurant.id] || {}

      addRevenueToBucket(base.overall, revenue)
      addRevenueToBucket(base.channels[channelSlug], revenue)
      addRevenueToBucket(base.partners[partnerCode], revenue)
    })

    return base
  }, [restaurants, subscriptions])

  const channelRows = Object.entries(analytics.channels)
    .map(([slug, bucket]) => ({
      slug,
      ...bucket,
    }))
    .sort((a, b) => b.total - a.total)

  const partnerRows = Object.entries(analytics.partners)
    .map(([code, bucket]) => ({
      code,
      ...bucket,
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <section className="management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">Sales Channel Analytics</p>
          <h2>Overall, main-site, GCC and partner sales</h2>
          <span>
            Track where restaurants come from: www.spizy.site, gcc.spizy.site,
            partner links, direct signups and manual admin entries.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadAnalytics}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="channel-summary-grid">
        <SummaryCard
          icon={<Store size={24} />}
          label="Overall Restaurants"
          value={analytics.overall.total}
        />
        <SummaryCard
          icon={<TrendingUp size={24} />}
          label="Trial Restaurants"
          value={analytics.overall.trialing}
        />
        <SummaryCard
          icon={<CreditCard size={24} />}
          label="Active Restaurants"
          value={analytics.overall.active}
        />
        <SummaryCard
          icon={<BarChart3 size={24} />}
          label="Paid Revenue"
          value={formatRevenue(analytics.overall.revenue)}
        />
      </div>

      <div className="analytics-split-grid">
        <AnalyticsTable
          title="Sales channels"
          icon={<Globe2 size={22} />}
          rows={channelRows}
          nameKey="slug"
          emptyText="No sales channel data yet."
        />

        <AnalyticsTable
          title="Partner sources"
          icon={<Handshake size={22} />}
          rows={partnerRows}
          nameKey="code"
          emptyText="No partner source data yet."
        />
      </div>

      <div className="analytics-note">
        <strong>Note:</strong> Revenue will become accurate after we connect
        Mamo Pay payment success updates. Until then, this section mainly tracks
        leads, trials and active restaurants by channel.
      </div>
    </section>
  )
}

function createEmptyBucket(name) {
  return {
    name,
    total: 0,
    trialing: 0,
    active: 0,
    expired: 0,
    suspended: 0,
    revenue: {},
  }
}

function addRestaurantToBucket(bucket, restaurant) {
  bucket.total += 1

  if (!restaurant.is_active) {
    bucket.suspended += 1
    return
  }

  if (restaurant.subscription_status === 'trialing') {
    bucket.trialing += 1
    return
  }

  if (restaurant.subscription_status === 'active') {
    bucket.active += 1
    return
  }

  if (
    restaurant.subscription_status === 'expired' ||
    restaurant.subscription_status === 'cancelled' ||
    restaurant.subscription_status === 'past_due'
  ) {
    bucket.expired += 1
  }
}

function addRevenueToBucket(bucket, revenue) {
  Object.entries(revenue).forEach(([currency, amount]) => {
    bucket.revenue[currency] = (bucket.revenue[currency] || 0) + Number(amount)
  })
}

function formatRevenue(revenue) {
  const entries = Object.entries(revenue)

  if (entries.length === 0) return 'AED 0.00'

  return entries
    .map(([currency, amount]) => `${currency} ${Number(amount).toFixed(2)}`)
    .join(' / ')
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="expense-summary-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AnalyticsTable({ title, icon, rows, nameKey, emptyText }) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-head">
        <div>
          {icon}
          <h3>{title}</h3>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Total</th>
                <th>Trial</th>
                <th>Active</th>
                <th>Suspended</th>
                <th>Revenue</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row[nameKey]}>
                  <td>
                    <strong>{row.name}</strong>
                    <span>{row[nameKey]}</span>
                  </td>
                  <td>{row.total}</td>
                  <td>{row.trialing}</td>
                  <td>{row.active}</td>
                  <td>{row.suspended}</td>
                  <td>{formatRevenue(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default SalesChannelAnalytics