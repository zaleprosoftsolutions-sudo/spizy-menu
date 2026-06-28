import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Award,
  ArrowLeftRight,
  BadgePercent,
  BarChart3,
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

const STORAGE_OPEN_GROUPS = 'spizy.restaurant.sidebar.openGroups.v3'
const STORAGE_SCROLL_TOP = 'spizy.restaurant.sidebar.scrollTop.v3'

const restaurantNavGroups = [
  {
    id: 'daily',
    title: 'Daily Operations',
    description: 'Orders, POS and closing',
    badge: 'Core',
    defaultOpen: true,
    items: [
      { id: 'overview', label: 'Dashboard', description: 'Restaurant overview', icon: LayoutDashboard },
      { id: 'pos', label: 'New Order / POS', description: 'Counter order screen', icon: ShoppingCart },
      { id: 'orders', label: 'Orders', description: 'Table and delivery orders', icon: ReceiptText },
      { id: 'kitchen', label: 'Kitchen Display', description: 'Live preparation board', icon: ChefHat },
      { id: 'customer-payments', label: 'Customer Payments', description: 'COD and unpaid collections', icon: CircleDollarSign },
      { id: 'day-closing', label: 'Day Closing', description: 'Cash drawer and Z report', icon: ClipboardCheck },
      { id: 'receipt-print', label: 'Receipt / KOT Print', description: 'Thermal receipt and kitchen tickets', icon: Printer },
    ],
  },
  {
    id: 'setup',
    title: 'Menu & QR Setup',
    description: 'Products, menu and tables',
    badge: 'Setup',
    defaultOpen: true,
    items: [
      { id: 'onboarding', label: 'Onboarding', description: 'Launch setup wizard', icon: ClipboardCheck },
      { id: 'products', label: 'Products / Items', description: 'Categories, prices and images', icon: Utensils },
      { id: 'qr', label: 'Tables & QR', description: 'Live QR menus', icon: QrCode },
      { id: 'floor', label: 'Floor Plan', description: 'Live table status map', icon: LayoutGrid },
      { id: 'menu-schedule', label: 'Menu Schedule', description: 'Availability and happy hours', icon: Clock },
      { id: 'modifiers', label: 'Modifiers & Add-ons', description: 'Toppings, sauces and choices', icon: ListPlus },
      { id: 'delivery-zones', label: 'Delivery Zones', description: 'Area fees and minimum orders', icon: MapPin },
    ],
  },
  {
    id: 'finance',
    title: 'Finance & Reports',
    description: 'Money, reports and billing',
    badge: 'Money',
    defaultOpen: true,
    items: [
      { id: 'cash-bank', label: 'Cash & Bank', description: 'Accounts and money ledger', icon: Landmark },
      { id: 'reports', label: 'Reports', description: 'Sales analytics', icon: BarChart3 },
      { id: 'subscription-billing', label: 'Subscription', description: 'Mamo Pay billing', icon: CreditCard },
      { id: 'finance', label: 'Finance', description: 'Profit, dues and cash flow', icon: WalletCards },
      { id: 'expenses', label: 'Expenses', description: 'Bills, petty cash and costs', icon: WalletCards },
      { id: 'tax-invoices', label: 'Tax & Invoices', description: 'VAT/GST and invoice print', icon: FileText },
      { id: 'tax-invoice-center', label: 'Tax Invoice Center', description: 'VAT invoice records and preview', icon: FileText },
      { id: 'vat-statutory', label: 'VAT Statutory', description: 'TRN, VAT boxes and filing pack', icon: ClipboardCheck },
    ],
  },
  {
    id: 'stock',
    title: 'Stock & Costing',
    description: 'Inventory, recipes and purchases',
    badge: 'Ops',
    items: [
      { id: 'inventory', label: 'Inventory', description: 'Stock, low stock and wastage', icon: Archive },
      { id: 'recipes', label: 'Recipes & Costing', description: 'Ingredients, cost and margin', icon: BookOpenCheck },
      { id: 'cogs', label: 'COGS & Margin', description: 'Food cost and gross profit', icon: BarChart3 },
      { id: 'purchases', label: 'Purchases', description: 'Suppliers, bills and stock-in', icon: PackageCheck },
      { id: 'supplier-payments', label: 'Supplier Payments', description: 'Pay supplier dues and advances', icon: HandCoins },
      { id: 'branch-stock', label: 'Branch Stock', description: 'Branch stock and transfers', icon: ArrowLeftRight },
      { id: 'expense-reports', label: 'Expense Reports', description: 'Rent, salary and cost reports', icon: BarChart3 },
    ],
  },
  {
    id: 'customers',
    title: 'Customers & Growth',
    description: 'Customers, offers and reviews',
    badge: 'Growth',
    items: [
      { id: 'customers', label: 'Customers & Rewards', description: 'Customers, points, repeat orders', icon: Users },
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
    id: 'team',
    title: 'Team & Admin',
    description: 'Staff, printers and settings',
    badge: 'Admin',
    defaultOpen: true,
    items: [
      { id: 'staff', label: 'Staff', description: 'Staff permissions', icon: UserCog },
      { id: 'settings', label: 'Settings', description: 'Restaurant profile', icon: Settings },
      { id: 'permissions-review', label: 'Permissions Review', description: 'Role access audit', icon: ShieldCheck },
      { id: 'attendance', label: 'Attendance', description: 'Shifts and clock-in', icon: Clock },
      { id: 'shift-closing', label: 'Shift Closing', description: 'Cash drawer handover', icon: ClipboardCheck },
      { id: 'printers', label: 'Printers', description: 'Receipts and KOT print', icon: Printer },
      { id: 'payroll', label: 'Payroll', description: 'Salary and payouts', icon: WalletCards },
      { id: 'activity-logs', label: 'Activity Logs', description: 'Audit trail and changes', icon: History },
      { id: 'branches', label: 'Branches', description: 'Locations and maps', icon: Building2 },
      { id: 'data-export', label: 'Data Export', description: 'CSV backup center', icon: Download },
      { id: 'data-import', label: 'Data Import', description: 'Bulk CSV upload center', icon: Upload },
    ],
  },
  {
    id: 'launch',
    title: 'Launch & More Tools',
    description: 'QA, deploy and alerts',
    badge: 'Launch',
    items: [
      { id: 'launch-qa', label: 'Launch QA', description: 'Production test checklist', icon: ClipboardCheck },
      { id: 'deployment-center', label: 'Deploy Center', description: 'SQL, functions and secrets', icon: Code2 },
      { id: 'pwa-mobile', label: 'Mobile / PWA', description: 'Install, offline and print readiness', icon: LayoutGrid },
      { id: 'alerts', label: 'Alerts Center', description: 'Live action alerts', icon: CircleAlert },
      { id: 'notification-center', label: 'Reminder Center', description: 'Notification rules and reminders', icon: BellRing },
      { id: 'notification-providers', label: 'Notification Providers', description: 'Email, WhatsApp and push setup', icon: Send },
      { id: 'offline-pos', label: 'Offline POS Queue', description: 'Draft orders before sync', icon: WifiOff },
      { id: 'delivery', label: 'Delivery', description: 'Dispatch and COD tracking', icon: Truck },
      { id: 'refund-automation', label: 'Refund Automation', description: 'Gateway refund readiness', icon: RotateCcw },
      { id: 'advanced-reports', label: 'Advanced Reports', description: 'Product, table and gateway reports', icon: BarChart3 },
      { id: 'nutrition-labels', label: 'Nutrition & Allergens', description: 'Dietary labels and warnings', icon: Tags },
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
  const navScrollRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const launchVisibleSections = getLaunchVisibleSections(allowedSections)
  const launchModeLabel = getSpizyLaunchModeLabel()

  const baseVisibleGroups = useMemo(() => {
    const visibleSet = new Set(launchVisibleSections)

    return restaurantNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          launchVisibleSections.length === 0 ? true : visibleSet.has(item.id),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [launchVisibleSections])

  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_OPEN_GROUPS) || 'null')
      if (stored && typeof stored === 'object') return stored
    } catch {
      // Ignore storage errors.
    }

    return restaurantNavGroups.reduce((acc, group) => {
      acc[group.id] = Boolean(group.defaultOpen)
      return acc
    }, {})
  })

  const activeGroupId = useMemo(() => {
    return baseVisibleGroups.find((group) =>
      group.items.some((item) => item.id === activeSection),
    )?.id
  }, [activeSection, baseVisibleGroups])

  useEffect(() => {
    if (!activeGroupId) return

    setOpenGroups((current) => {
      if (current[activeGroupId]) return current
      return { ...current, [activeGroupId]: true }
    })
  }, [activeGroupId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_OPEN_GROUPS, JSON.stringify(openGroups))
    } catch {
      // Ignore storage errors.
    }
  }, [openGroups])

  useEffect(() => {
    const element = navScrollRef.current
    if (!element) return undefined

    try {
      const storedTop = Number(localStorage.getItem(STORAGE_SCROLL_TOP) || 0)
      if (storedTop > 0) element.scrollTop = storedTop
    } catch {
      // Ignore storage errors.
    }

    const handleScroll = () => {
      try {
        localStorage.setItem(STORAGE_SCROLL_TOP, String(element.scrollTop || 0))
      } catch {
        // Ignore storage errors.
      }
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const visibleNavGroups = useMemo(() => {
    if (!normalizedSearch) return baseVisibleGroups

    return baseVisibleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          [item.label, item.description, group.title]
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [baseVisibleGroups, normalizedSearch])

  useEffect(() => {
    if (!normalizedSearch) return

    setOpenGroups((current) => {
      const next = { ...current }
      visibleNavGroups.forEach((group) => {
        next[group.id] = true
      })
      return next
    })
  }, [normalizedSearch, visibleNavGroups])

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  const totalVisibleItems = baseVisibleGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  )

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  return (
    <aside className="restaurant-sidebar restaurant-sidebar-readable">
      <div className="restaurant-sidebar-brand">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div>
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <label className="restaurant-sidebar-search">
        <Search size={16} />
        <input
          type="search"
          placeholder="Search menu..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </label>

      <nav className="restaurant-nav restaurant-accordion-nav" ref={navScrollRef}>
        {visibleNavGroups.length === 0 ? (
          <div className="restaurant-sidebar-empty">No matching menus found.</div>
        ) : (
          visibleNavGroups.map((group) => {
            const isOpen = openGroups[group.id] !== false
            const isActiveGroup = group.id === activeGroupId

            return (
              <div
                className={`restaurant-nav-group-card ${isActiveGroup ? 'active-group' : ''}`}
                key={group.id}
              >
                <button
                  type="button"
                  className="restaurant-nav-group-toggle"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <span>
                    <strong>{group.title}</strong>
                    <small>{group.description}</small>
                  </span>

                  <em>{group.items.length}</em>
                  <ChevronDown className={isOpen ? 'open' : ''} size={17} />
                </button>

                {isOpen && (
                  <div className="restaurant-nav-group-items">
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
                          <span className="restaurant-nav-icon"><Icon size={18} /></span>
                          <span className="restaurant-nav-copy">
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </nav>

      {staffAccess?.isLimited && (
        <div className="restaurant-sidebar-note">
          <strong>{staffAccess.staff?.staff_role || 'Staff mode'}</strong>
          <span>Only permitted modules are shown.</span>
        </div>
      )}

      {launchModeLabel === 'Launch-safe mode active' && (
        <div className="restaurant-sidebar-note launch">
          <strong>Launch-safe mode</strong>
          <span>{totalVisibleItems} stable launch menus visible. Beta tools are hidden.</span>
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
