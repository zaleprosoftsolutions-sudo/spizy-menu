import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Download,
  ExternalLink,
  Printer,
  QrCode,
  RefreshCw,
  Store,
  Utensils,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './LaunchQAReadinessManagement.css'

const manualQaItems = [
  {
    id: 'mobile_owner_dashboard',
    title: 'Mobile owner dashboard checked',
    description: 'Open the owner dashboard on a real phone and confirm sidebar, cards and quick actions are usable.',
    section: 'overview',
  },
  {
    id: 'pwa_install',
    title: 'PWA install / Add to Home Screen tested',
    description: 'Install from mobile browser and reopen Spizy as an app-like experience.',
    section: 'pwa-mobile',
  },
  {
    id: 'pos_counter_order',
    title: 'Counter POS test order completed',
    description: 'Create one counter order from POS, verify order total and order status.',
    section: 'pos',
  },
  {
    id: 'qr_table_order',
    title: 'QR table order simulation completed',
    description: 'Scan table QR, place a dine-in order, and confirm the owner Orders page receives it.',
    section: 'qr',
  },
  {
    id: 'customer_bill_request',
    title: 'Customer bill completion request tested',
    description: 'From public menu orders, request bill/completion and confirm the restaurant owner sees it.',
    section: 'orders',
  },
  {
    id: 'payment_result_flow',
    title: 'Payment result page tested',
    description: 'Test success/failure return page for one online payment link or payment snapshot.',
    section: 'orders',
  },
  {
    id: 'receipt_kot_print',
    title: 'Receipt / KOT print tested',
    description: 'Print one receipt and one kitchen order ticket using the actual target printer/browser.',
    section: 'printers',
  },
  {
    id: 'day_closing_full',
    title: 'Day Closing full workflow tested',
    description: 'Create payment snapshot, close day, print Z report, and post to Cash & Bank.',
    section: 'day-closing',
  },
  {
    id: 'shift_closing_full',
    title: 'Staff Shift Closing tested',
    description: 'Open/close a cashier or waiter shift and verify variance and handover notes.',
    section: 'shift-closing',
  },
  {
    id: 'reports_review',
    title: 'Reports reviewed by owner',
    description: 'Check Advanced Reports, Expense Reports, COGS, Cash & Bank and VAT screens for expected totals.',
    section: 'advanced-reports',
  },
  {
    id: 'poor_network_test',
    title: 'Poor network behavior tested',
    description: 'Test how POS/public menu behaves when internet is slow or interrupted.',
    section: 'pwa-mobile',
  },
  {
    id: 'staff_role_test',
    title: 'Staff role permissions tested',
    description: 'Login as one limited staff user and confirm only allowed modules are visible.',
    section: 'permissions-review',
  },
]

