import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Award,
  ArrowLeftRight,
  BarChart3,
  BadgePercent,
  BellRing,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  Calculator,
  ChefHat,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Code2,
  CreditCard,
  Download,
  FileText,
  Gift,
  HandCoins,
  History,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  ListPlus,
  MapPin,
  Megaphone,
  MessageCircle,
  PackageCheck,
  Printer,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Tags,
  Truck,
  Upload,
  UserCog,
  Users,
  Utensils,
  WalletCards,
  WifiOff,
} from 'lucide-react'
import { getLaunchVisibleSections, getSpizyLaunchModeLabel } from './launchMode'
import './RestaurantSidebar.css'

const SIDEBAR_SCROLL_KEY = 'spizy_restaurant_sidebar_scroll_v2'
const SIDEBAR_GROUPS_KEY = 'spizy_restaurant_sidebar_groups_v2'

const allNavigationItems = {
  overview: {
    id: 'overview',
    label: 'Dashboard',
    description: 'Owner command center',
    icon: LayoutDashboard,
    badge: 'Core',
  },
  onboarding: {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'Launch setup wizard',
    icon: ClipboardCheck,
    badge: 'Launch',
  },
  'subscription-billing': {
    id: 'subscription-billing',
    label: 'Subscription',
    description: 'Mamo Pay billing',
    icon: CreditCard,
    badge: 'Core',
  },
  'pwa-mobile': {
    id: 'pwa-mobile',
    label: 'Mobile / PWA',
    description: 'Install and mobile checks',
    icon: LayoutGrid,
  },
  'offline-pos': {
    id: 'offline-pos',
    label: 'Offline POS Queue',
    description: 'Draft orders before sync',
    icon: WifiOff,
    badge: 'Beta',
  },
  'launch-qa': {
    id: 'launch-qa',
    label: 'Launch QA',
    description: 'Production test checklist',
    icon: ClipboardCheck,
    badge: 'Launch',
  },
  'deployment-center': {
    id: 'deployment-center',
    label: 'Deploy Center',
    description: 'SQL, functions and secrets',
    icon: Code2,
    badge: 'Launch',
  },
  'receipt-print': {
    id: 'receipt-print',
    label: 'Receipt / KOT Print',
    description: 'Thermal print checks',
    icon: Printer,
    badge: 'Core',
  },
  alerts: {
    id: 'alerts',
    label: 'Alerts Center',
    description: 'Live action alerts',
    icon: CircleAlert,
  },
  'notification-center': {
    id: 'notification-center',
    label: 'Reminder Center',
    description: 'Rules and reminders',
    icon: BellRing,
  },
  'notification-providers': {
    id: 'notification-providers',
    label: 'Notification Providers',
    description: 'Email, WhatsApp and push setup',
    icon: Send,
    badge: 'Beta',
  },
  pos: {
    id: 'pos',
    label: 'New Order / POS',
    description: 'Counter order screen',
    icon: ShoppingCart,
    badge: 'Core',
  },
  floor: {
    id: 'floor',
    label: 'Floor Plan',
    description: 'Live table status map',
    icon: LayoutGrid,
  },
  orders: {
    id: 'orders',
    label: 'Orders',
    description: 'Table and delivery orders',
    icon: ReceiptText,
    badge: 'Core',
  },
  'customer-payments': {
    id: 'customer-payments',
    label: 'Customer Payments',
    description: 'COD and unpaid collections',
    icon: CircleDollarSign,
    badge: 'Core',
  },
  'refund-automation': {
    id: 'refund-automation',
    label: 'Refund Automation',
    description: 'Gateway refund readiness',
    icon: RotateCcw,
    badge: 'Beta',
  },
  'day-closing': {
    id: 'day-closing',
    label: 'Day Closing',
    description: 'Cash drawer and Z report',
    icon: ClipboardCheck,
    badge: 'Core',
  },
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen Display',
    description: 'Live preparation board',
    icon: ChefHat,
    badge: 'Core',
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    description: 'Dispatch and COD tracking',
    icon: Truck,
  },
  'delivery-zones': {
    id: 'delivery-zones',
    label: 'Delivery Zones',
    description: 'Area fees and minimum orders',
    icon: MapPin,
  },
  reservations: {
    id: 'reservations',
    label: 'Reservations',
    description: 'Bookings and table holds',
    icon: CalendarCheck,
  },
  'service-requests': {
    id: 'service-requests',
    label: 'Service Requests',
    description: 'Table calls and guest help',
    icon: BellRing,
  },
  products: {
    id: 'products',
    label: 'Products / Items',
    description: 'Items, prices and images',
    icon: Utensils,
    badge: 'Core',
  },
  'menu-schedule': {
    id: 'menu-schedule',
    label: 'Menu Schedule',
    description: 'Availability and happy hours',
    icon: Clock,
  },
  'nutrition-labels': {
    id: 'nutrition-labels',
    label: 'Nutrition & Allergens',
    description: 'Dietary labels and warnings',
    icon: Tags,
  },
  recipes: {
    id: 'recipes',
    label: 'Recipes & Costing',
    description: 'Ingredients and margin',
    icon: BookOpenCheck,
  },
  cogs: {
    id: 'cogs',
    label: 'COGS & Margin',
    description: 'Food cost and gross profit',
    icon: BarChart3,
    badge: 'Beta',
  },
  modifiers: {
    id: 'modifiers',
    label: 'Modifiers & Add-ons',
    description: 'Toppings and choices',
    icon: ListPlus,
  },
  qr: {
    id: 'qr',
    label: 'Tables & QR',
    description: 'Live QR menus',
    icon: QrCode,
    badge: 'Core',
  },
  inventory: {
    id: 'inventory',
    label: 'Inventory',
    description: 'Stock and wastage',
    icon: Archive,
  },
  'branch-stock': {
    id: 'branch-stock',
    label: 'Branch Stock',
    description: 'Branch transfers',
    icon: ArrowLeftRight,
  },
  purchases: {
    id: 'purchases',
    label: 'Purchases',
    description: 'Suppliers and stock-in',
    icon: PackageCheck,
  },
  'supplier-payments': {
    id: 'supplier-payments',
    label: 'Supplier Payments',
    description: 'Dues and advances',
    icon: HandCoins,
  },
  expenses: {
    id: 'expenses',
    label: 'Expenses',
    description: 'Bills and petty cash',
    icon: WalletCards,
  },
  'expense-reports': {
    id: 'expense-reports',
    label: 'Expense Reports',
    description: 'Cost category reports',
    icon: BarChart3,
    badge: 'Beta',
  },
  finance: {
    id: 'finance',
    label: 'Finance',
    description: 'Profit and dues',
    icon: Calculator,
  },
  'cash-bank': {
    id: 'cash-bank',
    label: 'Cash & Bank',
    description: 'Accounts and ledger',
    icon: Landmark,
    badge: 'Core',
  },
  'tax-invoice-center': {
    id: 'tax-invoice-center',
    label: 'Tax Invoice Center',
    description: 'VAT invoice preview',
    icon: FileText,
    badge: 'Beta',
  },
  'tax-invoices': {
    id: 'tax-invoices',
    label: 'Tax & Invoices',
    description: 'VAT/GST and invoice print',
    icon: FileText,
  },
  'vat-statutory': {
    id: 'vat-statutory',
    label: 'VAT Statutory',
    description: 'TRN and VAT filing pack',
    icon: ClipboardCheck,
    badge: 'Beta',
  },
  customers: {
    id: 'customers',
    label: 'Customers & Rewards',
    description: 'Customers and points',
    icon: Users,
  },
  'loyalty-tiers': {
    id: 'loyalty-tiers',
    label: 'Loyalty Tiers',
    description: 'VIP memberships',
    icon: Award,
  },
  'gift-vouchers': {
    id: 'gift-vouchers',
    label: 'Gift Vouchers',
    description: 'Store credit and gift cards',
    icon: Gift,
  },
  'combo-deals': {
    id: 'combo-deals',
    label: 'Combo Deals',
    description: 'Meal bundles and offers',
    icon: PackageCheck,
  },
  crm: {
    id: 'crm',
    label: 'CRM Notes',
    description: 'Tags and follow-ups',
    icon: MessageCircle,
  },
  discounts: {
    id: 'discounts',
    label: 'Discounts',
    description: 'Coupons and offers',
    icon: BadgePercent,
  },
  campaigns: {
    id: 'campaigns',
    label: 'Campaigns',
    description: 'Banners and countdowns',
    icon: Megaphone,
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing Broadcast',
    description: 'Customer messages',
    icon: MessageCircle,
  },
  reviews: {
    id: 'reviews',
    label: 'Reviews',
    description: 'Customer feedback',
    icon: Star,
  },
  reports: {
    id: 'reports',
    label: 'Reports',
    description: 'Sales analytics',
    icon: BarChart3,
    badge: 'Core',
  },
  'advanced-reports': {
    id: 'advanced-reports',
    label: 'Advanced Reports',
    description: 'Product and gateway reports',
    icon: BarChart3,
    badge: 'Beta',
  },
  staff: {
    id: 'staff',
    label: 'Staff',
    description: 'Team and permissions',
    icon: UserCog,
    badge: 'Core',
  },
  'permissions-review': {
    id: 'permissions-review',
    label: 'Permissions Review',
    description: 'Role access audit',
    icon: ShieldCheck,
  },
  attendance: {
    id: 'attendance',
    label: 'Attendance',
    description: 'Clock-in and shifts',
    icon: Clock,
  },
  'shift-closing': {
    id: 'shift-closing',
    label: 'Shift Closing',
    description: 'Cash drawer handover',
    icon: ClipboardCheck,
  },
  payroll: {
    id: 'payroll',
    label: 'Payroll',
    description: 'Salary and payouts',
    icon: WalletCards,
  },
  printers: {
    id: 'printers',
    label: 'Printers',
    description: 'Receipts and KOT print',
    icon: Printer,
  },
  'data-export': {
    id: 'data-export',
    label: 'Data Export',
    description: 'CSV backup center',
    icon: Download,
  },
  'data-import': {
    id: 'data-import',
    label: 'Data Import',
    description: 'Bulk CSV upload center',
    icon: Upload,
  },
  'activity-logs': {
    id: 'activity-logs',
    label: 'Activity Logs',
    description: 'Audit trail and changes',
    icon: History,
  },
  branches: {
    id: 'branches',
    label: 'Branches',
    description: 'Locations and maps',
    icon: Building2,
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    description: 'Restaurant profile',
    icon: Settings,
    badge: 'Core',
  },
}

