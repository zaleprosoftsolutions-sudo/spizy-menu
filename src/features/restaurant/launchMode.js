const betaHiddenInLaunch = new Set([
  'offline-pos',
  'refund-automation',
  'cogs',
  'expense-reports',
  'vat-statutory',
  'tax-invoice-center',
  'advanced-reports',
  'notification-providers',
])

const launchCoreSections = new Set([
  'overview',
  'onboarding',
  'subscription-billing',
  'pwa-mobile',
  'launch-qa',
  'deployment-center',
  'receipt-print',
  'pos',
  'alerts',
  'notification-center',
  'orders',
  'customer-payments',
  'day-closing',
  'floor',
  'kitchen',
  'delivery',
  'delivery-zones',
  'reservations',
  'service-requests',
  'products',
  'menu-schedule',
  'nutrition-labels',
  'menu',
  'categories',
  'qr',
  'inventory',
  'branch-stock',
  'recipes',
  'modifiers',
  'purchases',
  'supplier-payments',
  'expenses',
  'finance',
  'cash-bank',
  'tax-invoices',
  'customers',
  'loyalty-tiers',
  'gift-vouchers',
  'combo-deals',
  'crm',
  'discounts',
  'campaigns',
  'marketing',
  'staff',
  'permissions-review',
  'attendance',
  'shift-closing',
  'payroll',
  'reviews',
  'reports',
  'printers',
  'activity-logs',
  'data-export',
  'data-import',
  'branches',
  'settings',
])

function getEnvValue(key) {
  try {
    return import.meta.env?.[key]
  } catch {
    return undefined
  }
}

export function isSpizyLaunchSafeMode() {
  const launchMode = String(getEnvValue('VITE_SPIZY_LAUNCH_MODE') ?? 'true').toLowerCase()
  const showBeta = String(getEnvValue('VITE_SPIZY_SHOW_BETA_MODULES') ?? 'false').toLowerCase()

  if (showBeta === 'true') return false
  if (launchMode === 'false') return false

  return true
}

export function getSpizyLaunchModeLabel() {
  return isSpizyLaunchSafeMode() ? 'Launch-safe mode active' : 'All modules visible'
}

export function getLaunchVisibleSections(sections = []) {
  const safeSections = Array.isArray(sections) ? sections : []

  if (!isSpizyLaunchSafeMode()) return safeSections

  return safeSections.filter(
    (section) => launchCoreSections.has(section) && !betaHiddenInLaunch.has(section),
  )
}
