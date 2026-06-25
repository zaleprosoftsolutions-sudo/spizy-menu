import {
  BarChart3,
  Building2,
  CreditCard,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react'
import MiniCard from '../components/MiniCard'
import ModuleCard from '../components/ModuleCard'

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

export default PartnerAdminDashboard