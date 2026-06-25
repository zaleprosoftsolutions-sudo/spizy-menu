import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CalendarPlus,
  CreditCard,
  Globe2,
  LogOut,
  Power,
  PowerOff,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  Utensils,
} from 'lucide-react'
import { useAppFeedback } from '../components/AppFeedback'
import { supabase } from '../lib/supabaseClient'

function DashboardPage() {
  const navigate = useNavigate()
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [stats, setStats] = useState({
    restaurants: 0,
    trialRestaurants: 0,
    activeRestaurants: 0,
    salesChannels: 0,
    expenses: 0,
    subscriptions: 0,
  })

  const getCount = useCallback(async (tableName, filter = null) => {
    let query = supabase.from(tableName).select('id', {
      count: 'exact',
      head: true,
    })

    if (filter) {
      query = query.eq(filter.column, filter.value)
    }

    const { count, error } = await query

    if (error) {
      console.warn(`${tableName} count failed:`, error.message)
      return 0
    }

    return count || 0
  }, [])

  const loadPlatformStats = useCallback(async () => {
    const [
      restaurants,
      trialRestaurants,
      activeRestaurants,
      salesChannels,
      expenses,
      subscriptions,
    ] = await Promise.all([
      getCount('restaurants'),
      getCount('restaurants', {
        column: 'subscription_status',
        value: 'trialing',
      }),
      getCount('restaurants', {
        column: 'subscription_status',
        value: 'active',
      }),
      getCount('sales_channels'),
      getCount('project_expenses'),
      getCount('restaurant_subscriptions'),
    ])

    setStats({
      restaurants,
      trialRestaurants,
      activeRestaurants,
      salesChannels,
      expenses,
      subscriptions,
    })
  }, [getCount])

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)

      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userError || !userData.user) {
        navigate('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle()

      if (profileError) {
        showToast({
          type: 'error',
          title: 'Profile loading failed',
          message: profileError.message,
        })
      }

      setProfile(profileData)

      if (
        profileData?.role === 'restaurant_owner' ||
        profileData?.role === 'restaurant_staff'
      ) {
        const { data: restaurantData, error: restaurantError } = await supabase
          .from('restaurants')
          .select('*')
          .eq('owner_id', userData.user.id)
          .maybeSingle()

        if (restaurantError) {
          showToast({
            type: 'error',
            title: 'Restaurant loading failed',
            message: restaurantError.message,
          })
        }

        setRestaurant(restaurantData)
      }

      if (
        profileData?.role === 'super_admin' ||
        profileData?.role === 'partner_admin'
      ) {
        await loadPlatformStats()
      }

      setLoading(false)
    }

    loadDashboard()
  }, [loadPlatformStats, navigate, showToast])

  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: 'Logout from Spizy Menu?',
      message: 'You will need to login again to manage your account.',
      confirmText: 'Logout',
      cancelText: 'Stay',
      danger: false,
    })

    if (!confirmed) return

    const { error } = await supabase.auth.signOut()

    if (error) {
      showToast({
        type: 'error',
        title: 'Logout failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Logged out',
      message: 'You have safely logged out from Spizy Menu.',
    })

    navigate('/')
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-card">Loading Spizy Menu...</div>
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-shell">
        <DashboardHeader profile={profile} onLogout={handleLogout} />

        {profile?.role === 'super_admin' && (
          <SuperAdminDashboard
            profile={profile}
            stats={stats}
            onStatsRefresh={loadPlatformStats}
          />
        )}

        {profile?.role === 'partner_admin' && (
          <PartnerAdminDashboard profile={profile} stats={stats} />
        )}

        {(profile?.role === 'restaurant_owner' ||
          profile?.role === 'restaurant_staff') && (
          <RestaurantDashboard profile={profile} restaurant={restaurant} />
        )}

        {profile?.role === 'customer' && <CustomerDashboard profile={profile} />}
      </section>
    </main>
  )
}

function DashboardHeader({ profile, onLogout }) {
  return (
    <div className="dashboard-top">
      <Link to="/" className="brand-block">
        <div className="brand-mark logo-mark">
          <img src="/spizy-logo.png" alt="Spizy Menu logo" />
        </div>
        <div>
          <p className="brand-name">SPIZY</p>
          <p className="brand-subtitle">Menu</p>
        </div>
      </Link>

      <div className="dashboard-user-actions">
        <div className="dashboard-user-pill">
          <span>{profile?.role?.replaceAll('_', ' ') || 'User'}</span>
          <strong>{profile?.full_name || profile?.email || 'Spizy User'}</strong>
        </div>

        <button type="button" className="secondary-button" onClick={onLogout}>
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  )
}