function LaunchQAReadinessManagement({ restaurant, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [checks, setChecks] = useState(null)
  const [errors, setErrors] = useState([])
  const [manualState, setManualState] = useState(() =>
    loadManualQaState(restaurant?.id),
  )

  const storageKey = useMemo(
    () => getManualQaStorageKey(restaurant?.id),
    [restaurant?.id],
  )

  useEffect(() => {
    setManualState(loadManualQaState(restaurant?.id))
  }, [restaurant?.id])

  const loadLaunchQA = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurant?.id) return

      if (silent) setRefreshing(true)
      else setLoading(true)

      const todayKey = getTodayInputDate()
      const currentMonth = todayKey.slice(0, 7)
      const results = {}
      const nextErrors = []

      const countTable = async (key, table, buildQuery) => {
        try {
          let query = supabase
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', restaurant.id)

          if (typeof buildQuery === 'function') {
            query = buildQuery(query)
          }

          const { count, error } = await query

          if (error) {
            if (error.code !== '42P01') nextErrors.push(`${key}: ${error.message}`)
            results[key] = 0
            return
          }

          results[key] = Number(count || 0)
        } catch (error) {
          nextErrors.push(`${key}: ${error?.message || 'Unable to read data'}`)
          results[key] = 0
        }
      }

      await Promise.all([
        countTable('qrTables', 'restaurant_tables', (query) =>
          query.eq('is_active', true),
        ),
        countTable('menuItems', 'menu_items', (query) =>
          query.eq('is_deleted', false).eq('is_available', true),
        ),
        countTable('financeAccounts', 'restaurant_finance_accounts', (query) =>
          query.eq('is_active', true),
        ),
        countTable('staff', 'restaurant_staffs', (query) =>
          query.eq('is_deleted', false).eq('is_active', true),
        ),
        countTable('ordersToday', 'restaurant_orders', (query) =>
          query.gte('created_at', `${todayKey}T00:00:00`).lt('created_at', `${todayKey}T23:59:59`),
        ),
        countTable('dayClosing', 'restaurant_day_closings', (query) =>
          query.eq('closing_date', todayKey).eq('status', 'closed'),
        ),
        countTable('dailySummary', 'restaurant_daily_finance_summaries', (query) =>
          query.eq('summary_date', todayKey),
        ),
        countTable('shiftClosings', 'restaurant_staff_shift_closings', (query) =>
          query.eq('shift_date', todayKey),
        ),
        countTable('recipeCosts', 'restaurant_recipe_cost_items'),
        countTable('notificationRules', 'restaurant_notification_rules', (query) =>
          query.eq('is_active', true),
        ),
        countTable('vatPeriods', 'restaurant_vat_filing_periods', (query) =>
          query.eq('period_key', currentMonth),
        ),
        countTable('refundAttempts', 'restaurant_gateway_refund_attempts'),
      ])

      setChecks({
        ...results,
        todayKey,
        currentMonth,
        publicMenuUrl: getPublicMenuUrl(restaurant),
        hasProfile: Boolean(restaurant?.name && restaurant?.slug && restaurant?.currency),
        hasContact: Boolean(restaurant?.phone || restaurant?.whatsapp_phone),
        hasTaxBase: Number(restaurant?.tax_rate || 0) >= 0,
        hasTrn: Boolean(restaurant?.trn || restaurant?.tax_registration_number || restaurant?.vat_trn),
        hasPaymentMethod: hasAnyPaymentMethod(restaurant),
        hasOnlineGatewayConfigured: hasAnyRestaurantOwnedGatewayEnabled(restaurant),
        subscriptionActive: isSubscriptionActive(restaurant),
      })
      setErrors(nextErrors)
      setLoading(false)
      setRefreshing(false)
    },
    [restaurant],
  )

  useEffect(() => {
    loadLaunchQA()
  }, [loadLaunchQA])

  const autoChecklist = useMemo(
    () => buildAutomaticChecklist({ restaurant, checks }),
    [checks, restaurant],
  )

  const manualChecklist = useMemo(
    () =>
      manualQaItems.map((item) => ({
        ...item,
        done: Boolean(manualState[item.id]),
      })),
    [manualState],
  )

  const readiness = useMemo(
    () => buildLaunchReadiness({ autoChecklist, manualChecklist }),
    [autoChecklist, manualChecklist],
  )

  const toggleManualItem = (id) => {
    setManualState((current) => {
      const next = {
        ...current,
        [id]: !current[id],
      }

      saveManualQaState(storageKey, next)
      return next
    })
  }

  const resetManualChecklist = () => {
    saveManualQaState(storageKey, {})
    setManualState({})
  }

  const exportCsv = () => {
    const rows = [
      ['Type', 'Status', 'Title', 'Description'],
      ...autoChecklist.map((item) => [
        'Auto',
        item.done ? 'Pass' : 'Needs action',
        item.title,
        item.description,
      ]),
      ...manualChecklist.map((item) => [
        'Manual',
        item.done ? 'Done' : 'Pending',
        item.title,
        item.description,
      ]),
    ]

    downloadCsv(
      `spizy-launch-qa-${restaurant?.slug || restaurant?.id || 'restaurant'}.csv`,
      rows,
    )
  }

  return (
    <section className="launch-qa-shell">
      <div className="launch-qa-hero">
        <div>
          <p className="pricing-label">Production QA</p>
          <h1>Launch QA & Restaurant Simulation</h1>
          <p>
            Run the complete real-world checklist before going live: onboarding,
            QR ordering, POS, customer bill completion, payments, shift closing,
            day closing, finance, VAT, reports and mobile readiness.
          </p>
        </div>

        <div className={`launch-qa-score ${getReadinessTone(readiness.score)}`}>
          <span>Launch Readiness</span>
          <strong>{readiness.score}%</strong>
          <small>{readiness.doneCount}/{readiness.totalCount} checks completed</small>
        </div>
      </div>

      <div className="launch-qa-toolbar">
        <button
          type="button"
          className="launch-qa-action primary"
          onClick={() => loadLaunchQA({ silent: true })}
          disabled={refreshing}
        >
          <RefreshCw size={16} />
          {refreshing ? 'Refreshing...' : 'Refresh checks'}
        </button>
        <button type="button" className="launch-qa-action" onClick={() => window.print()}>
          <Printer size={16} />
          Print QA report
        </button>
        <button type="button" className="launch-qa-action" onClick={exportCsv}>
          <Download size={16} />
          Export CSV
        </button>
        <button type="button" className="launch-qa-action danger" onClick={resetManualChecklist}>
          <XCircle size={16} />
          Reset manual checks
        </button>
      </div>

      {errors.length > 0 && (
        <div className="launch-qa-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Some optional QA data could not be loaded</strong>
            <span>{errors.join(' • ')}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="launch-qa-loading">
          <RefreshCw size={20} />
          Loading production readiness checks...
        </div>
      ) : (
        <>
          <div className="launch-qa-kpi-grid">
            <LaunchQAKpi
              icon={<Store size={20} />}
              label="Public Profile"
              value={checks?.hasProfile ? 'Ready' : 'Needs setup'}
              tone={checks?.hasProfile ? 'good' : 'warning'}
            />
            <LaunchQAKpi
              icon={<QrCode size={20} />}
              label="Active QR Tables"
              value={String(checks?.qrTables || 0)}
              tone={(checks?.qrTables || 0) > 0 ? 'good' : 'warning'}
            />
            <LaunchQAKpi
              icon={<Utensils size={20} />}
              label="Menu Items"
              value={String(checks?.menuItems || 0)}
              tone={(checks?.menuItems || 0) > 0 ? 'good' : 'warning'}
            />
            <LaunchQAKpi
              icon={<WalletCards size={20} />}
              label="Finance Accounts"
              value={String(checks?.financeAccounts || 0)}
              tone={(checks?.financeAccounts || 0) >= 3 ? 'good' : 'warning'}
            />
            <LaunchQAKpi
              icon={<CreditCard size={20} />}
              label="Subscription"
              value={checks?.subscriptionActive ? 'Active' : 'Review'}
              tone={checks?.subscriptionActive ? 'good' : 'warning'}
            />
            <LaunchQAKpi
              icon={<ClipboardCheck size={20} />}
              label="Today Orders"
              value={String(checks?.ordersToday || 0)}
              tone={(checks?.ordersToday || 0) > 0 ? 'good' : 'neutral'}
            />
          </div>

          <div className="launch-qa-grid">
            <section className="launch-qa-panel">
              <PanelHead
                kicker="System Checks"
                title="Automatic readiness"
                text="These checks are calculated from current restaurant setup and live database records."
              />

              <div className="launch-qa-check-list">
                {autoChecklist.map((item) => (
                  <LaunchQACheckRow
                    key={item.id}
                    item={item}
                    actionLabel={item.actionLabel}
                    onAction={item.section ? () => onOpenSection(item.section) : undefined}
                  />
                ))}
              </div>
            </section>

            <section className="launch-qa-panel">
              <PanelHead
                kicker="Manual Device Test"
                title="Real restaurant simulation"
                text="Tick these only after testing on real devices, real browsers, and the actual restaurant workflow."
              />

              <div className="launch-qa-check-list manual">
                {manualChecklist.map((item) => (
                  <LaunchQAManualRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleManualItem(item.id)}
                    onOpenSection={onOpenSection}
                  />
                ))}
              </div>
            </section>
          </div>

          <section className="launch-qa-panel launch-qa-flow-panel">
            <PanelHead
              kicker="Recommended Final Test"
              title="One complete production simulation"
              text="Run this once for every new restaurant before giving them the live QR menu."
            />

            <div className="launch-qa-flow">
              {buildSimulationFlow().map((step, index) => (
                <button
                  key={step.section + step.title}
                  type="button"
                  className="launch-qa-flow-step"
                  onClick={() => onOpenSection(step.section)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.description}</small>
                  </div>
                  <ExternalLink size={15} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function LaunchQAKpi({ icon, label, value, tone = 'neutral' }) {
  return (
    <article className={`launch-qa-kpi ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function PanelHead({ kicker, title, text }) {
  return (
    <div className="launch-qa-panel-head">
      <div>
        <p className="pricing-label">{kicker}</p>
        <h2>{title}</h2>
        <span>{text}</span>
      </div>
    </div>
  )
}

function LaunchQACheckRow({ item, actionLabel, onAction }) {
  const Icon = item.done ? CheckCircle2 : AlertTriangle

  return (
    <article className={`launch-qa-check-row ${item.done ? 'done' : 'pending'}`}>
      <div className="launch-qa-check-icon">
        <Icon size={17} />
      </div>
      <div>
        <strong>{item.title}</strong>
        <span>{item.description}</span>
      </div>
      {onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel || 'Open'}
        </button>
      )}
    </article>
  )
}

function LaunchQAManualRow({ item, onToggle, onOpenSection }) {
  return (
    <article className={`launch-qa-manual-row ${item.done ? 'done' : ''}`}>
      <button type="button" className="launch-qa-toggle" onClick={onToggle}>
        {item.done ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </button>
      <div>
        <strong>{item.title}</strong>
        <span>{item.description}</span>
      </div>
      <button type="button" className="launch-qa-open-link" onClick={() => onOpenSection(item.section)}>
        Open
      </button>
    </article>
  )
}

function buildAutomaticChecklist({ restaurant, checks }) {
  if (!checks) return []

  return [
    {
      id: 'profile',
      done: checks.hasProfile && checks.hasContact,
      title: 'Restaurant public profile is ready',
      description: 'Name, slug, currency and contact details are available for public QR menu use.',
      section: 'settings',
      actionLabel: 'Open Settings',
    },
    {
      id: 'subscription',
      done: checks.subscriptionActive,
      title: 'Spizy subscription is active or trialing',
      description: 'Mamo Pay subscription status is active, paid, trialing or within grace period.',
      section: 'subscription-billing',
      actionLabel: 'Open Subscription',
    },
    {
      id: 'payment_methods',
      done: checks.hasPaymentMethod,
      title: 'Payment methods are enabled',
      description: 'At least one customer payment method is enabled for the restaurant.',
      section: 'settings',
      actionLabel: 'Review Payments',
    },
    {
      id: 'restaurant_owned_gateway',
      done: !restaurant?.accepts_online || checks.hasOnlineGatewayConfigured,
      title: 'Restaurant-owned online gateway readiness',
      description: 'If online payment is enabled, at least one restaurant-owned gateway should be connected/test-ready.',
      section: 'settings',
      actionLabel: 'Open Gateways',
    },
    {
      id: 'qr_tables',
      done: Number(checks.qrTables || 0) > 0,
      title: 'QR tables are created',
      description: `${checks.qrTables || 0} active QR table${checks.qrTables === 1 ? '' : 's'} found.`,
      section: 'qr',
      actionLabel: 'Open QR',
    },
    {
      id: 'menu_items',
      done: Number(checks.menuItems || 0) > 0,
      title: 'Menu items are available',
      description: `${checks.menuItems || 0} active menu item${checks.menuItems === 1 ? '' : 's'} found.`,
      section: 'products',
      actionLabel: 'Open Menu',
    },
    {
      id: 'finance_accounts',
      done: Number(checks.financeAccounts || 0) >= 3,
      title: 'Finance accounts are configured',
      description: 'Recommended cash, card and online gateway clearing accounts should exist.',
      section: 'cash-bank',
      actionLabel: 'Open Cash & Bank',
    },
    {
      id: 'staff',
      done: Number(checks.staff || 0) > 0,
      title: 'Staff access is prepared',
      description: `${checks.staff || 0} active staff profile${checks.staff === 1 ? '' : 's'} found.`,
      section: 'staff',
      actionLabel: 'Open Staff',
    },
    {
      id: 'notifications',
      done: Number(checks.notificationRules || 0) > 0,
      title: 'Reminder rules are available',
      description: 'Notification/reminder rules are configured for important owner actions.',
      section: 'notification-center',
      actionLabel: 'Open Reminders',
    },
    {
      id: 'vat',
      done: checks.hasTaxBase && (checks.hasTrn || Number(restaurant?.tax_rate || 0) === 0),
      title: 'VAT/tax base is reviewed',
      description: 'Tax rate and TRN/statutory settings should be reviewed before production billing.',
      section: 'vat-statutory',
      actionLabel: 'Open VAT',
    },
    {
      id: 'recipe_costs',
      done: Number(checks.recipeCosts || 0) > 0,
      title: 'Recipe/COGS setup has started',
      description: `${checks.recipeCosts || 0} recipe cost line${checks.recipeCosts === 1 ? '' : 's'} found.`,
      section: 'cogs',
      actionLabel: 'Open COGS',
    },
    {
      id: 'today_closing',
      done: Number(checks.dayClosing || 0) > 0 && Number(checks.dailySummary || 0) > 0,
      title: 'Day closing + daily summary test completed',
      description: 'For launch testing, close one day and create the Daily Finance Summary.',
      section: 'day-closing',
      actionLabel: 'Open Closing',
    },
  ]
}

function buildLaunchReadiness({ autoChecklist, manualChecklist }) {
  const allItems = [...autoChecklist, ...manualChecklist]
  const totalCount = allItems.length || 1
  const doneCount = allItems.filter((item) => item.done).length

  return {
    totalCount,
    doneCount,
    score: Math.round((doneCount / totalCount) * 100),
  }
}

function buildSimulationFlow() {
  return [
    { section: 'onboarding', title: 'Complete onboarding', description: 'Profile, finance, tables and starter menu.' },
    { section: 'products', title: 'Verify menu items', description: 'Categories, prices, images and availability.' },
    { section: 'qr', title: 'Scan table QR', description: 'Open public QR menu from a real phone.' },
    { section: 'orders', title: 'Place and receive order', description: 'Confirm the order reaches owner Orders page.' },
    { section: 'orders', title: 'Complete bill flow', description: 'Customer requests bill and owner completes order.' },
    { section: 'customer-payments', title: 'Check payments', description: 'Review COD/unpaid/online pending collections.' },
    { section: 'shift-closing', title: 'Close staff shift', description: 'Test drawer handover and shift variance.' },
    { section: 'day-closing', title: 'Close day', description: 'Create snapshot, Z report and Cash & Bank posting.' },
    { section: 'cash-bank', title: 'Create daily summary', description: 'Check ledger, balance and daily finance summary.' },
    { section: 'advanced-reports', title: 'Review reports', description: 'Validate product, table, payment and gateway reports.' },
    { section: 'vat-statutory', title: 'Review VAT pack', description: 'Check TRN, VAT period and workpaper readiness.' },
    { section: 'pwa-mobile', title: 'Finish mobile/PWA test', description: 'Install, print, network and tablet checks.' },
  ]
}

function hasAnyPaymentMethod(restaurant) {
  return Boolean(
    restaurant?.accepts_cash ||
      restaurant?.accepts_card ||
      restaurant?.accepts_cod ||
      restaurant?.accepts_online ||
      restaurant?.accepts_upi,
  )
}

function hasAnyRestaurantOwnedGatewayEnabled(restaurant) {
  const settings = restaurant?.payment_gateway_settings
  if (!settings || typeof settings !== 'object') return false

  return ['ziina', 'stripe', 'razorpay', 'cashfree', 'phonepe', 'network', 'paypal'].some(
    (gateway) => settings[gateway]?.enabled === true,
  )
}

function isSubscriptionActive(restaurant) {
  const status = String(restaurant?.subscription_status || '').toLowerCase()

  return ['active', 'paid', 'trialing', 'grace', 'grace_period'].includes(status)
}

function getPublicMenuUrl(restaurant) {
  if (!restaurant?.slug) return ''
  if (typeof window === 'undefined') return ''

  return `${window.location.origin.replace(/\/$/, '')}/menu/${encodeURIComponent(restaurant.slug)}`
}

function getReadinessTone(score) {
  if (score >= 85) return 'good'
  if (score >= 65) return 'warning'
  return 'danger'
}

function getManualQaStorageKey(restaurantId) {
  return `spizy_launch_qa_manual_${restaurantId || 'unknown'}`
}

function loadManualQaState(restaurantId) {
  if (typeof window === 'undefined') return {}

  try {
    const saved = window.localStorage.getItem(getManualQaStorageKey(restaurantId))
    return saved ? JSON.parse(saved) || {} : {}
  } catch {
    return {}
  }
}

function saveManualQaState(storageKey, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value || {}))
  } catch {
    // Local storage can be unavailable in private browsing. Manual state will remain in memory.
  }
}

function getTodayInputDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default LaunchQAReadinessManagement
