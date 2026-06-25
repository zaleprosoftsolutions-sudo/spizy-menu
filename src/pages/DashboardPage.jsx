import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppFeedback } from '../components/AppFeedback'
import DashboardHeader from '../features/dashboard/components/DashboardHeader'
import CustomerDashboard from '../features/dashboard/roleDashboards/CustomerDashboard'
import PartnerAdminDashboard from '../features/dashboard/roleDashboards/PartnerAdminDashboard'
import RestaurantDashboard from '../features/dashboard/roleDashboards/RestaurantDashboard'
import SuperAdminDashboard from '../features/dashboard/roleDashboards/SuperAdminDashboard'
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

export default DashboardPage