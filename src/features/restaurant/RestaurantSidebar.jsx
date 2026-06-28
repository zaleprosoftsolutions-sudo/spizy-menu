import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeftRight,
  Award,
  BadgePercent,
  BarChart3,
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

const storagePrefix = 'spizy_restaurant_sidebar_v2'

const restaurantNavGroups = [
  {
    id: 'daily',
    title: 'Daily Operations',
    subtitle: 'POS, orders and closing',
    defaultOpen: true,
    items: [
      {
        id: 'overview',
        label: 'Dashboard',
        description: 'Restaurant overview',
        icon: LayoutDashboard,
        priority: 'Core',
      },
      {
        id: 'pos',
        label: 'New Order / POS',
        description: 'Counter order screen',
        icon: ShoppingCart,
        priority: 'Core',
      },
      {
        id: 'orders',
        label: 'Orders',
        description: 'Table and delivery orders',
        icon: ReceiptText,
        priority: 'Core',
      },
      {
        id: 'kitchen',
        label: 'Kitchen Display',
        description: 'Live preparation board',
        icon: ChefHat,
        priority: 'Core',
      },
      {
        id: 'customer-payments',
        label: 'Customer Payments',
        description: 'COD and unpaid collections',
        icon: CircleDollarSign,
        priority: 'Core',
      },
      {
        id: 'day-closing',
        label: 'Day Closing',
        description: 'Cash drawer and Z report',
        icon: ClipboardCheck,
        priority: 'Core',
      },
    ],
  },
  {
    id: 'floor_delivery',
    title: 'Floor & Delivery',
    subtitle: 'Tables, dispatch and guest requests',
    defaultOpen: false,
    items: [
      {
        id: 'floor',
        label: 'Floor Plan',
        description: 'Live table status map',
        icon: LayoutGrid,
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
    id: 'menu_setup',
    title: 'Menu & QR Setup',
    subtitle: 'Products, QR and public menu',
    defaultOpen: true,
    items: [
      {
        id: 'onboarding',
        label: 'Onboarding',
        description: 'Launch setup wizard',
        icon: ClipboardCheck,
        priority: 'Launch',
      },
      {
        id: 'products',
        label: 'Products / Items',
        description: 'Categories, prices, stock, images',
        icon: Utensils,
        priority: 'Core',
      },
      {
        id: 'menu-schedule',
        label: 'Menu Schedule',
        description: 'Availability and happy hours',
        icon: Clock,
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
        priority: 'Core',
      },
      {
        id: 'nutrition-labels',
        label: 'Nutrition & Allergens',
        description: 'Dietary labels and warnings',
        icon: Tags,
      },
      {
        id: 'receipt-print',
        label: 'Receipt / KOT Print',
        description: 'Thermal receipt and kitchen tickets',
        icon: Printer,
        priority: 'Launch',
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance & Reports',
    subtitle: 'Cash, subscription and reports',
    defaultOpen: false,
    items: [
      {
        id: 'subscription-billing',
        label: 'Subscription',
        description: 'Mamo Pay billing',
        icon: CreditCard,
        priority: 'Launch',
      },
      {
        id: 'cash-bank',
        label: 'Cash & Bank',
        description: 'Accounts and money ledger',
        icon: Landmark,
        priority: 'Core',
      },
      {
        id: 'finance',
        label: 'Finance',
        description: 'Profit, dues and cash flow',
        icon: Calculator,
      },
      {
        id: 'expenses',
        label: 'Expenses',
        description: 'Bills, petty cash and costs',
        icon: WalletCards,
      },
      {
        id: 'reports',
        label: 'Reports',
        description: 'Sales analytics',
        icon: BarChart3,
        priority: 'Core',
      },
      {
        id: 'tax-invoices',
        label: 'Tax & Invoices',
        description: 'VAT/GST and invoice print',
        icon: FileText,
      },
      {
        id: 'tax-invoice-center',
        label: 'Tax Invoice Center',
        description: 'VAT invoice records and preview',
        icon: FileText,
        priority: 'Beta',
      },
      {
        id: 'vat-statutory',
        label: 'VAT Statutory',
        description: 'TRN, VAT boxes and filing pack',
        icon: ClipboardCheck,
        priority: 'Beta',
      },
      {
        id: 'expense-reports',
        label: 'Expense Reports',
        description: 'Rent, salary and cost reports',
        icon: BarChart3,
        priority: 'Beta',
      },
      {
        id: 'advanced-reports',
        label: 'Advanced Reports',
        description: 'Product, table and gateway reports',
        icon: BarChart3,
        priority: 'Beta',
      },
    ],
  },
  {
    id: 'stock_costing',
    title: 'Stock & Costing',
    subtitle: 'Inventory, purchases and COGS',
    defaultOpen: false,
    items: [
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
        id: 'recipes',
        label: 'Recipes & Costing',
        description: 'Ingredients, cost and margin',
        icon: BookOpenCheck,
      },
      {
        id: 'cogs',
        label: 'COGS & Margin',
        description: 'Food cost and gross profit',
        icon: BarChart3,
        priority: 'Beta',
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
    ],
  },
  {
    id: 'growth',
    title: 'Customers & Growth',
    subtitle: 'CRM, offers and reviews',
    defaultOpen: false,
    items: [
      {
        id: 'customers',
        label: 'Customers & Rewards',
        description: 'Customers, points, repeat orders',
        icon: Users,
      },
      {
        id: 'loyalty-tiers',
        label: 'Loyalty Tiers',
        description: 'VIP tiers and membership',
        icon: Award,
      },
      {
        id: 'gift-vouchers',
        label: 'Gift Vouchers',
        description: 'Store credit and gift cards',
        icon: Gift,
      },
      {
        id: 'combo-deals',
        label: 'Combo Deals',
        description: 'Meal bundles and offers',
        icon: PackageCheck,
      },
      {
        id: 'crm',
        label: 'CRM Notes',
        description: 'Tags, notes and follow-ups',
        icon: MessageCircle,
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
        id: 'marketing',
        label: 'Marketing Broadcast',
        description: 'WhatsApp and customer messages',
        icon: MessageCircle,
      },
      {
        id: 'reviews',
        label: 'Reviews',
        description: 'Customer feedback',
        icon: Star,
      },
    ],
  },
  {
    id: 'admin',
    title: 'Team & Admin',
    subtitle: 'Staff, print and settings',
    defaultOpen: false,
    items: [
      {
        id: 'staff',
        label: 'Staff',
        description: 'Staff permissions',
        icon: UserCog,
        priority: 'Core',
      },
      {
        id: 'permissions-review',
        label: 'Permissions Review',
        description: 'Role access audit',
        icon: ShieldCheck,
      },
      {
        id: 'attendance',
        label: 'Attendance',
        description: 'Shifts and clock-in',
        icon: Clock,
      },
      {
        id: 'shift-closing',
        label: 'Shift Closing',
        description: 'Cash drawer handover',
        icon: ClipboardCheck,
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
        priority: 'Core',
      },
    ],
  },
  {
    id: 'launch_tools',
    title: 'Launch & More Tools',
    subtitle: 'QA, reminders and beta tools',
    defaultOpen: false,
    items: [
      {
        id: 'pwa-mobile',
        label: 'Mobile / PWA',
        description: 'Install, offline and print readiness',
        icon: LayoutGrid,
        priority: 'Launch',
      },
      {
        id: 'launch-qa',
        label: 'Launch QA',
        description: 'Production test checklist',
        icon: ClipboardCheck,
        priority: 'Launch',
      },
      {
        id: 'deployment-center',
        label: 'Deploy Center',
        description: 'SQL, functions and secrets',
        icon: Code2,
        priority: 'Launch',
      },
      {
        id: 'alerts',
        label: 'Alerts Center',
        description: 'Live action alerts',
        icon: CircleAlert,
      },
      {
        id: 'notification-center',
        label: 'Reminder Center',
        description: 'Notification rules and reminders',
        icon: BellRing,
      },
      {
        id: 'notification-providers',
        label: 'Notification Providers',
        description: 'Email, WhatsApp and push setup',
        icon: Send,
        priority: 'Beta',
      },
      {
        id: 'offline-pos',
        label: 'Offline POS Queue',
        description: 'Draft orders before sync',
        icon: WifiOff,
        priority: 'Beta',
      },
      {
        id: 'refund-automation',
        label: 'Refund Automation',
        description: 'Gateway refund readiness',
        icon: RotateCcw,
        priority: 'Beta',
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
  const navRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState(() =>
    getInitialExpandedGroups(restaurant?.id, activeSection),
  )

  const launchVisibleSections = useMemo(
    () => getLaunchVisibleSections(allowedSections),
    [allowedSections],
  )
  const launchModeLabel = getSpizyLaunchModeLabel()
  const storageKey = getSidebarStorageKey(restaurant?.id)

  const visibleNavGroups = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    const sourceSections = launchVisibleSections.length > 0 ? launchVisibleSections : []

    return restaurantNavGroups
      .map((group) => {
        const filteredItems = group.items.filter((item) => {
          const isAllowed =
            sourceSections.length === 0 ? true : sourceSections.includes(item.id)

          if (!isAllowed) return false
          if (!keyword) return true

          return [
            group.title,
            group.subtitle,
            item.label,
            item.description,
            item.priority,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword))
        })

        return {
          ...group,
          items: filteredItems,
        }
      })
      .filter((group) => group.items.length > 0)
  }, [launchVisibleSections, searchQuery])

  const activeGroupId = useMemo(() => {
    return visibleNavGroups.find((group) =>
      group.items.some((item) => item.id === activeSection),
    )?.id
  }, [activeSection, visibleNavGroups])

  useEffect(() => {
    if (!activeGroupId) return

    setExpandedGroups((current) => {
      if (current[activeGroupId]) return current

      return {
        ...current,
        [activeGroupId]: true,
      }
    })
  }, [activeGroupId])

  useEffect(() => {
    saveSidebarExpandedGroups(storageKey, expandedGroups)
  }, [expandedGroups, storageKey])

  useEffect(() => {
    const node = navRef.current
    if (!node) return undefined

    const savedScroll = getSavedSidebarScroll(storageKey)

    const timer = window.setTimeout(() => {
      node.scrollTop = savedScroll
    }, 80)

    return () => window.clearTimeout(timer)
  }, [storageKey])

  const handleNavScroll = () => {
    if (!navRef.current) return

    saveSidebarScroll(storageKey, navRef.current.scrollTop)
  }

  const handleGroupToggle = (groupId) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  const handleSectionClick = (sectionId) => {
    if (navRef.current) {
      saveSidebarScroll(storageKey, navRef.current.scrollTop)
    }

    onSectionChange(sectionId)
  }

  const staffLabel = staffAccess?.isLimited
    ? staffAccess?.staff?.staff_name || 'Staff access'
    : restaurant?.subscription_status || 'trialing'

  return (
    <aside className="restaurant-sidebar spizy-sidebar-pro">
      <div className="restaurant-sidebar-head spizy-sidebar-head-pro">
        <div className="restaurant-avatar">
          {restaurant?.name?.slice(0, 2)?.toUpperCase() || 'SP'}
        </div>

        <div className="spizy-sidebar-brand-copy">
          <strong>{restaurant?.name || 'Restaurant'}</strong>
          <span>{staffLabel}</span>
        </div>
      </div>

      <div className="spizy-sidebar-search">
        <Search size={15} />
        <input
          type="search"
          value={searchQuery}
          placeholder="Search menu..."
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <nav
        ref={navRef}
        className="restaurant-nav spizy-sidebar-nav"
        onScroll={handleNavScroll}
      >
        {visibleNavGroups.map((group) => {
          const isExpanded = searchQuery.trim()
            ? true
            : expandedGroups[group.id] || group.defaultOpen || group.id === activeGroupId
          const activeCount = group.items.some((item) => item.id === activeSection)

          return (
            <div
              className={`restaurant-nav-group spizy-sidebar-group ${
                activeCount ? 'has-active' : ''
              }`}
              key={group.id}
            >
              <button
                type="button"
                className="spizy-sidebar-group-toggle"
                onClick={() => handleGroupToggle(group.id)}
                aria-expanded={isExpanded}
              >
                <span>
                  <strong>{group.title}</strong>
                  <small>{group.subtitle}</small>
                </span>

                <div>
                  <em>{group.items.length}</em>
                  <ChevronDown size={15} className={isExpanded ? 'open' : ''} />
                </div>
              </button>

              {isExpanded && (
                <div className="spizy-sidebar-group-items">
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
                        onClick={() => handleSectionClick(item.id)}
                      >
                        <span className="spizy-sidebar-item-icon">
                          <Icon size={17} />
                        </span>

                        <span className="spizy-sidebar-item-copy">
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>

                        {item.priority && (
                          <span className={`spizy-sidebar-priority ${item.priority.toLowerCase()}`}>
                            {item.priority}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {visibleNavGroups.length === 0 && (
          <div className="spizy-sidebar-empty">
            <strong>No menu found</strong>
            <span>Try a different search keyword.</span>
          </div>
        )}
      </nav>

      {staffAccess?.isLimited && (
        <div className="restaurant-staff-mode-box spizy-sidebar-mode-box">
          <strong>{staffAccess.staff?.staff_role || 'Staff mode'}</strong>
          <span>Only permitted modules are shown.</span>
        </div>
      )}

      {launchModeLabel === 'Launch-safe mode active' && (
        <div className="restaurant-staff-mode-box spizy-sidebar-mode-box launch">
          <strong>Launch-safe mode</strong>
          <span>Beta/foundation tools hidden for tomorrow's launch.</span>
        </div>
      )}

      <div className="restaurant-sidebar-foot spizy-sidebar-foot-pro">
        <Store size={16} />
        <span>Spizy restaurant OS</span>
        <Tags size={16} />
      </div>
    </aside>
  )
}

function getSidebarStorageKey(restaurantId) {
  return `${storagePrefix}_${restaurantId || 'default'}`
}

function getInitialExpandedGroups(restaurantId, activeSection) {
  const storageKey = getSidebarStorageKey(restaurantId)
  const savedGroups = readStoredJson(`${storageKey}_groups`, null)

  if (savedGroups && typeof savedGroups === 'object') {
    return {
      ...savedGroups,
      ...getActiveGroupState(activeSection),
    }
  }

  return restaurantNavGroups.reduce((groups, group) => {
    groups[group.id] = group.defaultOpen || group.items.some((item) => item.id === activeSection)
    return groups
  }, {})
}

function getActiveGroupState(activeSection) {
  if (!activeSection) return {}

  const activeGroup = restaurantNavGroups.find((group) =>
    group.items.some((item) => item.id === activeSection),
  )

  return activeGroup ? { [activeGroup.id]: true } : {}
}

function saveSidebarExpandedGroups(storageKey, groups) {
  writeStoredJson(`${storageKey}_groups`, groups)
}

function getSavedSidebarScroll(storageKey) {
  const value = Number(readStoredValue(`${storageKey}_scroll`, '0'))

  return Number.isFinite(value) ? value : 0
}

function saveSidebarScroll(storageKey, scrollTop) {
  writeStoredValue(`${storageKey}_scroll`, String(Math.max(0, Number(scrollTop || 0))))
}

function readStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeStoredJson(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore private browsing / storage-disabled environments.
  }
}

function readStoredValue(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeStoredValue(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore private browsing / storage-disabled environments.
  }
}

export default RestaurantSidebar
