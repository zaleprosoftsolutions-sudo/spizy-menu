import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import { formatDate, getTrialText } from '../../utils/dateHelpers'

function RestaurantsManagement({ onStatsRefresh }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [restaurants, setRestaurants] = useState([])
  const [search, setSearch] = useState('')

  const loadRestaurants = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('restaurants')
      .select(
        `
          id,
          name,
          slug,
          phone,
          email,
          currency,
          subscription_status,
          trial_started_at,
          trial_ends_at,
          is_active,
          outside_orders_enabled,
          created_at,
          sales_channel:sales_channels (
            name,
            slug,
            channel_type
          ),
          referred_partner:partners (
            name,
            partner_code
          )
        `,
      )
      .order('created_at', { ascending: false })

    if (error) {
      showToast({
        type: 'error',
        title: 'Restaurants loading failed',
        message: error.message,
      })
      setRestaurants([])
      setLoading(false)
      return
    }

    setRestaurants(data || [])
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    loadRestaurants()
  }, [loadRestaurants])

  const filteredRestaurants = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return restaurants

    return restaurants.filter((restaurant) => {
      const values = [
        restaurant.name,
        restaurant.email,
        restaurant.phone,
        restaurant.slug,
        restaurant.currency,
        restaurant.subscription_status,
        restaurant.sales_channel?.name,
        restaurant.sales_channel?.slug,
        restaurant.referred_partner?.name,
        restaurant.referred_partner?.partner_code,
      ]

      return values.some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [restaurants, search])

  const handleToggleRestaurant = async (restaurant) => {
    const makingActive = !restaurant.is_active

    const confirmed = await confirmAction({
      title: makingActive ? 'Reactivate restaurant?' : 'Suspend restaurant?',
      message: makingActive
        ? `${restaurant.name} will be able to continue using Spizy Menu.`
        : `${restaurant.name} will be suspended. Their dashboard access can be limited later by subscription rules.`,
      confirmText: makingActive ? 'Reactivate' : 'Suspend',
      cancelText: 'Cancel',
      danger: !makingActive,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurants')
      .update({
        is_active: makingActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Status update failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: makingActive ? 'Restaurant reactivated' : 'Restaurant suspended',
      message: `${restaurant.name} has been updated successfully.`,
    })

    await loadRestaurants()
    await onStatsRefresh?.()
  }

  const handleExtendTrial = async (restaurant) => {
    const confirmed = await confirmAction({
      title: 'Extend access by 7 days?',
      message: `${restaurant.name} will get 7 more days of trial/access from the current trial end date or today.`,
      confirmText: 'Extend 7 days',
      cancelText: 'Cancel',
      danger: false,
    })

    if (!confirmed) return

    const now = new Date()
    const currentTrialEnd = restaurant.trial_ends_at
      ? new Date(restaurant.trial_ends_at)
      : now

    const baseDate = currentTrialEnd > now ? currentTrialEnd : now
    const nextTrialEnd = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { error } = await supabase
      .from('restaurants')
      .update({
        trial_ends_at: nextTrialEnd.toISOString(),
        subscription_status: 'trialing',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Trial extension failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Trial extended',
      message: `${restaurant.name} access is extended until ${formatDate(
        nextTrialEnd.toISOString(),
      )}.`,
    })

    await loadRestaurants()
    await onStatsRefresh?.()
  }

  return (
    <section className="management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">Restaurants Management</p>
          <h2>All restaurants</h2>
          <span>
            View restaurant signup source, trial status, channel, contact and
            active/suspended state.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadRestaurants}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="management-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search restaurant, email, phone, channel..."
          />
        </div>

        <div className="table-count-pill">
          {filteredRestaurants.length} restaurant
          {filteredRestaurants.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="restaurants-table-wrap">
        {loading ? (
          <div className="empty-state">Loading restaurants...</div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="empty-state">
            No restaurants found. When a restaurant signs up, it will appear
            here automatically.
          </div>
        ) : (
          <table className="restaurants-table">
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Status</th>
                <th>Trial Ends</th>
                <th>Channel</th>
                <th>Partner</th>
                <th>Contact</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredRestaurants.map((restaurant) => (
                <tr key={restaurant.id}>
                  <td>
                    <strong>{restaurant.name}</strong>
                    <span>{restaurant.slug}</span>
                  </td>

                  <td>
                    <StatusPill restaurant={restaurant} />
                  </td>

                  <td>
                    <strong>{formatDate(restaurant.trial_ends_at)}</strong>
                    <span>{getTrialText(restaurant.trial_ends_at)}</span>
                  </td>

                  <td>
                    <strong>
                      {restaurant.sales_channel?.name || 'Not tracked'}
                    </strong>
                    <span>
                      {restaurant.sales_channel?.slug || 'no-channel'}
                    </span>
                  </td>

                  <td>
                    <strong>{restaurant.referred_partner?.name || 'Direct'}</strong>
                    <span>{restaurant.referred_partner?.partner_code || '—'}</span>
                  </td>

                  <td>
                    <strong>{restaurant.email || 'No email'}</strong>
                    <span>{restaurant.phone || 'No phone'}</span>
                  </td>

                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => handleExtendTrial(restaurant)}
                      >
                        <CalendarPlus size={15} />
                        Extend
                      </button>

                      <button
                        type="button"
                        className={`tiny-button ${
                          restaurant.is_active ? 'danger' : 'success'
                        }`}
                        onClick={() => handleToggleRestaurant(restaurant)}
                      >
                        {restaurant.is_active ? (
                          <PowerOff size={15} />
                        ) : (
                          <Power size={15} />
                        )}
                        {restaurant.is_active ? 'Suspend' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function StatusPill({ restaurant }) {
  if (!restaurant.is_active) {
    return <span className="status-pill suspended">Suspended</span>
  }

  return (
    <span className={`status-pill ${restaurant.subscription_status}`}>
      {restaurant.subscription_status?.replaceAll('_', ' ') || 'Unknown'}
    </span>
  )
}

export default RestaurantsManagement