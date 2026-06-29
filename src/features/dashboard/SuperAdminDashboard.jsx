import { useEffect, useState } from 'react'
import {
  BadgePercent,
  BarChart3,
  Building2,
  CreditCard,
  Globe2,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import MiniCard from '../components/MiniCard'
import ModuleCard from '../components/ModuleCard'
import RestaurantsManagement from '../../superAdmin/RestaurantsManagement'
import ProjectExpensesManagement from '../../superAdmin/ProjectExpensesManagement'
import SalesChannelAnalytics from '../../superAdmin/SalesChannelAnalytics'
import SubscriptionCouponAdmin from '../../superAdmin/SubscriptionCouponAdmin'
import SuperAdminSubscriptionsManagement from '../../superAdmin/SuperAdminSubscriptionsManagement'
import './SuperAdminDashboard.css'

const superAdminTabs = [
  { id: 'overview', label: 'Overview', description: 'Business command center', icon: ShieldCheck },
  { id: 'restaurants', label: 'Restaurants', description: 'All restaurant accounts', icon: Store },
  { id: 'subscriptions', label: 'Subscriptions', description: 'Trials, monthly and yearly', icon: CreditCard },
  { id: 'coupons', label: 'Discount Coupons', description: 'Subscription offer codes', icon: BadgePercent },
  { id: 'expenses', label: 'Project Expenses', description: 'Zalepro/Spizy costs', icon: ReceiptText },
  { id: 'analytics', label: 'Sales Analytics', description: 'Channels and revenue', icon: BarChart3 },
]

function SuperAdminDashboard({ profile, stats, onStatsRefresh }) {
  const [activeTab, setActiveTab] = useState(() => {
    return window.localStorage.getItem('spizy.superadmin.activeTab.v1') || 'overview'
  })

  useEffect(() => {
    window.localStorage.setItem('spizy.superadmin.activeTab.v1', activeTab)
  }, [activeTab])

  return (
    <div className="super-admin-pro-layout">
      <aside className="super-admin-pro-sidebar">
        <div className="super-admin-pro-head">
          <div className="super-admin-pro-icon"><ShieldCheck size={22} /></div>
          <div>
            <strong>Super Admin</strong>
            <span>{profile?.email || profile?.full_name || 'Spizy control'}</span>
          </div>
        </div>

        <nav className="super-admin-pro-nav">
          {superAdminTabs.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                type="button"
                key={item.id}
                className={isActive ? 'active' : ''}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="super-admin-pro-workspace">
        {activeTab === 'overview' && (
          <>
            <div className="dashboard-hero super-admin-pro-hero">
              <div>
                <p className="pricing-label">Super Admin Control</p>
                <h1>Welcome, {profile?.full_name || 'Super Admin'}</h1>
                <p>
                  Manage all restaurants, subscriptions, coupons, partner channels,
                  project expenses, revenue and complete Spizy Menu analytics.
                </p>
              </div>

              <div className="dashboard-icon">
                <ShieldCheck size={42} />
              </div>
            </div>

            <div className="dashboard-grid">
              <MiniCard icon={<Store size={24} />} label="Total Restaurants" value={stats.restaurants} />
              <MiniCard icon={<TrendingUp size={24} />} label="Trial Restaurants" value={stats.trialRestaurants} />
              <MiniCard icon={<CreditCard size={24} />} label="Active Restaurants" value={stats.activeRestaurants} />
              <MiniCard icon={<Globe2 size={24} />} label="Sales Channels" value={stats.salesChannels} />
            </div>

            <div className="module-grid">
              <ModuleCard icon={<WalletCards />} title="Subscriptions" text="Open monthly, yearly, trial, expired and manually extended subscriptions." status="Ready" />
              <ModuleCard icon={<BadgePercent />} title="Discount Coupons" text="Create subscription discount coupons for launch offers." status="Super Admin only" />
              <ModuleCard icon={<ReceiptText />} title="Project Expenses" text="Add project costs like domain, hosting, marketing and staff expenses." status="Ready" />
              <ModuleCard icon={<Users />} title="Partner Management" text="Manage partner admins, sales links, partner leads and channel visibility." status="Planned" />
            </div>
          </>
        )}

        {activeTab === 'restaurants' && <RestaurantsManagement onStatsRefresh={onStatsRefresh} />}
        {activeTab === 'subscriptions' && <SuperAdminSubscriptionsManagement onStatsRefresh={onStatsRefresh} />}
        {activeTab === 'coupons' && <SubscriptionCouponAdmin />}
        {activeTab === 'expenses' && <ProjectExpensesManagement onStatsRefresh={onStatsRefresh} />}
        {activeTab === 'analytics' && <SalesChannelAnalytics />}
      </main>
    </div>
  )
}

export default SuperAdminDashboard
