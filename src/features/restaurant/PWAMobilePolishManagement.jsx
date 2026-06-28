import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  Printer,
  QrCode,
  RefreshCw,
  Settings,
  ShoppingCart,
  Store,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './PWAMobilePolishManagement.css'

const emptyReadinessData = {
  tables: [],
  products: [],
  financeAccounts: [],
}

const deviceChecklist = [
  {
    key: 'install_prompt',
    title: 'Install prompt / Add to Home Screen',
    description: 'Open Spizy on Chrome Android or Safari iOS and confirm the restaurant owner can install the app-like shortcut.',
  },
  {
    key: 'pos_mobile',
    title: 'Mobile POS order flow',
    description: 'Create one counter order from a mobile screen and confirm cart, item quantity, payment choice and order save are usable.',
  },
  {
    key: 'qr_order',
    title: 'QR table order flow',
    description: 'Scan one table QR, add items, place an order, request bill and complete the owner-side bill flow.',
  },
  {
    key: 'receipt_print',
    title: 'Receipt / KOT print test',
    description: 'Use browser print or the connected thermal printer workflow and verify receipt/KOT layout is readable.',
  },
  {
    key: 'poor_network',
    title: 'Poor network handling',
    description: 'Test slow connection and confirm staff can refresh, retry and continue without losing the current order context.',
  },
  {
    key: 'tablet_landscape',
    title: 'Tablet landscape check',
    description: 'Check the owner dashboard, POS, Orders, Day Closing and Cash & Bank modules on tablet width.',
  },
]