const navigationGroups = [
  {
    id: 'daily',
    title: 'Daily Operations',
    subtitle: 'Orders, POS, kitchen and closing',
    icon: ShoppingCart,
    defaultOpen: true,
    items: ['overview', 'pos', 'orders', 'kitchen', 'customer-payments', 'day-closing'],
  },
  {
    id: 'floor_delivery',
    title: 'Floor & Delivery',
    subtitle: 'Tables, delivery and guest requests',
    icon: LayoutGrid,
    defaultOpen: false,
    items: ['floor', 'delivery', 'delivery-zones', 'reservations', 'service-requests'],
  },
  {
    id: 'menu_qr',
    title: 'Menu & QR Setup',
    subtitle: 'Products, QR and menu control',
    icon: QrCode,
    defaultOpen: true,
    items: ['products', 'qr', 'modifiers', 'menu-schedule', 'nutrition-labels'],
  },
  {
    id: 'finance',
    title: 'Finance & Reports',
    subtitle: 'Cash, reports, subscription and VAT',
    icon: Landmark,
    defaultOpen: true,
    items: [
      'cash-bank',
      'expenses',
      'finance',
      'reports',
      'subscription-billing',
      'receipt-print',
      'tax-invoices',
      'tax-invoice-center',
      'vat-statutory',
      'advanced-reports',
      'expense-reports',
    ],
  },
  {
    id: 'stock_costing',
    title: 'Stock & Costing',
    subtitle: 'Inventory, recipes and suppliers',
    icon: Archive,
    defaultOpen: false,
    items: ['inventory', 'recipes', 'cogs', 'purchases', 'supplier-payments', 'branch-stock'],
  },
  {
    id: 'growth',
    title: 'Customers & Growth',
    subtitle: 'Customers, offers and marketing',
    icon: Users,
    defaultOpen: false,
    items: [
      'customers',
      'loyalty-tiers',
      'gift-vouchers',
      'combo-deals',
      'discounts',
      'campaigns',
      'marketing',
      'reviews',
      'crm',
    ],
  },
  {
    id: 'team_admin',
    title: 'Team & Admin',
    subtitle: 'Staff, settings and data tools',
    icon: Settings,
    defaultOpen: false,
    items: [
      'staff',
      'permissions-review',
      'attendance',
      'shift-closing',
      'payroll',
      'printers',
      'settings',
      'activity-logs',
      'data-export',
      'data-import',
      'branches',
    ],
  },
  {
    id: 'launch_tools',
    title: 'Launch & More Tools',
    subtitle: 'Launch QA, deploy and reminders',
    icon: RocketIcon,
    defaultOpen: false,
    items: [
      'onboarding',
      'launch-qa',
      'deployment-center',
      'pwa-mobile',
      'alerts',
      'notification-center',
      'notification-providers',
      'offline-pos',
      'refund-automation',
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
  const sidebarBodyRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [openGroups, setOpenGroups] = useState(() => getInitialOpenGroups())

  const launchVisibleSections = useMemo(
    () => getLaunchVisibleSections(allowedSections),
    [allowedSections],
  )
  const launchModeLabel = getSpizyLaunchModeLabel()
  const normalizedSearch = searchTerm.trim().toLowerCase()

  const availableSections = useMemo(() => {
    if (!launchVisibleSections.length) return new Set(Object.keys(allNavigationItems))

    return new Set(launchVisibleSections)
  }, [launchVisibleSections])

  const visibleGroups = useMemo(() => {
    return navigationGroups
      .map((group) => {
        const items = group.items
          .map((itemId) => allNavigationItems[itemId])
          .filter(Boolean)
          .filter((item) => availableSections.has(item.id))
          .filter((item) => {
            if (!normalizedSearch) return true

            return [item.label, item.description, group.title]
              .join(' ')
              .toLowerCase()
              .includes(normalizedSearch)
          })

        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
  }, [availableSections, normalizedSearch])

  useEffect(() => {
    const activeGroup = navigationGroups.find((group) =>
      group.items.includes(activeSection),
    )

    if (activeGroup) {
      setOpenGroups((current) => ({ ...current, [activeGroup.id]: true }))
    }
  }, [activeSection])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    window.localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(openGroups))

    return undefined
  }, [openGroups])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const element = sidebarBodyRef.current
    if (!element) return undefined

    const savedScrollTop = Number(window.localStorage.getItem(SIDEBAR_SCROLL_KEY) || 0)

    if (Number.isFinite(savedScrollTop) && savedScrollTop > 0) {
      window.requestAnimationFrame(() => {
        element.scrollTop = savedScrollTop
      })
    }

    const handleScroll = () => {
      window.localStorage.setItem(SIDEBAR_SCROLL_KEY, String(element.scrollTop || 0))
    }

    element.addEventListener('scroll', handleScroll, { passive: true })

    return () => element.removeEventListener('scroll', handleScroll)
  }, [])

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  const activeGroupId = navigationGroups.find((group) =>
    group.items.includes(activeSection),
  )?.id

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  return (
    <aside className="restaurant-sidebar spizy-premium-sidebar">
      <div className="restaurant-sidebar-head spizy-sidebar-brand-card">
        <div className="restaurant-avatar spizy-sidebar-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div className="spizy-sidebar-title-block">
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <div className="spizy-sidebar-search-wrap">
        <Search size={16} />
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search menu..."
          aria-label="Search restaurant menu"
        />
      </div>

      <nav className="restaurant-nav spizy-sidebar-scroll" ref={sidebarBodyRef}>
        {visibleGroups.length === 0 ? (
          <div className="spizy-sidebar-empty">
            <strong>No menu found</strong>
            <span>Try a different search keyword.</span>
          </div>
        ) : (
          visibleGroups.map((group) => {
            const GroupIcon = group.icon
            const isActiveGroup = group.id === activeGroupId
            const isOpen = normalizedSearch ? true : openGroups[group.id] !== false

            return (
              <section
                className={`restaurant-nav-group spizy-sidebar-group ${
                  isActiveGroup ? 'active-group' : ''
                }`}
                key={group.id}
              >
                <button
                  type="button"
                  className="spizy-sidebar-group-button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <span className="spizy-sidebar-group-main">
                    <span className="spizy-sidebar-group-icon">
                      <GroupIcon size={17} />
                    </span>
                    <span>
                      <strong>{group.title}</strong>
                      <small>{group.subtitle}</small>
                    </span>
                  </span>

                  <span className="spizy-sidebar-group-side">
                    <span>{group.items.length}</span>
                    <ChevronDown size={16} />
                  </span>
                </button>

                {isOpen && (
                  <div className="spizy-sidebar-items">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = activeSection === item.id

                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`restaurant-nav-button spizy-sidebar-item ${
                            isActive ? 'active' : ''
                          }`}
                          onClick={() => onSectionChange(item.id)}
                        >
                          <span className="spizy-sidebar-item-icon">
                            <Icon size={17} />
                          </span>
                          <span className="spizy-sidebar-item-text">
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                          {item.badge && (
                            <em className={`spizy-sidebar-badge ${item.badge.toLowerCase()}`}>
                              {item.badge}
                            </em>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })
        )}
      </nav>

      {staffAccess?.isLimited && (
        <div className="restaurant-staff-mode-box spizy-sidebar-note">
          <strong>{staffAccess.staff?.staff_role || 'Staff mode'}</strong>
          <span>Only permitted modules are shown.</span>
        </div>
      )}

      {launchModeLabel === 'Launch-safe mode active' && (
        <div className="restaurant-staff-mode-box spizy-sidebar-note launch">
          <strong>Launch-safe mode</strong>
          <span>Beta/foundation tools hidden for tomorrow's launch.</span>
        </div>
      )}

      <div className="restaurant-sidebar-foot spizy-sidebar-foot">
        <Store size={16} />
        <span>Spizy restaurant OS</span>
        <Tags size={16} />
      </div>
    </aside>
  )
}

function getInitialOpenGroups() {
  const defaults = navigationGroups.reduce((state, group) => {
    state[group.id] = group.defaultOpen === true
    return state
  }, {})

  if (typeof window === 'undefined') return defaults

  try {
    const saved = JSON.parse(window.localStorage.getItem(SIDEBAR_GROUPS_KEY) || '{}')
    return { ...defaults, ...saved }
  } catch {
    return defaults
  }
}

function RocketIcon(props) {
  return <ClipboardCheck {...props} />
}

export default RestaurantSidebar
