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
} as const

type PlanKey = keyof typeof subscriptionPlans

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const mamoApiKey = Deno.env.get('MAMO_API_KEY') || ''
    const mamoApiBaseUrl = trimTrailingSlash(
      Deno.env.get('MAMO_API_BASE_URL') || 'https://sandbox.dev.business.mamopay.com/manage_api/v1',
    )
    const appUrl = trimTrailingSlash(
      Deno.env.get('SPIZY_APP_URL') || Deno.env.get('VITE_APP_URL') || req.headers.get('origin') || '',
    )

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

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurant_id is required.' }, 400)
    }

    const hasAccess = await verifyRestaurantAdminAccess(adminClient, restaurantId, user.id)

    if (!hasAccess) {
      return jsonResponse({ error: 'You do not have permission to manage this restaurant subscription.' }, 403)
    }

    const { data: restaurant, error: restaurantError } = await adminClient
      .from('restaurants')
      .select('id, name, slug, currency, subscription_status')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse({ error: restaurantError?.message || 'Restaurant not found.' }, 404)
    }

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
        amount: plan.amount,
        currency: plan.currency,
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

    if (attemptError || !attempt) {
      return jsonResponse({ error: attemptError?.message || 'Unable to create subscription attempt.' }, 500)
    }

    const returnUrl = appUrl
      ? `${appUrl}/dashboard?section=subscription-billing&attempt_id=${encodeURIComponent(attempt.id)}`
      : `https://www.spizymenu.com/dashboard?section=subscription-billing&attempt_id=${encodeURIComponent(attempt.id)}`
    const failureReturnUrl = `${returnUrl}&mamo_status=failed`

    const mamoPayload = {
      title: 'Spizy QR Menu Monthly',
      description: plan.description,
      amount: plan.amount,
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
      },
    }

    const mamoResponse = await fetch(`${mamoApiBaseUrl}/links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mamoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mamoPayload),
    })

    const mamoJson = await mamoResponse.json().catch(() => ({}))

    if (!mamoResponse.ok) {
      await adminClient
        .from('restaurant_subscription_payment_attempts')
        .update({
          status: 'failed',
          mamo_status: `http_${mamoResponse.status}`,
          raw_response: mamoJson,
          return_url: returnUrl,
          failure_return_url: failureReturnUrl,
        })
        .eq('id', attempt.id)

      return jsonResponse(
        {
          error:
            mamoJson?.message ||
            mamoJson?.error ||
            `Mamo Pay checkout failed with HTTP ${mamoResponse.status}.`,
          mamo_response: mamoJson,
        },
        502,
      )
    }

    const linkId = extractFirstString(mamoJson, ['id', 'link_id', 'paymentLinkId', 'payment_link_id'])
    const checkoutUrl = extractFirstString(mamoJson, [
      'payment_url',
      'checkout_url',
      'url',
      'link',
      'link_url',
      'short_url',
    ])

    const { data: updatedAttempt, error: updateError } = await adminClient
      .from('restaurant_subscription_payment_attempts')
      .update({
        status: 'checkout_created',
        mamo_link_id: linkId || null,
        mamo_checkout_url: checkoutUrl || null,
        mamo_status: 'checkout_created',
        raw_response: mamoJson,
        return_url: returnUrl,
        failure_return_url: failureReturnUrl,
      })
      .eq('id', attempt.id)
      .select('*')
      .single()

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500)
    }

    return jsonResponse({
      success: true,
      message: 'Mamo Pay subscription checkout created.',
      checkout_url: checkoutUrl,
      link_id: linkId,
      attempt: updatedAttempt,
    })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unexpected Mamo checkout error.' }, 500)
  }
})

async function verifyRestaurantAdminAccess(adminClient: any, restaurantId: string, userId: string) {
  const { data, error } = await adminClient
    .from('restaurant_members')
    .select('id, role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .limit(1)

  if (error) throw error

  return (data || []).some((row: any) =>
    ['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'].includes(String(row.role || '')),
  )
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '')
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDaysDateKey(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return toDateKey(next)
}

function extractFirstString(source: any, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  for (const key of keys) {
    const value = source?.data?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

function firstName(name: string) {
  return String(name || 'Restaurant').trim().split(/\s+/)[0] || 'Restaurant'
}

function lastName(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join(' ') : 'Owner'
}
