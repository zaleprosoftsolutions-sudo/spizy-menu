import { BarChart3, Globe2, ReceiptText, Store, Utensils } from 'lucide-react'
import MiniCard from '../components/MiniCard'
import ModuleCard from '../components/ModuleCard'

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

export default RestaurantDashboard