function PWAMobilePolishManagement({ restaurant, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [readinessData, setReadinessData] = useState(emptyReadinessData)
  const [loadErrors, setLoadErrors] = useState([])
  const [lastCheckedAt, setLastCheckedAt] = useState(null)

  const publicMenuUrl = useMemo(() => {
    if (!restaurant?.slug) return ''

    const appUrl =
      typeof window !== 'undefined'
        ? window.location.origin.replace(/\/$/, '')
        : ''

    return appUrl ? `${appUrl}/menu/${encodeURIComponent(restaurant.slug)}` : ''
  }, [restaurant?.slug])

  const loadReadinessData = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurant?.id) return

      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const [tablesResult, productsResult, financeAccountsResult] = await Promise.all([
        supabase
          .from('restaurant_tables')
          .select('id, table_name, table_number, qr_token, is_active')
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true)
          .limit(60),
        supabase
          .from('menu_items')
          .select('id, name, is_available, is_deleted')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .limit(120),
        supabase
          .from('restaurant_finance_accounts')
          .select('id, account_name, account_type, is_active')
          .eq('restaurant_id', restaurant.id)
          .limit(40),
      ])

      const errors = [
        normalizeReadinessError('QR tables', tablesResult.error),
        normalizeReadinessError('Menu items', productsResult.error),
        normalizeReadinessError('Finance accounts', financeAccountsResult.error),
      ].filter(Boolean)

      setReadinessData({
        tables: tablesResult.data || [],
        products: productsResult.data || [],
        financeAccounts: financeAccountsResult.data || [],
      })
      setLoadErrors(errors)
      setLastCheckedAt(new Date())
      setLoading(false)
      setRefreshing(false)
    },
    [restaurant?.id],
  )

  useEffect(() => {
    loadReadinessData()
  }, [loadReadinessData])

  const readiness = useMemo(
    () =>
      buildMobileReadiness({
        restaurant,
        publicMenuUrl,
        readinessData,
      }),
    [publicMenuUrl, readinessData, restaurant],
  )

  const exportChecklist = () => {
    const rows = [
      ['Area', 'Status', 'Notes'],
      ...readiness.checks.map((check) => [
        check.title,
        check.ready ? 'Ready' : 'Needs work',
        check.description,
      ]),
      ...deviceChecklist.map((item) => [item.title, 'Manual test needed', item.description]),
    ]

    downloadCsv('spizy_mobile_pwa_readiness.csv', rows)
  }

  const printReadiness = () => {
    window.print()
  }

  return (
    <section className="pwa-mobile-shell">
      <div className="pwa-mobile-hero">
        <div>
          <p className="pricing-label">Mobile / PWA / POS Polish</p>
          <h1>Mobile restaurant readiness center</h1>
          <p>
            Check installability, mobile POS usability, QR table order readiness,
            offline-safe operating habits and receipt/KOT print preparation before production launch.
          </p>
        </div>

        <div className="pwa-mobile-hero-actions">
          <button
            type="button"
            className="pwa-mobile-secondary-button"
            onClick={() => loadReadinessData({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw size={17} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="pwa-mobile-secondary-button" onClick={exportChecklist}>
            <Download size={17} />
            Export checklist
          </button>
          <button type="button" className="pwa-mobile-primary-button" onClick={printReadiness}>
            <Printer size={17} />
            Print test sheet
          </button>
        </div>
      </div>

      {loadErrors.length > 0 && (
        <div className="pwa-mobile-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Some readiness data could not be loaded</strong>
            <span>{loadErrors.join(' • ')}</span>
          </div>
        </div>
      )}

      <div className="pwa-mobile-kpi-grid">
        <ReadinessKpi
          icon={<Store size={21} />}
          label="Readiness Score"
          value={`${readiness.score}/100`}
          note={readiness.label}
          tone={readiness.score >= 85 ? 'good' : readiness.score >= 60 ? 'warning' : 'danger'}
        />
        <ReadinessKpi
          icon={<QrCode size={21} />}
          label="Active QR Tables"
          value={String(readinessData.tables.length)}
          note={readinessData.tables.length > 0 ? 'QR order path ready' : 'Create QR tables'}
          tone={readinessData.tables.length > 0 ? 'good' : 'warning'}
        />
        <ReadinessKpi
          icon={<ShoppingCart size={21} />}
          label="Menu Items"
          value={String(readiness.availableProducts)}
          note="Available items for POS/QR"
          tone={readiness.availableProducts > 0 ? 'good' : 'warning'}
        />
        <ReadinessKpi
          icon={<ClipboardCheck size={21} />}
          label="Finance Accounts"
          value={String(readiness.activeFinanceAccounts)}
          note="Cash/card/gateway setup"
          tone={readiness.activeFinanceAccounts >= 3 ? 'good' : 'warning'}
        />
      </div>

      {loading ? (
        <div className="pwa-mobile-loading">
          <RefreshCw size={19} />
          Loading mobile readiness...
        </div>
      ) : (
        <>
          <div className="pwa-mobile-main-grid">
            <section className="pwa-mobile-panel">
              <div className="pwa-mobile-panel-head">
                <div>
                  <p className="pricing-label">Launch Checks</p>
                  <h2>PWA and mobile readiness</h2>
                </div>
                <span>{lastCheckedAt ? `Checked ${formatTime(lastCheckedAt)}` : 'Not checked yet'}</span>
              </div>

              <div className="pwa-mobile-check-list">
                {readiness.checks.map((check) => (
                  <ReadinessCheckCard key={check.key} check={check} onOpenSection={onOpenSection} />
                ))}
              </div>
            </section>

            <section className="pwa-mobile-panel">
              <div className="pwa-mobile-panel-head">
                <div>
                  <p className="pricing-label">Quick Actions</p>
                  <h2>Open test areas</h2>
                </div>
              </div>

              <div className="pwa-mobile-action-grid">
                <ActionButton
                  icon={<Settings size={18} />}
                  title="Settings"
                  text="Logo, theme, gateway and profile"
                  onClick={() => onOpenSection('settings')}
                />
                <ActionButton
                  icon={<QrCode size={18} />}
                  title="Tables & QR"
                  text="Create and test QR tables"
                  onClick={() => onOpenSection('qr')}
                />
                <ActionButton
                  icon={<ShoppingCart size={18} />}
                  title="POS"
                  text="Mobile counter order test"
                  onClick={() => onOpenSection('pos')}
                />
                <ActionButton
                  icon={<ClipboardCheck size={18} />}
                  title="Orders"
                  text="Live order and completion checks"
                  onClick={() => onOpenSection('orders')}
                />
                <ActionButton
                  icon={<Printer size={18} />}
                  title="Printers"
                  text="Receipt and KOT setup"
                  onClick={() => onOpenSection('printers')}
                />
                <ActionButton
                  icon={<ExternalLink size={18} />}
                  title="Public Menu"
                  text="Open QR menu in new tab"
                  disabled={!publicMenuUrl}
                  onClick={() => {
                    if (publicMenuUrl) window.open(publicMenuUrl, '_blank', 'noopener,noreferrer')
                  }}
                />
              </div>
            </section>
          </div>

          <section className="pwa-mobile-panel">
            <div className="pwa-mobile-panel-head">
              <div>
                <p className="pricing-label">Manual Device Testing</p>
                <h2>Production device checklist</h2>
              </div>
            </div>

            <div className="pwa-mobile-device-grid">
              {deviceChecklist.map((item) => (
                <article className="pwa-mobile-device-card" key={item.key}>
                  <div className="pwa-mobile-device-icon">
                    <ClipboardCheck size={17} />
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="pwa-mobile-panel pwa-mobile-offline-panel">
            <div className="pwa-mobile-panel-head">
              <div>
                <p className="pricing-label">Offline-Friendly POS Basics</p>
                <h2>Safe production rule</h2>
              </div>
            </div>

            <div className="pwa-mobile-offline-copy">
              <p>
                This foundation does not silently save paid orders while offline. For restaurant safety,
                offline support should first be used for screen continuity, retry guidance and draft protection.
                Final order save, payment posting, day closing and finance ledger posting should happen only after
                Supabase confirms the write successfully.
              </p>
              <p>
                Next deeper upgrade can add a controlled offline draft queue with clear “not synced yet” labels,
                manager approval and retry audit logs.
              </p>
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function ReadinessKpi({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`pwa-mobile-kpi-card ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function ReadinessCheckCard({ check, onOpenSection }) {
  const Icon = check.ready ? CheckCircle2 : AlertTriangle

  return (
    <article className={`pwa-mobile-check-card ${check.ready ? 'ready' : 'warning'}`}>
      <div className="pwa-mobile-check-icon">
        <Icon size={18} />
      </div>
      <div>
        <strong>{check.title}</strong>
        <span>{check.description}</span>
      </div>
      {check.section && (
        <button type="button" onClick={() => onOpenSection(check.section)}>
          {check.actionLabel || 'Open'}
        </button>
      )}
    </article>
  )
}

function ActionButton({ icon, title, text, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="pwa-mobile-action-button"
      onClick={onClick}
      disabled={disabled}
    >
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{disabled ? 'Not available yet' : text}</span>
    </button>
  )
}

function buildMobileReadiness({ restaurant, publicMenuUrl, readinessData }) {
  const tables = Array.isArray(readinessData.tables) ? readinessData.tables : []
  const products = Array.isArray(readinessData.products) ? readinessData.products : []
  const financeAccounts = Array.isArray(readinessData.financeAccounts)
    ? readinessData.financeAccounts
    : []

  const availableProducts = products.filter((product) => product.is_available !== false).length
  const activeFinanceAccounts = financeAccounts.filter((account) => account.is_active !== false).length
  const hasCashAccount = financeAccounts.some(
    (account) => account.is_active !== false && ['cash', 'petty_cash'].includes(account.account_type),
  )
  const hasGatewayOrCardAccount = financeAccounts.some(
    (account) =>
      account.is_active !== false &&
      ['card_machine', 'online_gateway', 'wallet', 'bank'].includes(account.account_type),
  )

  const browser = getBrowserReadiness()

  const checks = [
    {
      key: 'secure_context',
      title: 'Secure app context',
      description: browser.isSecure
        ? 'HTTPS or localhost is available for PWA/mobile testing.'
        : 'PWA install and service worker features usually need HTTPS.',
      ready: browser.isSecure,
      section: 'settings',
      actionLabel: 'Open settings',
    },
    {
      key: 'service_worker',
      title: 'Service worker support',
      description: browser.serviceWorkerSupported
        ? 'This browser supports service workers for future PWA/offline caching.'
        : 'This browser does not expose service worker support.',
      ready: browser.serviceWorkerSupported,
    },
    {
      key: 'manifest',
      title: 'Manifest link detected',
      description: browser.manifestDetected
        ? 'A web app manifest link is present on the current page.'
        : 'Add a manifest link in the app shell when final PWA install files are wired.',
      ready: browser.manifestDetected,
      section: 'settings',
      actionLabel: 'Open settings',
    },
    {
      key: 'restaurant_profile',
      title: 'Restaurant public profile',
      description: restaurant?.name && restaurant?.slug
        ? 'Restaurant name and public slug are available.'
        : 'Complete restaurant name and public menu slug before QR/PWA testing.',
      ready: Boolean(restaurant?.name && restaurant?.slug),
      section: 'onboarding',
      actionLabel: 'Open onboarding',
    },
    {
      key: 'public_menu',
      title: 'Public menu URL',
      description: publicMenuUrl
        ? 'Public menu URL can be opened for QR scan and mobile order testing.'
        : 'Restaurant slug is required before public menu testing.',
      ready: Boolean(publicMenuUrl),
      section: 'qr',
      actionLabel: 'Open QR',
    },
    {
      key: 'qr_tables',
      title: 'QR tables ready',
      description: tables.length > 0
        ? `${tables.length} active table QR record${tables.length === 1 ? '' : 's'} found.`
        : 'Create table QR records before dine-in QR order testing.',
      ready: tables.length > 0,
      section: 'qr',
      actionLabel: 'Create QR',
    },
    {
      key: 'menu_items',
      title: 'Menu items ready',
      description: availableProducts > 0
        ? `${availableProducts} available menu item${availableProducts === 1 ? '' : 's'} can be used in POS/QR orders.`
        : 'Add at least one available menu item before POS/mobile testing.',
      ready: availableProducts > 0,
      section: 'products',
      actionLabel: 'Open items',
    },
    {
      key: 'finance_accounts',
      title: 'Cash/card/gateway finance setup',
      description: hasCashAccount && hasGatewayOrCardAccount
        ? 'Cash and card/gateway finance accounts are available for closing and ledger tests.'
        : 'Create cash and card/gateway accounts before final POS/day closing tests.',
      ready: hasCashAccount && hasGatewayOrCardAccount,
      section: 'cash-bank',
      actionLabel: 'Open Cash & Bank',
    },
    {
      key: 'print_support',
      title: 'Browser print support',
      description: browser.printSupported
        ? 'Browser print command is available for receipt/KOT print testing.'
        : 'Browser print command is not available in this context.',
      ready: browser.printSupported,
      section: 'printers',
      actionLabel: 'Open printers',
    },
  ]

  const readyCount = checks.filter((check) => check.ready).length
  const score = Math.round((readyCount / checks.length) * 100)

  return {
    checks,
    score,
    label: score >= 85 ? 'Ready for device testing' : score >= 60 ? 'Needs review' : 'Setup needed',
    availableProducts,
    activeFinanceAccounts,
  }
}

function getBrowserReadiness() {
  if (typeof window === 'undefined') {
    return {
      isSecure: false,
      serviceWorkerSupported: false,
      manifestDetected: false,
      printSupported: false,
    }
  }

  return {
    isSecure:
      window.location.protocol === 'https:' ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname),
    serviceWorkerSupported: 'serviceWorker' in navigator,
    manifestDetected: Boolean(document.querySelector('link[rel="manifest"]')),
    printSupported: typeof window.print === 'function',
  }
}

function normalizeReadinessError(label, error) {
  if (!error) return ''
  if (error.code === '42P01') return ''

  return `${label}: ${error.message}`
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

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  } catch {
    return 'now'
  }
}

export default PWAMobilePolishManagement
