import {
  Archive,
  ArrowLeftRight,
  Building2,
  BookOpenCheck,
  BellRing,
  CircleAlert,
  CalendarCheck,
  ClipboardCheck,
  CircleDollarSign,
  FileText,
  Download,
  Upload,
  Clock,
  PackageCheck,
  HandCoins,
  History,
  Landmark,
  MapPin,
  Printer,
  BadgePercent,
  BarChart3,
  Calculator,
  ChefHat,
  LayoutDashboard,
  LayoutGrid,
  ListPlus,
  Megaphone,
  QrCode,
  ReceiptText,
  Settings,
  WalletCards,
  ShoppingCart,
  Star,
  Store,
  Tags,
  Truck,
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
        id: 'alerts',
        label: 'Alerts Center',
        description: 'Live action alerts',
        icon: CircleAlert,
      },
      {
        id: 'pos',
        label: 'New Order / POS',
        description: 'Counter order screen',
        icon: ShoppingCart,
      },
      {
        id: 'floor',
        label: 'Floor Plan',
        description: 'Live table status map',
        icon: LayoutGrid,
      },
      {
        id: 'orders',
        label: 'Orders',
        description: 'Table and delivery orders',
        icon: ReceiptText,
      },
      {
        id: 'customer-payments',
        label: 'Customer Payments',
        description: 'COD and unpaid collections',
        icon: CircleDollarSign,
      },
      {
        id: 'day-closing',
        label: 'Day Closing',
        description: 'Cash drawer and Z report',
        icon: ClipboardCheck,
      },
      {
        id: 'kitchen',
        label: 'Kitchen Display',
        description: 'Live preparation board',
        icon: ChefHat,
      },
      {
        id: 'delivery',
        label: 'Delivery',
        description: 'Dispatch and COD tracking',
        icon: Truck,
      },
      {
        id: 'delivery-zones',
        label: 'Delivery Zones',
        description: 'Area fees and minimum orders',
        icon: MapPin,
      },
      {
        id: 'reservations',
        label: 'Reservations',
        description: 'Bookings and table holds',
        icon: CalendarCheck,
      },
      {
        id: 'service-requests',
        label: 'Service Requests',
        description: 'Table calls and guest help',
        icon: BellRing,
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
        id: 'recipes',
        label: 'Recipes & Costing',
        description: 'Ingredients, cost and margin',
        icon: BookOpenCheck,
      },
      {
        id: 'modifiers',
        label: 'Modifiers & Add-ons',
        description: 'Toppings, sauces and choices',
        icon: ListPlus,
      },
      {
        id: 'qr',
        label: 'Tables & QR',
        description: 'Live QR menus',
        icon: QrCode,
      },
      {
        id: 'inventory',
        label: 'Inventory',
        description: 'Stock, low stock and wastage',
        icon: Archive,
      },
      {
        id: 'branch-stock',
        label: 'Branch Stock',
        description: 'Branch stock and transfers',
        icon: ArrowLeftRight,
      },
      {
        id: 'purchases',
        label: 'Purchases',
        description: 'Suppliers, bills and stock-in',
        icon: PackageCheck,
      },
      {
        id: 'supplier-payments',
        label: 'Supplier Payments',
        description: 'Pay supplier dues and advances',
        icon: HandCoins,
      },
      {
        id: 'expenses',
        label: 'Expenses',
        description: 'Bills, petty cash and costs',
        icon: WalletCards,
      },
      {
        id: 'finance',
        label: 'Finance',
        description: 'Profit, dues and cash flow',
        icon: Calculator,
      },
      {
        id: 'cash-bank',
        label: 'Cash & Bank',
        description: 'Accounts and money ledger',
        icon: Landmark,
      },
      {
        id: 'tax-invoices',
        label: 'Tax & Invoices',
        description: 'VAT/GST and invoice print',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Growth',
    items: [
      {
        id: 'customers',
        label: 'Customers & Rewards',
        description: 'Customers, points, repeat orders',
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
        id: 'attendance',
        label: 'Attendance',
        description: 'Shifts and clock-in',
        icon: Clock,
      },
      {
        id: 'payroll',
        label: 'Payroll',
        description: 'Salary and payouts',
        icon: WalletCards,
      },
      {
        id: 'printers',
        label: 'Printers',
        description: 'Receipts and KOT print',
        icon: Printer,
      },
      {
        id: 'data-export',
        label: 'Data Export',
        description: 'CSV backup center',
        icon: Download,
      },
      {
        id: 'data-import',
        label: 'Data Import',
        description: 'Bulk CSV upload center',
        icon: Upload,
      },
      {
        id: 'activity-logs',
        label: 'Activity Logs',
        description: 'Audit trail and changes',
        icon: History,
      },
      {
        id: 'branches',
        label: 'Branches',
        description: 'Locations and maps',
        icon: Building2,
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

function RestaurantSidebar({
  restaurant,
  activeSection,
  onSectionChange,
  allowedSections = [],
  staffAccess = null,
}) {
  const visibleNavGroups = restaurantNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        allowedSections.length === 0 ? true : allowedSections.includes(item.id),
      ),
    }))
    .filter((group) => group.items.length > 0)

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  return (
    <aside className="restaurant-sidebar">
      <div className="restaurant-sidebar-head">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div>
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <nav className="restaurant-nav">
        {visibleNavGroups.map((group) => (
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

      {staffAccess?.isLimited && (
        <div className="restaurant-staff-mode-box">
          <strong>{staffAccess.staff?.staff_role || 'Staff mode'}</strong>
          <span>Only permitted modules are shown.</span>
        </div>
      )}

      <div className="restaurant-sidebar-foot">
        <Store size={16} />
        <span>Spizy restaurant OS</span>
        <Tags size={16} />
      </div>
    </aside>
  )
}

export default RestaurantSidebar
