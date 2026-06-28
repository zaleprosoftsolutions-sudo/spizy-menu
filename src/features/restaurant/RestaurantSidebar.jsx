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

const SIDEBAR_OPEN_GROUPS_KEY = 'spizy.restaurant.sidebar.openGroups.v4'
const SIDEBAR_SCROLL_KEY = 'spizy.restaurant.sidebar.scrollTop.v4'

const restaurantNavGroups = [
  {
    id: 'daily',
    title: 'Daily Operations',
    subtitle: 'Orders, POS and closing',
    items: [
      { id: 'overview', label: 'Dashboard', description: 'Restaurant overview', icon: LayoutDashboard, badge: 'Core' },
      { id: 'pos', label: 'New Order / POS', description: 'Counter order screen', icon: ShoppingCart, badge: 'Core' },
      { id: 'orders', label: 'Orders', description: 'Table and delivery orders', icon: ReceiptText, badge: 'Core' },
      { id: 'kitchen', label: 'Kitchen Display', description: 'Live preparation board', icon: ChefHat, badge: 'Core' },
      { id: 'customer-payments', label: 'Customer Payments', description: 'COD and unpaid collections', icon: CircleDollarSign },
      { id: 'day-closing', label: 'Day Closing', description: 'Cash drawer and Z report', icon: ClipboardCheck, badge: 'Core' },
    ],
  },
  {
    id: 'floor_delivery',
    title: 'Floor & Delivery',
    subtitle: 'Tables, delivery and service',
    items: [
      { id: 'floor', label: 'Floor Plan', description: 'Live table status map', icon: LayoutGrid },
      { id: 'delivery', label: 'Delivery', description: 'Dispatch and COD tracking', icon: Truck },
      { id: 'delivery-zones', label: 'Delivery Zones', description: 'Area fees and minimum orders', icon: MapPin },
      { id: 'reservations', label: 'Reservations', description: 'Bookings and table holds', icon: CalendarCheck },
      { id: 'service-requests', label: 'Service Requests', description: 'Table calls and guest help', icon: BellRing },
    ],
  },
  {
    id: 'menu_qr',
    title: 'Menu & QR Setup',
    subtitle: 'Products, menu and tables',
    items: [
      { id: 'products', label: 'Products / Items', description: 'Categories, prices and images', icon: Utensils, badge: 'Core' },
      { id: 'qr', label: 'Tables & QR', description: 'Live QR menus', icon: QrCode, badge: 'Core' },
      { id: 'modifiers', label: 'Modifiers & Add-ons', description: 'Toppings, sauces and choices', icon: ListPlus },
      { id: 'menu-schedule', label: 'Menu Schedule', description: 'Availability and happy hours', icon: Clock },
      { id: 'nutrition-labels', label: 'Nutrition & Allergens', description: 'Dietary labels and warnings', icon: Tags },
    ],
  },
  {
    id: 'finance_reports',
    title: 'Finance & Reports',
    subtitle: 'Cash, reports and billing',
    items: [
      { id: 'cash-bank', label: 'Cash & Bank', description: 'Accounts and money ledger', icon: Landmark, badge: 'Core' },
      { id: 'finance', label: 'Finance', description: 'Profit, dues and cash flow', icon: BarChart3 },
      { id: 'reports', label: 'Reports', description: 'Sales analytics', icon: BarChart3, badge: 'Core' },
      { id: 'subscription-billing', label: 'Subscription', description: 'Mamo Pay billing', icon: CreditCard, badge: 'Launch' },
      { id: 'receipt-print', label: 'Receipt / KOT Print', description: 'Thermal receipt and kitchen tickets', icon: Printer, badge: 'Launch' },
      { id: 'tax-invoices', label: 'Tax & Invoices', description: 'VAT/GST and invoice print', icon: FileText },
    ],
  },
  {
    id: 'stock_costs',
    title: 'Stock & Costs',
    subtitle: 'Inventory, purchases and COGS',
    items: [
      { id: 'inventory', label: 'Inventory', description: 'Stock, low stock and wastage', icon: Archive },
      { id: 'purchases', label: 'Purchases', description: 'Suppliers, bills and stock-in', icon: PackageCheck },
      { id: 'supplier-payments', label: 'Supplier Payments', description: 'Supplier dues and advances', icon: HandCoins },
      { id: 'expenses', label: 'Expenses', description: 'Bills, petty cash and costs', icon: WalletCards },
      { id: 'recipes', label: 'Recipes & Costing', description: 'Ingredients, cost and margin', icon: BookOpenCheck },
      { id: 'cogs', label: 'COGS & Margin', description: 'Food cost and gross profit', icon: BarChart3, badge: 'Beta' },
      { id: 'expense-reports', label: 'Expense Reports', description: 'Rent, salary and cost reports', icon: BarChart3, badge: 'Beta' },
      { id: 'branch-stock', label: 'Branch Stock', description: 'Branch stock and transfers', icon: ArrowLeftRight },
    ],
  },
  {
    id: 'growth',
    title: 'Customers & Growth',
    subtitle: 'Rewards, offers and marketing',
    items: [
      { id: 'customers', label: 'Customers & Rewards', description: 'Customers and repeat orders', icon: Users },
      { id: 'discounts', label: 'Discounts', description: 'Coupons and offers', icon: BadgePercent },
      { id: 'campaigns', label: 'Campaigns', description: 'Banner and countdown', icon: Megaphone },
      { id: 'reviews', label: 'Reviews', description: 'Customer feedback', icon: Star },
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
    items: [
      { id: 'staff', label: 'Staff', description: 'Staff permissions', icon: UserCog, badge: 'Core' },
      { id: 'permissions-review', label: 'Permissions Review', description: 'Role access audit', icon: ShieldCheck },
      { id: 'attendance', label: 'Attendance', description: 'Shifts and clock-in', icon: Clock },
      { id: 'shift-closing', label: 'Shift Closing', description: 'Cash drawer handover', icon: ClipboardCheck },
      { id: 'payroll', label: 'Payroll', description: 'Salary and payouts', icon: WalletCards },
      { id: 'printers', label: 'Printers', description: 'Receipts and KOT print', icon: Printer },
      { id: 'settings', label: 'Settings', description: 'Restaurant profile', icon: Settings, badge: 'Core' },
      { id: 'activity-logs', label: 'Activity Logs', description: 'Audit trail and changes', icon: History },
      { id: 'data-export', label: 'Data Export', description: 'CSV backup center', icon: Download },
      { id: 'data-import', label: 'Data Import', description: 'Bulk CSV upload center', icon: Upload },
      { id: 'branches', label: 'Branches', description: 'Locations and maps', icon: Building2 },
    ],
  },
  {
    id: 'launch_tools',
    title: 'Launch & More Tools',
    subtitle: 'QA, deploy and beta tools',
    items: [
      { id: 'onboarding', label: 'Onboarding', description: 'Launch setup wizard', icon: ClipboardCheck, badge: 'Launch' },
      { id: 'launch-qa', label: 'Launch QA', description: 'Production test checklist', icon: ClipboardCheck, badge: 'Launch' },
      { id: 'deployment-center', label: 'Deploy Center', description: 'SQL, functions and secrets', icon: Code2, badge: 'Launch' },
      { id: 'pwa-mobile', label: 'Mobile / PWA', description: 'Install, offline and print readiness', icon: LayoutGrid, badge: 'Launch' },
      { id: 'alerts', label: 'Alerts Center', description: 'Live action alerts', icon: CircleAlert },
      { id: 'notification-center', label: 'Reminder Center', description: 'Notification rules and reminders', icon: BellRing },
      { id: 'notification-providers', label: 'Notification Providers', description: 'Email, WhatsApp and push setup', icon: Send, badge: 'Beta' },
      { id: 'offline-pos', label: 'Offline POS Queue', description: 'Draft orders before sync', icon: WifiOff, badge: 'Beta' },
      { id: 'refund-automation', label: 'Refund Automation', description: 'Gateway refund readiness', icon: RotateCcw, badge: 'Beta' },
      { id: 'tax-invoice-center', label: 'Tax Invoice Center', description: 'VAT invoice records and preview', icon: FileText, badge: 'Beta' },
      { id: 'vat-statutory', label: 'VAT Statutory', description: 'TRN, VAT boxes and filing pack', icon: ClipboardCheck, badge: 'Beta' },
      { id: 'advanced-reports', label: 'Advanced Reports', description: 'Product, table and gateway reports', icon: BarChart3, badge: 'Beta' },
    ],
  },
]

const defaultOpenGroups = ['daily', 'menu_qr', 'finance_reports']

function getStoredOpenGroups() {
  if (typeof window === 'undefined') return defaultOpenGroups

  try {
    const raw = window.localStorage.getItem(SIDEBAR_OPEN_GROUPS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultOpenGroups
  } catch {
    return defaultOpenGroups
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
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState(() => getStoredOpenGroups())

  const launchVisibleSections = getLaunchVisibleSections(allowedSections)
  const launchModeLabel = getSpizyLaunchModeLabel()
  const keyword = search.trim().toLowerCase()

  const visibleNavGroups = useMemo(() => {
    return restaurantNavGroups
      .map((group) => {
        const allowedItems = group.items.filter((item) =>
          launchVisibleSections.length === 0
            ? true
            : launchVisibleSections.includes(item.id),
        )

        const searchedItems = !keyword
          ? allowedItems
          : allowedItems.filter((item) =>
              [item.label, item.description, group.title, group.subtitle]
                .join(' ')
                .toLowerCase()
                .includes(keyword),
            )

        return {
          ...group,
          items: searchedItems,
          totalCount: allowedItems.length,
        }
      })
      .filter((group) => group.items.length > 0)
  }, [keyword, launchVisibleSections])

  const activeGroupId = useMemo(() => {
    return restaurantNavGroups.find((group) =>
      group.items.some((item) => item.id === activeSection),
    )?.id
  }, [activeSection])

  useEffect(() => {
    if (!activeGroupId) return

    setOpenGroups((current) => {
      if (current.includes(activeGroupId)) return current
      return [...current, activeGroupId]
    })
  }, [activeGroupId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_OPEN_GROUPS_KEY, JSON.stringify(openGroups))
  }, [openGroups])

  useEffect(() => {
    const node = scrollRef.current
    if (!node || typeof window === 'undefined') return undefined

    const savedScrollTop = Number(window.localStorage.getItem(SIDEBAR_SCROLL_KEY) || 0)
    if (savedScrollTop > 0) {
      window.requestAnimationFrame(() => {
        node.scrollTop = savedScrollTop
      })
    }

    const saveScroll = () => {
      window.localStorage.setItem(SIDEBAR_SCROLL_KEY, String(node.scrollTop || 0))
    }

    node.addEventListener('scroll', saveScroll, { passive: true })
    return () => node.removeEventListener('scroll', saveScroll)
  }, [])

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  const toggleGroup = (groupId) => {
    setOpenGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    )
  }

  const isLaunchSafeMode = launchModeLabel === 'Launch-safe mode active'

  return (
    <aside className="restaurant-sidebar spizy-premium-sidebar">
      <div className="spizy-sidebar-brand-card">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div className="spizy-sidebar-restaurant-copy">
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <label className="spizy-sidebar-search">
        <Search size={16} />
        <input
          type="search"
          value={search}
          placeholder="Search menu..."
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <nav className="restaurant-nav spizy-sidebar-scroll" ref={scrollRef}>
        {visibleNavGroups.length === 0 ? (
          <div className="spizy-sidebar-empty">No menu items found.</div>
        ) : (
          visibleNavGroups.map((group) => {
            const isOpen = keyword || openGroups.includes(group.id)

            return (
              <section className="restaurant-nav-group spizy-sidebar-group" key={group.id}>
                <button
                  type="button"
                  className={`spizy-sidebar-group-toggle ${isOpen ? 'open' : ''}`}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={Boolean(isOpen)}
                >
                  <span className="spizy-sidebar-group-copy">
                    <strong>{group.title}</strong>
                    <small>{group.subtitle}</small>
                  </span>

                  <span className="spizy-sidebar-group-actions">
                    <span className="spizy-sidebar-count">{group.totalCount}</span>
                    <ChevronDown size={16} />
                  </span>
                </button>

                {isOpen && (
                  <div className="spizy-sidebar-items">
                    {group.items.map((item) => {
                      const Icon = item.icon || Store
                      const isActive = activeSection === item.id

                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`restaurant-nav-button spizy-sidebar-item ${isActive ? 'active' : ''}`}
                          onClick={() => onSectionChange(item.id)}
                        >
                          <span className="spizy-sidebar-item-icon">
                            <Icon size={18} />
                          </span>

                          <span className="spizy-sidebar-item-copy">
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>

                          {item.badge && (
                            <span className={`spizy-sidebar-badge ${item.badge.toLowerCase()}`}>
                              {item.badge}
                            </span>
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

      {isLaunchSafeMode && (
        <div className="restaurant-staff-mode-box spizy-sidebar-note launch">
          <strong>Launch-safe mode</strong>
          <span>Beta tools hidden for tomorrow’s launch.</span>
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

export default RestaurantSidebar