function SuperAdminDashboard({ profile, stats, onStatsRefresh }) {
  return (
    <>
      <div className="dashboard-hero">
        <div>
          <p className="pricing-label">Super Admin Control</p>
          <h1>Welcome, {profile?.full_name || 'Super Admin'}</h1>
          <p>
            Manage all restaurants, subscriptions, partner channels, project
            expenses, revenue and complete Spizy Menu analytics.
          </p>
        </div>

        <div className="dashboard-icon">
          <ShieldCheck size={42} />
        </div>
      </div>

      <div className="dashboard-grid">
        <MiniCard
          icon={<Store size={24} />}
          label="Total Restaurants"
          value={stats.restaurants}
        />
        <MiniCard
          icon={<TrendingUp size={24} />}
          label="Trial Restaurants"
          value={stats.trialRestaurants}
        />
        <MiniCard
          icon={<CreditCard size={24} />}
          label="Active Restaurants"
          value={stats.activeRestaurants}
        />
        <MiniCard
          icon={<Globe2 size={24} />}
          label="Sales Channels"
          value={stats.salesChannels}
        />
      </div>

      <RestaurantsManagement onStatsRefresh={onStatsRefresh} />

      <div className="module-grid">
        <ModuleCard
          icon={<ReceiptText />}
          title="Project Expenses"
          text="Add project costs like domain, hosting, marketing and staff expenses."
          status="Super Admin only"
        />
        <ModuleCard
          icon={<BarChart3 />}
          title="Overall Analytics"
          text="Track overall sales, partner sales, GCC channel sales, income and net profit."
          status="Planned"
        />
        <ModuleCard
          icon={<Users />}
          title="Partner Management"
          text="Manage partner admins, sales links, partner leads and channel visibility."
          status="Planned"
        />
        <ModuleCard
          icon={<Building2 />}
          title="Subscriptions"
          text="View monthly, yearly, trial, expired and manually extended subscriptions."
          status="Coming soon"
        />
      </div>
    </>
  )
}

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
                    <strong>
                      {restaurant.referred_partner?.name || 'Direct'}
                    </strong>
                    <span>
                      {restaurant.referred_partner?.partner_code || '—'}
                    </span>
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

function formatDate(value) {
  if (!value) return 'Not set'

  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getTrialText(value) {
  if (!value) return 'No trial date'

  const today = new Date()
  const trialEnd = new Date(value)
  const diff = Math.ceil((trialEnd.getTime() - today.getTime()) / 86400000)

  if (diff > 1) return `${diff} days left`
  if (diff === 1) return '1 day left'
  if (diff === 0) return 'Ends today'

  return `${Math.abs(diff)} days ago`
}

function PartnerAdminDashboard({ profile, stats }) {
  return (
    <>
      <div className="dashboard-hero">
        <div>
          <p className="pricing-label">Partner Dashboard</p>
          <h1>Welcome, {profile?.full_name || 'Partner Admin'}</h1>
          <p>
            View allowed partner sales, restaurant leads, subscriptions and
            performance analytics. Expense adding is restricted.
          </p>
        </div>

        <div className="dashboard-icon">
          <Users size={42} />
        </div>
      </div>

      <div className="dashboard-grid">
        <MiniCard
          icon={<Store size={24} />}
          label="Visible Restaurants"
          value={stats.restaurants}
        />
        <MiniCard
          icon={<TrendingUp size={24} />}
          label="Trial Leads"
          value={stats.trialRestaurants}
        />
        <MiniCard
          icon={<CreditCard size={24} />}
          label="Paid Restaurants"
          value={stats.activeRestaurants}
        />
        <MiniCard
          icon={<BarChart3 size={24} />}
          label="Subscriptions"
          value={stats.subscriptions}
        />
      </div>

      <div className="module-grid">
        <ModuleCard
          icon={<Building2 />}
          title="Partner Restaurants"
          text="View restaurants assigned to this partner channel."
          status="Coming next"
        />
        <ModuleCard
          icon={<BarChart3 />}
          title="Partner Analytics"
          text="View sales and conversion analytics allowed for this partner role."
          status="Planned"
        />
      </div>
    </>
  )
}

function RestaurantDashboard({ profile, restaurant }) {
  return (
    <>
      <div className="dashboard-hero">
        <div>
          <p className="pricing-label">Restaurant Dashboard</p>
          <h1>Welcome, {profile?.full_name || 'Restaurant Owner'}</h1>
          <p>
            Your restaurant account, 7-day trial, lead attribution and role
            foundation are now connected.
          </p>
        </div>

        <div className="dashboard-icon">
          <Utensils size={42} />
        </div>
      </div>

      <div className="dashboard-grid">
        <MiniCard
          icon={<Store size={24} />}
          label="Restaurant"
          value={restaurant?.name || 'Not created'}
        />
        <MiniCard label="Role" value={profile?.role || 'restaurant_owner'} />
        <MiniCard
          label="Trial Status"
          value={restaurant?.subscription_status || 'trialing'}
        />
        <MiniCard label="Currency" value={restaurant?.currency || 'AED'} />
      </div>

      <div className="module-grid">
        <ModuleCard
          icon={<Store />}
          title="Menu Items"
          text="Add categories, items, prices, variations, stock and availability."
          status="Next build"
        />
        <ModuleCard
          icon={<Globe2 />}
          title="QR Menus"
          text="Manage live site QR and unlimited table-wise QR codes."
          status="Planned"
        />
        <ModuleCard
          icon={<ReceiptText />}
          title="Orders"
          text="Manage table orders and delivery orders with status updates."
          status="Planned"
        />
        <ModuleCard
          icon={<BarChart3 />}
          title="Customers & Analytics"
          text="Track customers, reviews, rewards, discounts and campaigns."
          status="Planned"
        />
      </div>
    </>
  )
}

function CustomerDashboard({ profile }) {
  return (
    <>
      <div className="dashboard-hero">
        <div>
          <p className="pricing-label">Customer Account</p>
          <h1>Welcome, {profile?.full_name || 'Customer'}</h1>
          <p>
            Customer ordering, saved restaurants, rewards and profile management
            will be added in the customer phase.
          </p>
        </div>

        <div className="dashboard-icon">
          <Users size={42} />
        </div>
      </div>
    </>
  )
}

function MiniCard({ icon, label, value }) {
  return (
    <div className="mini-card">
      {icon && icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ModuleCard({ icon, title, text, status }) {
  return (
    <article className="module-card">
      <div className="feature-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <span>{status}</span>
    </article>
  )
}

export default DashboardPage