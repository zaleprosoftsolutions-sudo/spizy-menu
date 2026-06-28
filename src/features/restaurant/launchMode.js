const launchHiddenSections = new Set([
  'offline-pos',
  'refund-automation',
  'cogs',
  'expense-reports',
  'vat-statutory',
  'tax-invoice-center',
  'advanced-reports',
  'notification-providers',
])

export function isSpizyLaunchModeEnabled() {
  const env = import.meta?.env || {}

  if (String(env.VITE_SPIZY_SHOW_BETA_MODULES || '').toLowerCase() === 'true') {
    return false
  }

  const launchFlag = String(env.VITE_SPIZY_LAUNCH_MODE || '').toLowerCase()

  if (launchFlag === 'false') return false
  if (launchFlag === 'true') return true

  return true
}

export function isSpizyBetaSection(section) {
  return launchHiddenSections.has(section)
}

export function getLaunchVisibleSections(sections = []) {
  if (!isSpizyLaunchModeEnabled()) return sections

  return sections.filter((section) => !launchHiddenSections.has(section))
}

export function getSpizyLaunchModeLabel() {
  return isSpizyLaunchModeEnabled()
    ? 'Launch-safe mode active'
    : 'All modules visible'
}

export const spizyLaunchHiddenSectionIds = Array.from(launchHiddenSections)
