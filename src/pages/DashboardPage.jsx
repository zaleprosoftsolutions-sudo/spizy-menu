import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Store, Utensils } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

function DashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [restaurant, setRestaurant] = useState(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    const { data: userData } = await supabase.auth.getUser()

    if (!userData.user) {
      navigate('/login')
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .maybeSingle()

    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('owner_id', userData.user.id)
      .maybeSingle()

    setProfile(profileData)
    setRestaurant(restaurantData)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
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
      <section className="dashboard-card">
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

          <button type="button" className="secondary-button" onClick={handleLogout}>
            <LogOut size={18} />
            Logout
          </button>
        </div>

        <div className="dashboard-hero">
          <div>
            <p className="pricing-label">Foundation Ready</p>
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
          <div className="mini-card">
            <Store size={24} />
            <span>Restaurant</span>
            <strong>{restaurant?.name || 'Not created'}</strong>
          </div>

          <div className="mini-card">
            <span>Role</span>
            <strong>{profile?.role || 'restaurant_owner'}</strong>
          </div>

          <div className="mini-card">
            <span>Trial Status</span>
            <strong>{restaurant?.subscription_status || 'trialing'}</strong>
          </div>

          <div className="mini-card">
            <span>Currency</span>
            <strong>{restaurant?.currency || 'AED'}</strong>
          </div>
        </div>
      </section>
    </main>
  )
}

export default DashboardPage