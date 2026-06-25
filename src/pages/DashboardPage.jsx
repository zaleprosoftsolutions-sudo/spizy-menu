import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CreditCard,
  DollarSign,
  Globe2,
  LogOut,
  ReceiptText,
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
  }, [navigate, showToast])

  const getCount = async (tableName, filter = null) => {
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
  }

  const loadPlatformStats = async () => {
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
  }

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
          <SuperAdminDashboard profile={profile} stats={stats} />
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

function SuperAdminDashboard({ profile, stats }) {
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

      <div className="module-grid">
        <ModuleCard
          icon={<Building2 />}
          title="Restaurants"
          text="View, edit, suspend, delete, or extend restaurant subscriptions."
          status="Coming next"
        />
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
      </div>
    </>
  )
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
        <MiniCard
          label="Role"
          value={profile?.role || 'restaurant_owner'}
        />
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