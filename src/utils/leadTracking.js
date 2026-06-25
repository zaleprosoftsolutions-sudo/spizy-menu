const LEAD_CONTEXT_KEY = 'spizy_lead_context'
const VISITOR_ID_KEY = 'spizy_visitor_id'
const LAST_TRACKED_KEY = 'spizy_last_tracked_at'
const ATTRIBUTION_DAYS = 90

function createVisitorId() {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `visitor_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function getVisitorId() {
  const existing = localStorage.getItem(VISITOR_ID_KEY)

  if (existing) return existing

  const visitorId = createVisitorId()
  localStorage.setItem(VISITOR_ID_KEY, visitorId)

  return visitorId
}

export function detectSalesChannel() {
  const hostname = window.location.hostname.toLowerCase()
  const pathname = window.location.pathname.toLowerCase()

  if (hostname === 'gcc.spizy.site' || pathname.startsWith('/gcc')) {
    return 'gcc'
  }

  return 'main-site'
}

function readQueryParams() {
  const params = new URLSearchParams(window.location.search)

  return {
    refCode:
      params.get('ref') ||
      params.get('partner') ||
      params.get('partner_code') ||
      params.get('p') ||
      '',
    utmSource: params.get('utm_source') || '',
    utmCampaign: params.get('utm_campaign') || '',
  }
}

export function saveLeadContext() {
  const now = Date.now()
  const existingRaw = localStorage.getItem(LEAD_CONTEXT_KEY)
  const existing = existingRaw ? JSON.parse(existingRaw) : null
  const query = readQueryParams()
  const visitorId = getVisitorId()
  const salesChannelSlug = detectSalesChannel()

  const nextContext = {
    visitorId,
    salesChannelSlug,
    refCode: query.refCode || existing?.refCode || '',
    sourceUrl: window.location.href,
    landingPath: window.location.pathname,
    utmSource: query.utmSource || existing?.utmSource || '',
    utmCampaign: query.utmCampaign || existing?.utmCampaign || '',
    firstSeenAt: existing?.firstSeenAt || new Date().toISOString(),
    expiresAt: new Date(
      now + ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
  }

  localStorage.setItem(LEAD_CONTEXT_KEY, JSON.stringify(nextContext))

  return nextContext
}

export function getLeadContext() {
  const raw = localStorage.getItem(LEAD_CONTEXT_KEY)

  if (!raw) return saveLeadContext()

  const context = JSON.parse(raw)
  const expired = new Date(context.expiresAt).getTime() < Date.now()

  if (expired) {
    localStorage.removeItem(LEAD_CONTEXT_KEY)
    return saveLeadContext()
  }

  return {
    ...context,
    salesChannelSlug: detectSalesChannel(),
  }
}

export async function resolveSalesChannel(supabase, slug) {
  const { data, error } = await supabase
    .from('sales_channels')
    .select('id, slug, name, channel_type')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.warn('Sales channel lookup failed:', error.message)
    return null
  }

  return data
}

export async function resolvePartnerByCode(supabase, refCode) {
  if (!refCode) return null

  const { data, error } = await supabase
    .from('partners')
    .select('id, partner_code, name')
    .eq('partner_code', refCode)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.warn('Partner lookup failed:', error.message)
    return null
  }

  return data
}

export async function trackCurrentVisit(supabase) {
  const context = saveLeadContext()
  const lastTrackedAt = Number(localStorage.getItem(LAST_TRACKED_KEY) || 0)
  const oneHour = 60 * 60 * 1000

  if (Date.now() - lastTrackedAt < oneHour) {
    return context
  }

  const salesChannel = await resolveSalesChannel(
    supabase,
    context.salesChannelSlug,
  )

  await supabase.from('lead_attributions').insert({
    visitor_id: context.visitorId,
    sales_channel_id: salesChannel?.id || null,
    ref_code: context.refCode || null,
    source_url: context.sourceUrl,
    landing_path: context.landingPath,
    utm_source: context.utmSource || null,
    utm_campaign: context.utmCampaign || null,
  })

  localStorage.setItem(LAST_TRACKED_KEY, String(Date.now()))

  return context
}

export function createRestaurantSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

  const suffix = Math.random().toString(36).slice(2, 7)

  return `${base || 'restaurant'}-${suffix}`
}