import {
  BadgePercent,
  BarChart3,
  QrCode,
  ReceiptText,
  ShoppingCart,
  Store,
} from 'lucide-react'
import MiniCard from '../dashboard/components/MiniCard'

function RestaurantOverview({ profile, restaurant, onOpenSection }) {
  return (
    <>
      <section className="restaurant-overview-hero">
        <div>
          <p className="pricing-label">Restaurant Dashboard</p>
          <h1>Welcome, {profile?.full_name || 'Restaurant Owner'}</h1>
          <p>
            Manage counter orders, QR menu, table orders, delivery orders,
            customers, offers, staff and reports from one restaurant command
            center.
          </p>
        </div>

        <div className="restaurant-live-pill">
          <span>Live Status</span>
          <strong>{restaurant?.is_active ? 'Active' : 'Inactive'}</strong>
        </div>
      </section>

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

      <section className="restaurant-action-grid">
        <ActionCard
          icon={<ShoppingCart />}
          title="New Order / POS"
          text="Create counter orders with product grid, cart, discount and checkout."
          buttonText="Open POS"
          onClick={() => onOpenSection('pos')}
        />
        <ActionCard
          icon={<Store />}
          title="Menu Management"
          text="Add categories, items, prices, stock, images and availability."
          buttonText="Manage Menu"
          onClick={() => onOpenSection('menu')}
        />
        <ActionCard
          icon={<QrCode />}
          title="Tables & QR"
          text="Create live menu QR and table-wise QR codes."
          buttonText="Manage QR"
          onClick={() => onOpenSection('qr')}
        />
        <ActionCard
          icon={<ReceiptText />}
          title="Orders"
          text="Manage table orders and delivery orders with live status."
          buttonText="View Orders"
          onClick={() => onOpenSection('orders')}
        />
        <ActionCard
          icon={<BadgePercent />}
          title="Offers & Campaigns"
          text="Create discounts, rewards, banners and countdown campaigns."
          buttonText="Create Offer"
          onClick={() => onOpenSection('discounts')}
        />
        <ActionCard
          icon={<BarChart3 />}
          title="Reports"
          text="Track sales, customers, best items and restaurant performance."
          buttonText="View Reports"
          onClick={() => onOpenSection('reports')}
        />
      </section>
    </>
  )
}

function ActionCard({ icon, title, text, buttonText, onClick }) {
  return (
    <article className="restaurant-action-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" className="tiny-button" onClick={onClick}>
        {buttonText}
      </button>
    </article>
  )
}

export default RestaurantOverview