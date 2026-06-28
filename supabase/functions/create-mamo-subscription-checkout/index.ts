import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const subscriptionPlans = {
  qr_menu_monthly: {
    key: 'qr_menu_monthly',
    name: 'Spizy QR Menu Monthly',
    amount: 50,
    currency: 'AED',
    cycle: 'monthly',
    days: 30,
    description: 'Monthly Spizy QR menu subscription',
  },
  qr_menu_yearly: {
    key: 'qr_menu_yearly',
    name: 'Spizy QR Menu Yearly',
    amount: 499,
    currency: 'AED',
    cycle: 'yearly',
    days: 365,
    description: 'Yearly Spizy QR menu subscription',
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
    const mamoApiBaseUrl = trimTrailingSlash(Deno.env.get('MAMO_API_BASE_URL') || 'https://sandbox.dev.business.mamopay.com/manage_api/v1')
    const appUrl = trimTrailingSlash(Deno.env.get('SPIZY_APP_URL') || Deno.env.get('VITE_APP_URL') || req.headers.get('origin') || '')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'Supabase Edge Function environment is missing.' }, 500)
    if (!mamoApiKey) return jsonResponse({ error: 'MAMO_API_KEY is not configured in Supabase Edge Function secrets.' }, 500)

    const authorization = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user
    if (userError || !user) return jsonResponse({ error: 'Login required to create subscription checkout.' }, 401)

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || '').trim()
    const planKey = String(body.plan_key || 'qr_menu_monthly') as PlanKey
    const plan = subscriptionPlans[planKey] || subscriptionPlans.qr_menu_monthly
    const couponCode = normalizeCouponCode(body.coupon_code)

    if (!restaurantId) return jsonResponse({ error: 'restaurant_id is required.' }, 400)

    const hasAccess = await verifyRestaurantAdminAccess(adminClient, restaurantId, user.id)
    if (!hasAccess) return jsonResponse({ error: 'You do not have permission to manage this restaurant subscription.' }, 403)

    const { data: restaurant, error: restaurantError } = await adminClient
      .from('restaurants')
      .select('id, name, slug, currency, subscription_status')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) return jsonResponse({ error: restaurantError?.message || 'Restaurant not found.' }, 404)

    const couponResult = couponCode
      ? await validateCoupon(adminClient, couponCode, plan.key, plan.amount, plan.currency)
      : { coupon: null, discountAmount: 0, finalAmount: plan.amount }

    if (couponResult.error) return jsonResponse({ error: couponResult.error }, 400)

    const originalAmount = plan.amount
    const discountAmount = Number(couponResult.discountAmount || 0)
    const finalAmount = Math.max(Number(couponResult.finalAmount || plan.amount), 1)
    const periodStart = toDateKey(new Date())
    const periodEnd = addDaysDateKey(new Date(), plan.days)
    const graceUntil = addDaysDateKey(new Date(), plan.days + 7)
    const displayName = restaurant.name || 'Restaurant'

    const { data: attempt, error: attemptError } = await adminClient
      .from('restaurant_subscription_payment_attempts')
      .insert({
        restaurant_id: restaurantId,
        plan_key: plan.key,
        plan_name: plan.name,
        billing_cycle: plan.cycle,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        amount: finalAmount,
        currency: plan.currency,
        coupon_id: couponResult.coupon?.id || null,
        coupon_code: couponResult.coupon?.code || null,
        status: 'created',
        external_id: `spizy-sub-${restaurantId}-${crypto.randomUUID()}`,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        grace_until: graceUntil,
        customer_name: displayName,
        customer_email: user.email || null,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (attemptError || !attempt) return jsonResponse({ error: attemptError?.message || 'Unable to create subscription attempt.' }, 500)

    const returnUrl = appUrl
      ? `${appUrl}/dashboard?section=subscription-billing&attempt_id=${encodeURIComponent(attempt.id)}`
      : `https://www.spizymenu.com/dashboard?section=subscription-billing&attempt_id=${encodeURIComponent(attempt.id)}`
    const failureReturnUrl = `${returnUrl}&mamo_status=failed`

    const discountLine = discountAmount > 0 ? ` Discount applied: ${formatMoney(plan.currency, discountAmount)} (${couponResult.coupon?.code}).` : ''

    const mamoPayload = {
      title: plan.name,
      description: `${plan.description}.${discountLine}`,
      amount: finalAmount,
      amount_currency: plan.currency,
      active: true,
      capacity: 1,
      return_url: returnUrl,
      failure_return_url: failureReturnUrl,
      link_type: 'standalone',
      enable_customer_details: true,
      send_customer_receipt: true,
      payment_methods: ['card', 'wallet'],
      external_id: attempt.external_id,
      first_name: firstName(displayName),
      last_name: lastName(displayName),
      email: user.email || undefined,
      custom_data: {
        source: 'spizy_subscription_billing',
        restaurant_id: restaurantId,
        restaurant_slug: restaurant.slug || null,
        plan_key: plan.key,
        attempt_id: attempt.id,
        coupon_code: couponResult.coupon?.code || null,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        final_amount: finalAmount,
      },
    }

    const mamoResponse = await fetch(`${mamoApiBaseUrl}/links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mamoApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mamoPayload),
    })

    const mamoJson = await mamoResponse.json().catch(() => ({}))

    if (!mamoResponse.ok) {
      await adminClient
        .from('restaurant_subscription_payment_attempts')
        .update({ status: 'failed', mamo_status: `http_${mamoResponse.status}`, raw_response: mamoJson, return_url: returnUrl, failure_return_url: failureReturnUrl })
        .eq('id', attempt.id)

      return jsonResponse({ error: mamoJson?.message || mamoJson?.error || `Mamo Pay checkout failed with HTTP ${mamoResponse.status}.`, mamo_response: mamoJson }, 502)
    }

    const linkId = extractFirstString(mamoJson, ['id', 'link_id', 'paymentLinkId', 'payment_link_id'])
    const checkoutUrl = extractFirstString(mamoJson, ['payment_url', 'checkout_url', 'url', 'link', 'link_url', 'short_url'])

    const { data: updatedAttempt, error: updateError } = await adminClient
      .from('restaurant_subscription_payment_attempts')
      .update({ status: 'checkout_created', mamo_link_id: linkId || null, mamo_checkout_url: checkoutUrl || null, mamo_status: 'checkout_created', raw_response: mamoJson, return_url: returnUrl, failure_return_url: failureReturnUrl })
      .eq('id', attempt.id)
      .select('*')
      .single()

    if (updateError) return jsonResponse({ error: updateError.message }, 500)

    return jsonResponse({
      success: true,
      message: discountAmount > 0 ? `Mamo checkout created with ${formatMoney(plan.currency, discountAmount)} discount.` : 'Mamo Pay subscription checkout created.',
      checkout_url: checkoutUrl,
      link_id: linkId,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      coupon_code: couponResult.coupon?.code || null,
      attempt: updatedAttempt,
    })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unexpected Mamo checkout error.' }, 500)
  }
})

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
    discountAmount = planAmount * Math.min(Number(coupon.discount_value || 0), 95) / 100
  } else {
    discountAmount = Math.min(Number(coupon.discount_value || 0), planAmount - 1)
  }

  discountAmount = roundMoney(discountAmount)
  return { coupon, discountAmount, finalAmount: roundMoney(planAmount - discountAmount) }
}

async function verifyRestaurantAdminAccess(adminClient: any, restaurantId: string, userId: string) {
  const { data, error } = await adminClient
    .from('restaurant_members')
    .select('id, role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .limit(1)
  if (error) throw error
  return (data || []).some((row: any) => ['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'].includes(String(row.role || '')))
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function trimTrailingSlash(value: string) { return String(value || '').replace(/\/+$/, '') }
function toDateKey(date: Date) { return date.toISOString().slice(0, 10) }
function addDaysDateKey(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return toDateKey(next) }
function normalizeCouponCode(value: unknown) { return String(value || '').trim().replace(/\s+/g, '').toUpperCase() }
function roundMoney(value: number) { return Math.round(Number(value || 0) * 100) / 100 }
function formatMoney(currency: string, amount: number) { return `${currency} ${roundMoney(amount).toFixed(2)}` }
function firstName(value: string) { return String(value || 'Spizy').trim().split(/\s+/)[0] || 'Spizy' }
function lastName(value: string) { const parts = String(value || 'Restaurant').trim().split(/\s+/); return parts.length > 1 ? parts.slice(1).join(' ') : 'Restaurant' }
function extractFirstString(source: any, keys: string[]) { for (const key of keys) { const value = source?.[key]; if (typeof value === 'string' && value.trim()) return value.trim() } for (const key of keys) { const value = source?.data?.[key]; if (typeof value === 'string' && value.trim()) return value.trim() } return '' }
