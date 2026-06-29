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
  X,
} from 'lucide-react'
import { getLaunchVisibleSections, getSpizyLaunchModeLabel } from './launchMode'
import './RestaurantSidebar.css'

const STORAGE_OPEN_GROUPS = 'spizy.restaurant.sidebar.openGroups.v5'
const STORAGE_SCROLL_TOP = 'spizy.restaurant.sidebar.scrollTop.v5'

const restaurantNavGroups = [
  {
    id: 'daily',
    title: 'Daily Operations',
    subtitle: 'Orders, POS and closing',
    defaultOpen: true,
    items: [
      { id: 'overview', label: 'Dashboard', description: 'Restaurant overview', icon: LayoutDashboard, tag: 'Core' },
      { id: 'subscription-billing', label: 'Subscription & Plans', description: 'Trial, Mamo Pay and upgrades', icon: CreditCard, tag: 'Billing' },
      { id: 'pos', label: 'New Order / POS', description: 'Counter order screen', icon: ShoppingCart, tag: 'Core' },
      { id: 'orders', label: 'Orders', description: 'Table and delivery orders', icon: ReceiptText, tag: 'Core' },
      { id: 'kitchen', label: 'Kitchen Display', description: 'Live preparation board', icon: ChefHat, tag: 'Core' },
      { id: 'customer-payments', label: 'Customer Payments', description: 'COD and unpaid collections', icon: CircleDollarSign, tag: 'Core' },
      { id: 'day-closing', label: 'Day Closing', description: 'Cash drawer and Z report', icon: ClipboardCheck, tag: 'Core' },
    ],
  },
  {
    id: 'floor_delivery',
    title: 'Floor & Delivery',
    subtitle: 'Tables, delivery and requests',
    defaultOpen: false,
    items: [
      { id: 'floor', label: 'Floor Plan', description: 'Live table status map', icon: LayoutGrid, tag: 'Core' },
      { id: 'delivery', label: 'Delivery', description: 'Dispatch and COD tracking', icon: Truck, tag: 'Core' },
      { id: 'delivery-zones', label: 'Delivery Zones', description: 'Area fees and minimum orders', icon: MapPin, tag: 'Core' },
      { id: 'reservations', label: 'Reservations', description: 'Bookings and table holds', icon: CalendarCheck, tag: 'Core' },
      { id: 'service-requests', label: 'Service Requests', description: 'Table calls and guest help', icon: BellRing, tag: 'Core' },
    ],
  },
  {
    id: 'menu_qr',
    title: 'Menu & QR Setup',
    subtitle: 'Products, menu and tables',
    defaultOpen: false,
    items: [
      { id: 'products', label: 'Products / Items', description: 'Categories, prices and images', icon: Utensils, tag: 'Core' },
      { id: 'qr', label: 'Tables & QR', description: 'Live QR menus', icon: QrCode, tag: 'Core' },
      { id: 'menu-schedule', label: 'Menu Schedule', description: 'Availability and happy hours', icon: Clock, tag: 'Core' },
      { id: 'nutrition-labels', label: 'Nutrition & Allergens', description: 'Dietary labels and warnings', icon: Tags, tag: 'Core' },
      { id: 'modifiers', label: 'Modifiers & Add-ons', description: 'Toppings, sauces and choices', icon: ListPlus, tag: 'Core' },
    ],
  },
  {
    id: 'finance_reports',
    title: 'Finance & Reports',
    subtitle: 'Money, reports and billing',
    defaultOpen: false,
    items: [
      { id: 'cash-bank', label: 'Cash & Bank', description: 'Accounts and money ledger', icon: Landmark, tag: 'Core' },
      { id: 'finance', label: 'Finance', description: 'Profit, dues and cash flow', icon: CalculatorIcon, tag: 'Core' },
      { id: 'expenses', label: 'Expenses', description: 'Bills, petty cash and costs', icon: WalletCards, tag: 'Core' },
      { id: 'reports', label: 'Reports', description: 'Sales analytics', icon: BarChart3, tag: 'Core' },
      { id: 'tax-invoices', label: 'Tax & Invoices', description: 'VAT/GST and invoice print', icon: FileText, tag: 'Core' },
      { id: 'receipt-print', label: 'Receipt / KOT Print', description: 'Thermal receipt and tickets', icon: Printer, tag: 'Core' },
    ],
  },
  {
    id: 'stock_costing',
    title: 'Stock & Costing',
    subtitle: 'Inventory and purchases',
    defaultOpen: false,
    items: [
      { id: 'inventory', label: 'Inventory', description: 'Stock, low stock and wastage', icon: Archive, tag: 'Core' },
      { id: 'branch-stock', label: 'Branch Stock', description: 'Branch stock and transfers', icon: ArrowLeftRight, tag: 'Core' },
      { id: 'recipes', label: 'Recipes & Costing', description: 'Ingredients, cost and margin', icon: BookOpenCheck, tag: 'Core' },
      { id: 'purchases', label: 'Purchases', description: 'Suppliers, bills and stock-in', icon: PackageCheck, tag: 'Core' },
      { id: 'supplier-payments', label: 'Supplier Payments', description: 'Pay supplier dues and advances', icon: HandCoins, tag: 'Core' },
      { id: 'cogs', label: 'COGS & Margin', description: 'Food cost and gross profit', icon: BarChart3, tag: 'Beta' },
    ],
  },
  {
    id: 'growth',
    title: 'Customers & Growth',
    subtitle: 'Customers and marketing',
    defaultOpen: false,
    items: [
      { id: 'customers', label: 'Customers & Rewards', description: 'Customers, points and repeats', icon: Users, tag: 'Core' },
      { id: 'loyalty-tiers', label: 'Loyalty Tiers', description: 'VIP tiers and membership', icon: Award, tag: 'Core' },
      { id: 'gift-vouchers', label: 'Gift Vouchers', description: 'Store credit and gift cards', icon: Gift, tag: 'Core' },
      { id: 'combo-deals', label: 'Combo Deals', description: 'Meal bundles and offers', icon: PackageCheck, tag: 'Core' },
      { id: 'crm', label: 'CRM Notes', description: 'Tags, notes and follow-ups', icon: MessageCircle, tag: 'Core' },
      { id: 'discounts', label: 'Discounts', description: 'Coupons and offers', icon: BadgePercent, tag: 'Core' },
      { id: 'campaigns', label: 'Campaigns', description: 'Banner and countdown', icon: Megaphone, tag: 'Core' },
      { id: 'marketing', label: 'Marketing Broadcast', description: 'WhatsApp and customer messages', icon: MessageCircle, tag: 'Core' },
      { id: 'reviews', label: 'Reviews', description: 'Customer feedback', icon: Star, tag: 'Core' },
    ],
  },
  {
    id: 'admin',
    title: 'Team & Admin',
    subtitle: 'Staff, printers and settings',
    defaultOpen: false,
    items: [
      { id: 'staff', label: 'Staff', description: 'Staff permissions', icon: UserCog, tag: 'Core' },
      { id: 'permissions-review', label: 'Permissions Review', description: 'Role access audit', icon: ShieldCheck, tag: 'Core' },
      { id: 'attendance', label: 'Attendance', description: 'Shifts and clock-in', icon: Clock, tag: 'Core' },
      { id: 'shift-closing', label: 'Shift Closing', description: 'Cash drawer handover', icon: ClipboardCheck, tag: 'Core' },
      { id: 'payroll', label: 'Payroll', description: 'Salary and payouts', icon: WalletCards, tag: 'Core' },
      { id: 'printers', label: 'Printers', description: 'Receipts and KOT print', icon: Printer, tag: 'Core' },
      { id: 'data-export', label: 'Data Export', description: 'CSV backup center', icon: Download, tag: 'Core' },
      { id: 'data-import', label: 'Data Import', description: 'Bulk CSV upload center', icon: Upload, tag: 'Core' },
      { id: 'activity-logs', label: 'Activity Logs', description: 'Audit trail and changes', icon: History, tag: 'Core' },
      { id: 'branches', label: 'Branches', description: 'Locations and maps', icon: Building2, tag: 'Core' },
      { id: 'settings', label: 'Settings', description: 'Restaurant profile', icon: Settings, tag: 'Core' },
    ],
  },
  {
    id: 'launch_more',
    title: 'Launch & More Tools',
    subtitle: 'QA, deploy and beta tools',
    defaultOpen: false,
    items: [
      { id: 'onboarding', label: 'Onboarding', description: 'Launch setup wizard', icon: ClipboardCheck, tag: 'Core' },
      { id: 'pwa-mobile', label: 'Mobile / PWA', description: 'Install, offline and print readiness', icon: LayoutGrid, tag: 'Core' },
      { id: 'launch-qa', label: 'Launch QA', description: 'Production test checklist', icon: ClipboardCheck, tag: 'Core' },
      { id: 'deployment-center', label: 'Deploy Center', description: 'SQL, functions and secrets', icon: Code2, tag: 'Core' },
      { id: 'alerts', label: 'Alerts Center', description: 'Live action alerts', icon: CircleAlert, tag: 'Core' },
      { id: 'notification-center', label: 'Reminder Center', description: 'Notification rules and reminders', icon: BellRing, tag: 'Core' },
      { id: 'notification-providers', label: 'Notification Providers', description: 'Email, WhatsApp and push setup', icon: Send, tag: 'Beta' },
      { id: 'offline-pos', label: 'Offline POS Queue', description: 'Draft orders before sync', icon: WifiOff, tag: 'Beta' },
      { id: 'refund-automation', label: 'Refund Automation', description: 'Gateway refund readiness', icon: RotateCcw, tag: 'Beta' },
      { id: 'expense-reports', label: 'Expense Reports', description: 'Rent, salary and cost reports', icon: BarChart3, tag: 'Beta' },
      { id: 'tax-invoice-center', label: 'Tax Invoice Center', description: 'VAT invoice records and preview', icon: FileText, tag: 'Beta' },
      { id: 'vat-statutory', label: 'VAT Statutory', description: 'TRN, VAT boxes and filing pack', icon: ClipboardCheck, tag: 'Beta' },
      { id: 'advanced-reports', label: 'Advanced Reports', description: 'Product, table and gateway reports', icon: BarChart3, tag: 'Beta' },
    ],
  },
]

