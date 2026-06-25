import {
  BadgePercent,
  BarChart3,
  LayoutDashboard,
  Megaphone,
  QrCode,
  ReceiptText,
  Settings,
  ShoppingCart,
  Star,
  Store,
  Tags,
  UserCog,
  Users,
  Utensils,
} from 'lucide-react'

const restaurantNavGroups = [
  {
    title: 'Sales',
    items: [
      {
        id: 'overview',
        label: 'Dashboard',
        description: 'Restaurant overview',
        icon: LayoutDashboard,
      },
      {
        id: 'pos',
        label: 'New Order / POS',
        description: 'Counter order screen',
        icon: ShoppingCart,
      },
      {
        id: 'orders',
        label: 'Orders',
        description: 'Table and delivery orders',
        icon: ReceiptText,
      },
    ],
  },
  {
    title: 'Menu',
    items: [
      {
        id: 'products',
        label: 'Products / Items',
        description: 'Categories, prices, stock, images',
        icon: Utensils,
      },
      {
        id: 'qr',
        label: 'Tables & QR',
        description: 'Live QR menus',
        icon: QrCode,
      },
    ],
  },
  {
    title: 'Growth',
    items: [
      {
        id: 'customers',
        label: 'Customers',
        description: 'Customer list and rewards',
        icon: Users,
      },
      {
        id: 'discounts',
        label: 'Discounts',
        description: 'Coupons and offers',
        icon: BadgePercent,
      },
      {
        id: 'campaigns',
        label: 'Campaigns',
        description: 'Banner and countdown',
        icon: Megaphone,
      },
      {
        id: 'reviews',
        label: 'Reviews',
        description: 'Customer feedback',
        icon: Star,
      },
      {
        id: 'reports',
        label: 'Reports',
        description: 'Sales analytics',
        icon: BarChart3,
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      {
        id: 'staff',
        label: 'Staff',
        description: 'Staff permissions',
        icon: UserCog,
      },
      {
        id: 'settings',
        label: 'Settings',
        description: 'Restaurant profile',
        icon: Settings,
      },
    ],
  },
]

function RestaurantSidebar({ restaurant, activeSection, onSectionChange }) {
  return (
    <aside className="restaurant-sidebar">
      <div className="restaurant-sidebar-head">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div>
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{restaurant?.subscription_status || 'trialing'}</span>
        </div>
      </div>

      <nav className="restaurant-nav">
        {restaurantNavGroups.map((group) => (
          <div className="restaurant-nav-group" key={group.title}>
            <p className="restaurant-nav-title">{group.title}</p>

            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id

              return (
                <button
                  type="button"
                  key={item.id}
                  className={`restaurant-nav-button ${
                    isActive ? 'active' : ''
                  }`}
                  onClick={() => onSectionChange(item.id)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="restaurant-sidebar-foot">
        <Store size={16} />
        <span>Spizy restaurant OS</span>
        <Tags size={16} />
      </div>
    </aside>
  )
}

export default RestaurantSidebar