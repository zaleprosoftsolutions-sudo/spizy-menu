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

const sidebarStorageKeys = {
  openGroups: 'spizy.restaurant.sidebar.openGroups.launch.v5',
  scrollTop: 'spizy.restaurant.sidebar.scrollTop.launch.v5',
}

const restaurantNavGroups = [
  {
    id: 'daily',
    title: 'Daily Operations',
    subtitle: 'Orders, POS and closing',
    defaultOpen: true,
    items: [
      { id: 'overview', label: 'Dashboard', description: 'Restaurant overview', icon: LayoutDashboard, badge: 'Core' },
      { id: 'subscription-billing', label: 'Subscription & Plans', description: 'Trial, Mamo Pay and upgrades', icon: CreditCard, badge: 'Plan' },
      { id: 'pos', label: 'New Order / POS', description: 'Counter order screen', icon: ShoppingCart, badge: 'Core' },
      { id: 'orders', label: 'Orders', description: 'Table and delivery orders', icon: ReceiptText, badge: 'Core' },
      { id: 'kitchen', label: 'Kitchen Display', description: 'Live preparation board', icon: ChefHat, badge: 'Core' },
      { id: 'customer-payments', label: 'Customer Payments', description: 'COD and unpaid collections', icon: CircleDollarSign, badge: 'Core' },
      { id: 'day-closing', label: 'Day Closing', description: 'Cash drawer and Z report', icon: ClipboardCheck, badge: 'Core' },
    ],
  },
  {
    id: 'menu_setup',
    title: 'Menu & QR Setup',
    subtitle: 'Products, menu and tables',
    defaultOpen: true,
    items: [
      { id: 'products', label: 'Products / Items', description: 'Categories, prices and images', icon: Utensils, badge: 'Core' },
      { id: 'qr', label: 'Tables & QR', description: 'Live QR menus', icon: QrCode, badge: 'Core' },
      { id: 'floor', label: 'Floor Plan', description: 'Live table status map', icon: LayoutGrid },
      { id: 'delivery', label: 'Delivery', description: 'Dispatch and COD tracking', icon: Truck },
      { id: 'delivery-zones', label: 'Delivery Zones', description: 'Area fees and minimum orders', icon: MapPin },
      { id: 'menu-schedule', label: 'Menu Schedule', description: 'Availability and happy hours', icon: Clock },
      { id: 'modifiers', label: 'Modifiers & Add-ons', description: 'Toppings, sauces and choices', icon: ListPlus },
      { id: 'nutrition-labels', label: 'Nutrition & Allergens', description: 'Dietary labels and warnings', icon: Tags },
    ],
  },
  {
    id: 'finance',
    title: 'Finance & Reports',
    subtitle: 'Money, reports and tax',
    defaultOpen: false,
    items: [
      { id: 'cash-bank', label: 'Cash & Bank', description: 'Accounts and money ledger', icon: Landmark, badge: 'Core' },
      { id: 'reports', label: 'Reports', description: 'Sales analytics', icon: BarChart3, badge: 'Core' },
      { id: 'receipt-print', label: 'Receipt / KOT Print', description: 'Thermal receipt and kitchen tickets', icon: Printer, badge: 'Launch' },
      { id: 'finance', label: 'Finance', description: 'Profit, dues and cash flow', icon: WalletCards },
      { id: 'expenses', label: 'Expenses', description: 'Bills, petty cash and costs', icon: WalletCards },
      { id: 'tax-invoices', label: 'Tax & Invoices', description: 'VAT/GST and invoice print', icon: FileText },
      { id: 'tax-invoice-center', label: 'Tax Invoice Center', description: 'VAT invoice records and preview', icon: FileText, badge: 'Beta' },
      { id: 'vat-statutory', label: 'VAT Statutory', description: 'TRN, VAT boxes and filing pack', icon: ClipboardCheck, badge: 'Beta' },
      { id: 'advanced-reports', label: 'Advanced Reports', description: 'Product, table and gateway reports', icon: BarChart3, badge: 'Beta' },
      { id: 'expense-reports', label: 'Expense Reports', description: 'Rent, salary and cost reports', icon: BarChart3, badge: 'Beta' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock & Costing',
    subtitle: 'Inventory, COGS and purchases',
    defaultOpen: false,
    items: [
      { id: 'inventory', label: 'Inventory', description: 'Stock, low stock and wastage', icon: Archive },
      { id: 'recipes', label: 'Recipes & Costing', description: 'Ingredients, cost and margin', icon: BookOpenCheck },
      { id: 'cogs', label: 'COGS & Margin', description: 'Food cost and gross profit', icon: BarChart3, badge: 'Beta' },
      { id: 'purchases', label: 'Purchases', description: 'Suppliers, bills and stock-in', icon: PackageCheck },
      { id: 'supplier-payments', label: 'Supplier Payments', description: 'Pay supplier dues and advances', icon: HandCoins },
      { id: 'branch-stock', label: 'Branch Stock', description: 'Branch stock and transfers', icon: ArrowLeftRight },
    ],
  },
  {
    id: 'customers_growth',
    title: 'Customers & Growth',
    subtitle: 'Rewards, campaigns and reviews',
    defaultOpen: false,
    items: [
      { id: 'customers', label: 'Customers & Rewards', description: 'Customers and repeat orders', icon: Users },
      { id: 'discounts', label: 'Discounts', description: 'Coupons and offers', icon: BadgePercent },
      { id: 'campaigns', label: 'Campaigns', description: 'Banner and countdown', icon: Megaphone },
      { id: 'reviews', label: 'Reviews', description: 'Customer feedback', icon: Star },
      { id: 'reservations', label: 'Reservations', description: 'Bookings and table holds', icon: CalendarCheck },
      { id: 'service-requests', label: 'Service Requests', description: 'Table calls and guest help', icon: BellRing },
      { id: 'loyalty-tiers', label: 'Loyalty Tiers', description: 'VIP tiers and membership', icon: Award },
      { id: 'gift-vouchers', label: 'Gift Vouchers', description: 'Store credit and gift cards', icon: Gift },
      { id: 'combo-deals', label: 'Combo Deals', description: 'Meal bundles and offers', icon: PackageCheck },
      { id: 'crm', label: 'CRM Notes', description: 'Tags, notes and follow-ups', icon: MessageCircle },
      { id: 'marketing', label: 'Marketing Broadcast', description: 'WhatsApp and customer messages', icon: MessageCircle },
    ],
  },
  {
    id: 'team_admin',
    title: 'Team & Admin',
    subtitle: 'Staff, printers and settings',
    defaultOpen: false,
    items: [
      { id: 'staff', label: 'Staff', description: 'Staff permissions', icon: UserCog, badge: 'Core' },
      { id: 'settings', label: 'Settings', description: 'Restaurant profile', icon: Settings, badge: 'Core' },
      { id: 'printers', label: 'Printers', description: 'Receipts and KOT print', icon: Printer, badge: 'Core' },
      { id: 'permissions-review', label: 'Permissions Review', description: 'Role access audit', icon: ShieldCheck },
      { id: 'attendance', label: 'Attendance', description: 'Shifts and clock-in', icon: Clock },
      { id: 'shift-closing', label: 'Shift Closing', description: 'Cash drawer handover', icon: ClipboardCheck },
      { id: 'payroll', label: 'Payroll', description: 'Salary and payouts', icon: WalletCards },
      { id: 'branches', label: 'Branches', description: 'Locations and maps', icon: Building2 },
      { id: 'activity-logs', label: 'Activity Logs', description: 'Audit trail and changes', icon: History },
      { id: 'data-export', label: 'Data Export', description: 'CSV backup center', icon: Download },
      { id: 'data-import', label: 'Data Import', description: 'Bulk CSV upload center', icon: Upload },
    ],
  },
  {
    id: 'launch_more',
    title: 'Launch & More Tools',
    subtitle: 'QA, deploy and beta utilities',
    defaultOpen: false,
    items: [
      { id: 'onboarding', label: 'Onboarding', description: 'Launch setup wizard', icon: ClipboardCheck, badge: 'Launch' },
      { id: 'launch-qa', label: 'Launch QA', description: 'Production test checklist', icon: ClipboardCheck, badge: 'Launch' },
      { id: 'deployment-center', label: 'Deploy Center', description: 'SQL, functions and secrets', icon: Code2, badge: 'Launch' },
      { id: 'pwa-mobile', label: 'Mobile / PWA', description: 'Install, offline and print readiness', icon: LayoutGrid, badge: 'Launch' },
      { id: 'alerts', label: 'Alerts Center', description: 'Live action alerts', icon: CircleAlert },
      { id: 'notification-center', label: 'Reminder Center', description: 'Notification rules and reminders', icon: BellRing },
      { id: 'notification-providers', label: 'Notification Providers', description: 'Email, WhatsApp and push setup', icon: Send, badge: 'Beta' },
      { id: 'refund-automation', label: 'Refund Automation', description: 'Gateway refund readiness', icon: RotateCcw, badge: 'Beta' },
      { id: 'offline-pos', label: 'Offline POS Queue', description: 'Draft orders before sync', icon: WifiOff, badge: 'Beta' },
    ],
  },
]

function getDefaultOpenGroups(activeSection) {
  const defaults = {}

  restaurantNavGroups.forEach((group) => {
    defaults[group.id] = Boolean(
      group.defaultOpen || group.items.some((item) => item.id === activeSection),
    )
  })

  return defaults
}

function readStoredOpenGroups(activeSection) {
  if (typeof window === 'undefined') return getDefaultOpenGroups(activeSection)

  try {
    const stored = window.localStorage.getItem(sidebarStorageKeys.openGroups)
    if (!stored) return getDefaultOpenGroups(activeSection)

    return {
      ...getDefaultOpenGroups(activeSection),
      ...JSON.parse(stored),
    }
  } catch {
    return getDefaultOpenGroups(activeSection)
  }
}

function RestaurantSidebar({
  restaurant,
  activeSection,
  onSectionChange,
  allowedSections = [],
  staffAccess = null,
}) {
  const scrollRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [openGroups, setOpenGroups] = useState(() => readStoredOpenGroups(activeSection))

  const launchVisibleSections = getLaunchVisibleSections(allowedSections)
  const launchModeLabel = getSpizyLaunchModeLabel()

  const visibleNavGroups = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return restaurantNavGroups
      .map((group) => {
        const items = group.items.filter((item) => {
          const isAllowed =
            launchVisibleSections.length === 0 || launchVisibleSections.includes(item.id)

          if (!isAllowed) return false
          if (!keyword) return true

          return [item.label, item.description, group.title]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        })

        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
  }, [launchVisibleSections, searchTerm])

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current }

      restaurantNavGroups.forEach((group) => {
        if (group.items.some((item) => item.id === activeSection)) {
          next[group.id] = true
        }
      })

      return next
    })
  }, [activeSection])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(sidebarStorageKeys.openGroups, JSON.stringify(openGroups))
  }, [openGroups])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || typeof window === 'undefined') return undefined

    const savedPosition = Number(window.localStorage.getItem(sidebarStorageKeys.scrollTop) || 0)
    if (savedPosition > 0) element.scrollTop = savedPosition

    const savePosition = () => {
      window.localStorage.setItem(sidebarStorageKeys.scrollTop, String(element.scrollTop || 0))
    }

    element.addEventListener('scroll', savePosition, { passive: true })

    return () => element.removeEventListener('scroll', savePosition)
  }, [])

  useEffect(() => {
    if (!searchTerm.trim()) return

    const next = {}
    visibleNavGroups.forEach((group) => {
      next[group.id] = true
    })
    setOpenGroups((current) => ({ ...current, ...next }))
  }, [searchTerm, visibleNavGroups])

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

  return (
    <aside className="restaurant-sidebar spizy-sidebar-accordion">
      <div className="restaurant-sidebar-head spizy-sidebar-tenant-card">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div>
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <label className="spizy-sidebar-search">
        <Search size={16} />
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search menu..."
        />
      </label>

      <nav className="restaurant-nav spizy-sidebar-scroll" ref={scrollRef}>
        {visibleNavGroups.map((group) => {
          const isOpen = openGroups[group.id]
          const activeInside = group.items.some((item) => item.id === activeSection)

          return (
            <section
              className={`restaurant-nav-group spizy-sidebar-group ${activeInside ? 'has-active' : ''}`}
              key={group.id}
            >
              <button
                type="button"
                className="spizy-sidebar-group-toggle"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
              >
                <span>
                  <strong>{group.title}</strong>
                  <small>{group.subtitle}</small>
                </span>
                <em>{group.items.length}</em>
                <ChevronDown size={16} className={isOpen ? 'open' : ''} />
              </button>

              {isOpen && (
                <div className="spizy-sidebar-item-list">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeSection === item.id

                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`restaurant-nav-button ${isActive ? 'active' : ''}`}
                        onClick={() => onSectionChange(item.id)}
                      >
                        <span className="spizy-sidebar-icon">
                          <Icon size={18} />
                        </span>
                        <span className="spizy-sidebar-copy">
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        {item.badge && <b>{item.badge}</b>}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </nav>

      {staffAccess?.isLimited && (
        <div className="restaurant-staff-mode-box">
          <strong>{staffAccess.staff?.staff_role || 'Staff mode'}</strong>
          <span>Only permitted modules are shown.</span>
        </div>
      )}

      {launchModeLabel === 'Launch-safe mode active' && (
        <div className="restaurant-staff-mode-box launch-safe">
          <strong>Launch-safe mode</strong>
          <span>Beta tools hidden for tomorrow's launch.</span>
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