function CalculatorIcon(props) {
  return <BarChart3 {...props} />
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
  const [openGroups, setOpenGroups] = useState(() => getInitialOpenGroups(activeSection))

  const visibleSections = useMemo(
    () => getLaunchVisibleSections(allowedSections),
    [allowedSections],
  )
  const visibleSectionSet = useMemo(() => new Set(visibleSections), [visibleSections])
  const launchModeLabel = getSpizyLaunchModeLabel()

  const filteredGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return restaurantNavGroups
      .map((group) => {
        const items = group.items.filter((item) => {
          if (!visibleSectionSet.has(item.id)) return false
          if (!keyword) return true

          return [item.label, item.description, group.title, group.subtitle]
            .some((value) => String(value || '').toLowerCase().includes(keyword))
        })

        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
  }, [search, visibleSectionSet])

  useEffect(() => {
    const activeGroup = restaurantNavGroups.find((group) =>
      group.items.some((item) => item.id === activeSection),
    )

    if (!activeGroup) return

    setOpenGroups((current) => ({ ...current, [activeGroup.id]: true }))
  }, [activeSection])

  useEffect(() => {
    if (!search.trim()) return

    setOpenGroups((current) => {
      const next = { ...current }
      filteredGroups.forEach((group) => {
        next[group.id] = true
      })
      return next
    })
  }, [filteredGroups, search])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_OPEN_GROUPS, JSON.stringify(openGroups))
  }, [openGroups])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined

    const savedScroll = Number(window.localStorage.getItem(STORAGE_SCROLL_TOP) || 0)
    if (savedScroll > 0) element.scrollTop = savedScroll

    const handleScroll = () => {
      window.localStorage.setItem(STORAGE_SCROLL_TOP, String(element.scrollTop || 0))
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [])

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  const toggleGroup = (groupId) => {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

  return (
    <aside className="restaurant-sidebar pro-restaurant-sidebar">
      <div className="restaurant-sidebar-head pro-sidebar-head">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div>
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <div className="pro-sidebar-search">
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search menu..."
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </div>

      <nav className="restaurant-nav pro-sidebar-scroll" ref={scrollRef}>
        {filteredGroups.map((group) => {
          const isOpen = openGroups[group.id] !== false
          const isActiveGroup = group.items.some((item) => item.id === activeSection)

          return (
            <div className={`restaurant-nav-group pro-nav-group ${isActiveGroup ? 'active-group' : ''}`} key={group.id}>
              <button
                type="button"
                className="pro-nav-group-button"
                onClick={() => toggleGroup(group.id)}
              >
                <span>
                  <strong>{group.title}</strong>
                  <small>{group.subtitle}</small>
                </span>
                <em>{group.items.length}</em>
                <b>{isOpen ? '⌃' : '⌄'}</b>
              </button>

              {isOpen && (
                <div className="pro-nav-items">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeSection === item.id
                    const tagTone = String(item.tag || '').toLowerCase()

                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`restaurant-nav-button pro-nav-button ${isActive ? 'active' : ''}`}
                        onClick={() => onSectionChange(item.id)}
                      >
                        <div className="pro-nav-icon"><Icon size={18} /></div>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        {item.tag && <i className={`pro-nav-tag ${tagTone}`}>{item.tag}</i>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {filteredGroups.length === 0 && (
          <div className="pro-sidebar-empty">No menu found for “{search}”.</div>
        )}
      </nav>

      {staffAccess?.isLimited && (
        <div className="restaurant-staff-mode-box pro-mini-sidebar-note">
          <strong>{staffAccess.staff?.staff_role || 'Staff mode'}</strong>
          <span>Only permitted modules are shown.</span>
        </div>
      )}

      <div className="restaurant-sidebar-foot pro-sidebar-foot">
        <Store size={16} />
        <span>Spizy restaurant OS</span>
        {launchModeLabel === 'Launch-safe mode active' && <small>Launch</small>}
        <Tags size={16} />
      </div>
    </aside>
  )
}

function getInitialOpenGroups(activeSection) {
  const saved = parseSavedOpenGroups()
  const hasSaved = saved && Object.keys(saved).length > 0

  if (hasSaved) return saved

  const next = restaurantNavGroups.reduce((acc, group) => {
    acc[group.id] = group.defaultOpen === true
    return acc
  }, {})

  const activeGroup = restaurantNavGroups.find((group) =>
    group.items.some((item) => item.id === activeSection),
  )
  if (activeGroup) next[activeGroup.id] = true

  return next
}

function parseSavedOpenGroups() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_OPEN_GROUPS) || '{}')
  } catch {
    return {}
  }
}

export default RestaurantSidebar
