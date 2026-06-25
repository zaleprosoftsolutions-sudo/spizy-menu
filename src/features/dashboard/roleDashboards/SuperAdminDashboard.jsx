import {
  BarChart3,
  Building2,
  CreditCard,
  Globe2,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react'
import MiniCard from '../components/MiniCard'
import ModuleCard from '../components/ModuleCard'
import RestaurantsManagement from '../../superAdmin/RestaurantsManagement'

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

export default SuperAdminDashboard