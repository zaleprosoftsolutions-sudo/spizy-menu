import { useMemo, useState } from 'react'
import {
  BarChart3,
  Building2,
  CreditCard,
  Globe2,
  ReceiptText,
  ShieldCheck,
  Store,
  Tag,
  TrendingUp,
  Users,
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
  {
    id: 'overview',
    label: 'Overview',
    description: 'Business command center',
    icon: ShieldCheck,
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    description: 'Manage restaurants',
    icon: Store,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    description: 'Trials, active and expired plans',
    icon: CreditCard,
  },
  {
    id: 'coupons',
    label: 'Discount Coupons',
    description: 'Subscription offers',
    icon: Tag,
  },
  {
    id: 'expenses',
    label: 'Project Expenses',
    description: 'Company costs',
    icon: ReceiptText,
  },
  {
    id: 'analytics',
    label: 'Sales Analytics',
    description: 'Channels and revenue',
    icon: BarChart3,
  },
]

function SuperAdminDashboard({ profile, stats, onStatsRefresh }) {
  const [activeTab, setActiveTab] = useState(() => getStoredSuperAdminTab())

  const safeStats = useMemo(
    () => ({
      restaurants: stats?.restaurants || 0,
      trialRestaurants: stats?.trialRestaurants || 0,
      activeRestaurants: stats?.activeRestaurants || 0,
      salesChannels: stats?.salesChannels || 0,
    }),
    [stats],
  )

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('spizy.superadmin.activeTab.v1', tabId)
    }
  }

  return (
    <div className="superadmin-pro-shell">
      <aside className="superadmin-pro-sidebar">
        <div className="superadmin-pro-identity">
          <div className="superadmin-pro-avatar">
            <ShieldCheck size={22} />
          </div>
          <div>
            <strong>{profile?.full_name || 'Super Admin'}</strong>
            <span>Spizy control center</span>
          </div>
        </div>

        <nav className="superadmin-pro-nav" aria-label="Super admin navigation">
          {superAdminTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            return (
              <button
                type="button"
                key={tab.id}
                className={isActive ? 'active' : ''}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className="superadmin-pro-nav-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{tab.label}</strong>
                  <small>{tab.description}</small>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="superadmin-pro-workspace">
        {activeTab === 'overview' && (
          <SuperAdminOverview
            profile={profile}
            stats={safeStats}
            onOpenTab={handleTabChange}
          />
        )}

        {activeTab === 'restaurants' && (
          <RestaurantsManagement onStatsRefresh={onStatsRefresh} />
        )}

        {activeTab === 'subscriptions' && (
          <SuperAdminSubscriptionsManagement onStatsRefresh={onStatsRefresh} />
        )}

        {activeTab === 'coupons' && <SubscriptionCouponAdmin />}

        {activeTab === 'expenses' && (
          <ProjectExpensesManagement onStatsRefresh={onStatsRefresh} />
        )}

        {activeTab === 'analytics' && <SalesChannelAnalytics />}
      </main>
    </div>
  )
}

function SuperAdminOverview({ profile, stats, onOpenTab }) {
  return (
    <>
      <div className="dashboard-hero superadmin-pro-hero">
        <div>
          <p className="pricing-label">Super Admin Control</p>
          <h1>Welcome, {profile?.full_name || 'Super Admin'}</h1>
          <p>
            Manage restaurants, subscriptions, Mamo billing, discount coupons,
            partner channels, project expenses and Spizy Menu analytics from one
            professional control center.
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

      <div className="module-grid superadmin-pro-shortcuts">
        <button type="button" onClick={() => onOpenTab('subscriptions')}>
          <CreditCard />
          <strong>Manage Subscriptions</strong>
          <span>Trials, monthly/yearly, manual extensions and suspensions.</span>
        </button>
        <button type="button" onClick={() => onOpenTab('coupons')}>
          <Tag />
          <strong>Discount Coupons</strong>
          <span>Create launch coupons for Spizy subscription payments.</span>
        </button>
        <button type="button" onClick={() => onOpenTab('restaurants')}>
          <Building2 />
          <strong>Restaurants</strong>
          <span>Open restaurant accounts and operational status.</span>
        </button>
        <button type="button" onClick={() => onOpenTab('analytics')}>
          <BarChart3 />
          <strong>Analytics</strong>
          <span>Track revenue, channels and project performance.</span>
        </button>
      </div>

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
          status="Connected"
        />
        <ModuleCard
          icon={<Users />}
          title="Partner Management"
          text="Manage partner admins, sales links, partner leads and channel visibility."
          status="Planned"
        />
        <ModuleCard
          icon={<CreditCard />}
          title="Subscriptions"
          text="View trials, active plans, subscription invoices, coupon usage and manual extensions."
          status="Connected"
        />
      </div>
    </>
  )
}

function getStoredSuperAdminTab() {
  if (typeof window === 'undefined') return 'overview'

  const stored = window.localStorage.getItem('spizy.superadmin.activeTab.v1')
  return superAdminTabs.some((tab) => tab.id === stored) ? stored : 'overview'
}

export default SuperAdminDashboard
