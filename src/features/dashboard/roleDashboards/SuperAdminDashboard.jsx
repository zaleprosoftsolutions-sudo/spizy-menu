import { useMemo, useState } from 'react'
import {
  BadgePercent,
  BarChart3,
  Building2,
  CreditCard,
  Gauge,
  Globe2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react'
import RestaurantsManagement from '../../superAdmin/RestaurantsManagement'
import ProjectExpensesManagement from '../../superAdmin/ProjectExpensesManagement'
import SalesChannelAnalytics from '../../superAdmin/SalesChannelAnalytics'
import SubscriptionCouponAdmin from '../../superAdmin/SubscriptionCouponAdmin'
import SuperAdminSubscriptionsManagement from '../../superAdmin/SuperAdminSubscriptionsManagement'
import './SuperAdminDashboard.css'

const superAdminSections = [
  {
    id: 'overview',
    label: 'Command Center',
    description: 'Platform overview',
    icon: Gauge,
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
    description: 'Trials and paid plans',
    icon: CreditCard,
  },
  {
    id: 'coupons',
    label: 'Discount Coupons',
    description: 'Create subscription coupons',
    icon: BadgePercent,
  },
  {
    id: 'expenses',
    label: 'Project Expenses',
    description: 'Zalepro project costs',
    icon: ReceiptText,
  },
  {
    id: 'analytics',
    label: 'Sales Analytics',
    description: 'Channels and growth',
    icon: BarChart3,
  },
]

function SuperAdminDashboard({ profile, stats, onStatsRefresh }) {
  const [activeSection, setActiveSection] = useState('overview')

  const activeLabel = useMemo(
    () => superAdminSections.find((section) => section.id === activeSection)?.label || 'Command Center',
    [activeSection],
  )

  return (
    <div className="super-admin-os-shell">
      <aside className="super-admin-sidebar">
        <div className="super-admin-sidebar-card">
          <div className="super-admin-avatar">
            <ShieldCheck size={24} />
          </div>
          <div>
            <span>Super Admin</span>
            <strong>{profile?.full_name || 'RDR Creations'}</strong>
          </div>
        </div>

        <nav className="super-admin-nav" aria-label="Super admin navigation">
          {superAdminSections.map((section) => {
            const Icon = section.icon
            const active = section.id === activeSection

            return (
              <button
                type="button"
                key={section.id}
                className={`super-admin-nav-button ${active ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="super-admin-nav-icon"><Icon size={18} /></span>
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="super-admin-sidebar-footer">
          <Store size={16} />
          <span>Spizy Platform OS</span>
          <BadgePercent size={16} />
        </div>
      </aside>

      <section className="super-admin-workspace">
        <div className="super-admin-workspace-title">
          <div>
            <p className="pricing-label">Super Admin Control</p>
            <h1>{activeLabel}</h1>
          </div>
          <button type="button" onClick={onStatsRefresh}>
            <RefreshCw size={17} />
            Refresh stats
          </button>
        </div>

        {activeSection === 'overview' && (
          <SuperAdminOverview
            profile={profile}
            stats={stats}
            onOpenSection={setActiveSection}
          />
        )}

        {activeSection === 'restaurants' && (
          <RestaurantsManagement onStatsRefresh={onStatsRefresh} />
        )}

        {activeSection === 'subscriptions' && (
          <SuperAdminSubscriptionsManagement onStatsRefresh={onStatsRefresh} />
        )}

        {activeSection === 'coupons' && (
          <SubscriptionCouponAdmin />
        )}

        {activeSection === 'expenses' && (
          <ProjectExpensesManagement onStatsRefresh={onStatsRefresh} />
        )}

        {activeSection === 'analytics' && <SalesChannelAnalytics />}
      </section>
    </div>
  )
}

function SuperAdminOverview({ profile, stats, onOpenSection }) {
  return (
    <div className="super-admin-overview">
      <div className="super-admin-hero-panel">
        <div>
          <p className="pricing-label">Super Admin Control</p>
          <h2>Welcome, {profile?.full_name || 'Super Admin'}</h2>
          <p>
            Manage restaurants, Spizy subscriptions, Mamo Pay billing, discount
            coupons, project expenses and sales channel analytics from one
            command center.
          </p>
        </div>

        <div className="super-admin-hero-icon">
          <ShieldCheck size={42} />
        </div>
      </div>

      <div className="super-admin-kpi-grid">
        <SuperAdminKpi icon={<Store size={22} />} label="Total Restaurants" value={stats?.restaurants || 0} />
        <SuperAdminKpi icon={<TrendingUp size={22} />} label="Trial Restaurants" value={stats?.trialRestaurants || 0} />
        <SuperAdminKpi icon={<CreditCard size={22} />} label="Active Restaurants" value={stats?.activeRestaurants || 0} />
        <SuperAdminKpi icon={<Globe2 size={22} />} label="Sales Channels" value={stats?.salesChannels || 0} />
      </div>

      <div className="super-admin-action-grid">
        <SuperAdminActionCard
          icon={<Store size={22} />}
          title="Restaurants Management"
          text="Open restaurant records, subscription status and owner details."
          button="Open Restaurants"
          onClick={() => onOpenSection('restaurants')}
        />
        <SuperAdminActionCard
          icon={<CreditCard size={22} />}
          title="Subscriptions"
          text="Review trials, active plans, grace periods and Mamo subscription attempts."
          button="Open Subscriptions"
          onClick={() => onOpenSection('subscriptions')}
        />
        <SuperAdminActionCard
          icon={<BadgePercent size={22} />}
          title="Discount Coupons"
          text="Create AED 70 test coupons or launch discounts for restaurant subscriptions."
          button="Create Coupon"
          onClick={() => onOpenSection('coupons')}
        />
        <SuperAdminActionCard
          icon={<ReceiptText size={22} />}
          title="Project Expenses"
          text="Track project costs, operations expenses and business investment."
          button="Open Expenses"
          onClick={() => onOpenSection('expenses')}
        />
        <SuperAdminActionCard
          icon={<BarChart3 size={22} />}
          title="Sales Channel Analytics"
          text="Track channels, conversion and platform growth."
          button="Open Analytics"
          onClick={() => onOpenSection('analytics')}
        />
        <SuperAdminActionCard
          icon={<Users size={22} />}
          title="Partner Management"
          text="Partner admin, sales links and channel visibility can be added later."
          button="Planned"
          disabled
        />
        <SuperAdminActionCard
          icon={<Building2 size={22} />}
          title="Platform Structure"
          text="This dashboard is now split into left menu and right functional workspace."
          button="Ready"
          disabled
        />
      </div>
    </div>
  )
}

function SuperAdminKpi({ icon, label, value }) {
  return (
    <article className="super-admin-kpi-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function SuperAdminActionCard({ icon, title, text, button, onClick, disabled = false }) {
  return (
    <article className="super-admin-action-card">
      <div>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" onClick={onClick} disabled={disabled}>
        {button}
      </button>
    </article>
  )
}

export default SuperAdminDashboard
