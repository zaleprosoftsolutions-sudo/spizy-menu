import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const subscriptionPlans = {
  qr_menu_monthly: {
    key: 'qr_menu_monthly',
    name: 'Spizy QR Monthly',
    displayName: 'Spizy QR Menu Monthly',
    amount: 75,
    currency: 'AED',
    cycle: 'monthly',
    days: 30,
    description: 'Spizy monthly subscription',
  },
  qr_menu_yearly: {
    key: 'qr_menu_yearly',
    name: 'Spizy QR Yearly',
    displayName: 'Spizy QR Menu Yearly',
    amount: 750,
    currency: 'AED',
    cycle: 'yearly',
    days: 365,
    description: 'Spizy yearly subscription',
  },
} as const

type PlanKey = keyof typeof subscriptionPlans

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const mamoApiKey = Deno.env.get('MAMO_API_KEY') || ''
    const mamoApiBaseUrl = normalizeMamoBaseUrl(Deno.env.get('MAMO_API_BASE_URL') || 'https://sandbox.dev.business.mamopay.com/manage_api/v1')
    const appUrl = resolveAppUrl(req)

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase Edge Function environment is missing.' }, 500)
    }
    if (!mamoApiKey) {
      return jsonResponse({ error: 'MAMO_API_KEY is not configured in Supabase Edge Function secrets.' }, 500)
    }

    const authorization = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user
    if (userError || !user) {
      return jsonResponse({ error: 'Login required to create subscription checkout.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || '').trim()
    const planKey = String(body.plan_key || 'qr_menu_monthly') as PlanKey
    const plan = subscriptionPlans[planKey] || subscriptionPlans.qr_menu_monthly
    const couponCode = normalizeCouponCode(body.coupon_code)
    const previewOnly = body.preview_only === true || String(body.preview_only || '').toLowerCase() === 'true'
    const bodyEmail = String(body.customer_email || '').trim().toLowerCase()

    if (!restaurantId) return jsonResponse({ error: 'restaurant_id is required.' }, 400)

    const { data: restaurant, error: restaurantError } = await adminClient
      .from('restaurants')
      .select('id, name, slug, owner_id, currency, subscription_status')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse({ error: restaurantError?.message || 'Restaurant not found.' }, 404)
    }

    const hasAccess = await verifyRestaurantAdminAccess(adminClient, restaurant, user.id)
    if (!hasAccess) {
      return jsonResponse({ error: 'You do not have permission to manage this restaurant subscription.' }, 403)
    }

    const customerEmail = user.email || bodyEmail
    if (!customerEmail) {
      return jsonResponse({ error: 'Customer email is required for Mamo Pay. Login email was not found.' }, 400)
    }

    const couponResult = couponCode
      ? await validateCoupon(adminClient, couponCode, plan.key, plan.amount, plan.currency)
      : { coupon: null, discountAmount: 0, finalAmount: plan.amount }

    if (couponResult.error) return jsonResponse({ error: couponResult.error }, 400)

    const originalAmount = plan.amount
    const discountAmount = roundMoney(Number(couponResult.discountAmount || 0))
    const finalAmount = Math.max(roundMoney(Number(couponResult.finalAmount || plan.amount)), 2)

    if (previewOnly) {
      return jsonResponse({
        success: true,
        preview_only: true,
        message: discountAmount > 0
          ? `Coupon ${couponResult.coupon?.code || couponCode} applied. Pay ${formatMoney(plan.currency, finalAmount)} instead of ${formatMoney(plan.currency, originalAmount)}.`
          : 'Coupon checked. No discount was applied.',
        plan_key: plan.key,
        plan_name: plan.displayName,
        billing_cycle: plan.cycle,
        currency: plan.currency,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        coupon_code: couponResult.coupon?.code || null,
      })
    }

    const periodStart = toDateKey(new Date())
    const periodEnd = addDaysDateKey(new Date(), plan.days)
    const graceUntil = addDaysDateKey(new Date(), plan.days + 7)
    const displayName = restaurant.name || 'Restaurant'
    const externalId = `spizy-sub-${crypto.randomUUID()}`

    const { data: attempt, error: attemptError } = await adminClient
      .from('restaurant_subscription_payment_attempts')
      .insert({
        restaurant_id: restaurantId,
        plan_key: plan.key,
        plan_name: plan.displayName,
        billing_cycle: plan.cycle,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        amount: finalAmount,
        currency: plan.currency,
        coupon_id: couponResult.coupon?.id || null,
        coupon_code: couponResult.coupon?.code || null,
        status: 'created',
        external_id: externalId,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        grace_until: graceUntil,
        customer_name: displayName,
        customer_email: customerEmail,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (attemptError || !attempt) {
      return jsonResponse({ error: attemptError?.message || 'Unable to create subscription attempt.' }, 500)
    }

    const returnUrl = `${appUrl}/dashboard?section=subscription-billing&attempt_id=${encodeURIComponent(attempt.id)}`
    const failureReturnUrl = `${appUrl}/dashboard?section=subscription-billing&attempt_id=${encodeURIComponent(attempt.id)}&mamo_status=failed`

    const mamoPayload = compactObject({
      title: truncate(plan.name, 50),
      description: truncate(plan.description, 75),
      amount: finalAmount,
      amount_currency: plan.currency,
      active: true,
      return_url: returnUrl,
      failure_return_url: failureReturnUrl,
      link_type: 'standalone',
      enable_customer_details: true,
      send_customer_receipt: true,
      payment_methods: ['card', 'wallet'],
      external_id: attempt.external_id,
      first_name: truncate(firstName(displayName), 50),
      last_name: truncate(lastName(displayName), 50),
      email: customerEmail,
      // Mamo allows max 5 custom_data keys. Keep only the identifiers needed
      // to map the payment back to the subscription attempt. All pricing,
      // coupon and period details are already saved in Supabase on the attempt row.
      custom_data: {
        source: 'spizy_subscription',
        attempt_id: String(attempt.id),
        restaurant_id: String(restaurantId),
        plan_key: String(plan.key),
        coupon_code: String(couponResult.coupon?.code || 'none'),
      },
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    let mamoResponse: Response | null = null
    let mamoJson: any = {}

    try {
      mamoResponse = await fetch(`${mamoApiBaseUrl}/links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mamoApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(mamoPayload),
        signal: controller.signal,
      })
      mamoJson = await mamoResponse.json().catch(() => ({}))
    } catch (error) {
      clearTimeout(timeout)
      const errorInfo = error as { name?: string; message?: string }
      const message = errorInfo?.name === 'AbortError'
        ? 'Mamo Pay did not respond within 25 seconds. Check Mamo API key/base URL and try again.'
        : errorInfo?.message || 'Unable to reach Mamo Pay API.'

      await adminClient
        .from('restaurant_subscription_payment_attempts')
        .update({
          status: 'failed',
          mamo_status: errorInfo?.name === 'AbortError' ? 'timeout' : 'network_error',
          raw_response: { error: message, endpoint: `${mamoApiBaseUrl}/links`, payload: safePayloadForLogs(mamoPayload) },
          return_url: returnUrl,
          failure_return_url: failureReturnUrl,
        })
        .eq('id', attempt.id)

      return jsonResponse({ error: message, attempt_id: attempt.id }, 504)
    } finally {
      clearTimeout(timeout)
    }

    if (!mamoResponse) {
      return jsonResponse({ error: 'Mamo Pay response was not received.' }, 504)
    }

    if (!mamoResponse.ok) {
      const mamoMessage = extractMamoErrorMessage(mamoJson) || `Mamo Pay checkout failed with HTTP ${mamoResponse.status}.`

      await adminClient
        .from('restaurant_subscription_payment_attempts')
        .update({
          status: 'failed',
          mamo_status: `http_${mamoResponse.status}`,
          raw_response: { error: mamoMessage, response: mamoJson, endpoint: `${mamoApiBaseUrl}/links`, payload: safePayloadForLogs(mamoPayload) },
          return_url: returnUrl,
          failure_return_url: failureReturnUrl,
        })
        .eq('id', attempt.id)

      return jsonResponse({
        error: mamoMessage,
        mamo_status: mamoResponse.status,
        mamo_response: mamoJson,
        attempt_id: attempt.id,
      }, 502)
    }

    const linkId = extractFirstStringDeep(mamoJson, ['id', 'link_id', 'paymentLinkId', 'payment_link_id'])
    const checkoutUrl = extractFirstStringDeep(mamoJson, [
      'payment_url',
      'checkout_url',
      'paymentUrl',
      'checkoutUrl',
      'url',
      'link',
      'link_url',
      'short_url',
    ])

    if (!checkoutUrl) {
      await adminClient
        .from('restaurant_subscription_payment_attempts')
        .update({
          status: 'failed',
          mamo_status: 'missing_checkout_url',
          mamo_link_id: linkId || null,
          raw_response: { error: 'Mamo Pay created a response but did not return a checkout URL.', response: mamoJson, payload: safePayloadForLogs(mamoPayload) },
          return_url: returnUrl,
          failure_return_url: failureReturnUrl,
        })
        .eq('id', attempt.id)

      return jsonResponse({
        error: 'Mamo Pay did not return a checkout URL. Check the raw response in restaurant_subscription_payment_attempts.raw_response.',
        mamo_response: mamoJson,
        attempt_id: attempt.id,
      }, 502)
    }

    const { data: updatedAttempt, error: updateError } = await adminClient
      .from('restaurant_subscription_payment_attempts')
      .update({
        status: 'checkout_created',
        mamo_link_id: linkId || null,
        mamo_checkout_url: checkoutUrl,
        mamo_status: 'checkout_created',
        raw_response: mamoJson,
        return_url: returnUrl,
        failure_return_url: failureReturnUrl,
      })
      .eq('id', attempt.id)
      .select('*')
      .single()

    if (updateError) return jsonResponse({ error: updateError.message }, 500)

    return jsonResponse({
      success: true,
      message: discountAmount > 0
        ? `Mamo checkout created with ${formatMoney(plan.currency, discountAmount)} discount.`
        : 'Mamo Pay subscription checkout created.',
      checkout_url: checkoutUrl,
      link_id: linkId,
      attempt_id: attempt.id,
      customer_email: customerEmail,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      coupon_code: couponResult.coupon?.code || null,
      attempt: updatedAttempt,
    })
  } catch (error) {
    const errorInfo = error as { message?: string }
    return jsonResponse({ error: errorInfo?.message || 'Unexpected Mamo checkout error.' }, 500)
  }
})

async function verifyRestaurantAdminAccess(adminClient: any, restaurant: any, userId: string) {
  if (restaurant?.owner_id && String(restaurant.owner_id) === String(userId)) return true

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (['super_admin', 'partner_admin'].includes(String(profile?.role || ''))) return true

  const { data, error } = await adminClient
    .from('restaurant_members')
    .select('id, role')
    .eq('restaurant_id', restaurant.id)
    .eq('user_id', userId)
    .limit(1)

  if (error && error.code !== '42P01') throw error

  return (data || []).some((row: any) =>
    ['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'].includes(String(row.role || '')),
  )
}

async function validateCoupon(adminClient: any, couponCode: string, planKey: string, planAmount: number, currency: string) {
  const { data: coupon, error } = await adminClient
    .from('spizy_subscription_discount_coupons')
    .select('*')
    .ilike('code', couponCode)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') return { error: 'Coupon table is not installed. Run the subscription coupon SQL migration first.' }
    return { error: error.message }
  }

  if (!coupon) return { error: 'Invalid coupon code.' }
  if (!coupon.is_active) return { error: 'This coupon is not active.' }

  const now = Date.now()
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { error: 'This coupon is not active yet.' }
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return { error: 'This coupon has expired.' }
  if (coupon.max_redemptions && Number(coupon.redeemed_count || 0) >= Number(coupon.max_redemptions)) return { error: 'This coupon has reached its redemption limit.' }

  const applicablePlans = Array.isArray(coupon.applicable_plan_keys) ? coupon.applicable_plan_keys : []
  if (applicablePlans.length > 0 && !applicablePlans.includes(planKey)) return { error: 'This coupon is not valid for the selected plan.' }

  let discountAmount = 0
  if (coupon.discount_type === 'percentage') {
    discountAmount = planAmount * Math.min(Number(coupon.discount_value || 0), 100) / 100
  } else {
    if (String(coupon.currency || currency).toUpperCase() !== String(currency).toUpperCase()) return { error: 'Coupon currency does not match this plan.' }
    discountAmount = Number(coupon.discount_value || 0)
  }

  discountAmount = Math.min(roundMoney(discountAmount), planAmount)
  const finalAmount = Math.max(roundMoney(planAmount - discountAmount), 2)

  return { coupon, discountAmount, finalAmount }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function resolveAppUrl(req: Request) {
  const configured = Deno.env.get('SPIZY_APP_URL') || Deno.env.get('SPIZY_LIVE_APP_URL') || Deno.env.get('PUBLIC_SITE_URL') || ''
  const origin = req.headers.get('origin') || ''
  const candidate = trimTrailingSlash(configured || origin || 'https://spizy.site')

  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(candidate)) {
    return trimTrailingSlash(Deno.env.get('SPIZY_LIVE_APP_URL') || Deno.env.get('SPIZY_APP_URL') || 'https://spizy.site')
  }

  return candidate
}

function normalizeMamoBaseUrl(value: string) {
  return trimTrailingSlash(String(value || 'https://sandbox.dev.business.mamopay.com/manage_api/v1').replace(/\/links\/?$/, ''))
}

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '')
}

function normalizeCouponCode(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase()
}

function truncate(value: string, max: number) {
  const text = String(value || '').trim()
  return text.length > max ? text.slice(0, max) : text
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function firstName(value: string) {
  const parts = String(value || 'Restaurant').trim().split(/\s+/).filter(Boolean)
  return parts[0] || 'Restaurant'
}

function lastName(value: string) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return parts.slice(1).join(' ') || 'Owner'
}

function formatMoney(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDaysDateKey(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return toDateKey(next)
}

function compactObject(input: Record<string, any>) {
  const output: Record<string, any> = {}
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    output[key] = value
  })
  return output
}

function extractFirstStringDeep(source: any, keys: string[]) {
  const seen = new Set<any>()
  const queue = [source]
  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)

    for (const key of keys) {
      const value = current[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') queue.push(value)
    }
  }
  return ''
}

function extractMamoErrorMessage(source: any) {
  const direct = extractFirstStringDeep(source, ['message', 'error', 'detail', 'description'])
  if (direct) return direct
  if (Array.isArray(source?.errors)) return source.errors.map((item: any) => item?.message || item).filter(Boolean).join(' • ')
  return ''
}

function safePayloadForLogs(payload: Record<string, any>) {
  return {
    ...payload,
    email: payload.email ? '[prefilled]' : undefined,
  }
}
