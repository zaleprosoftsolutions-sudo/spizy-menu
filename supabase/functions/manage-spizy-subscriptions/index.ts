import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getDateInput(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + Number(days || 0))
  return next
}

async function getRequesterRole(adminClient: ReturnType<typeof createClient>, authHeader: string) {
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return { role: '', userId: '' }

  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !userData?.user) return { role: '', userId: '' }

  const user = userData.user
  const metadataRole =
    String(user.app_metadata?.role || user.user_metadata?.role || '').trim()

  if (metadataRole) return { role: metadataRole, userId: user.id }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return { role: String(profile?.role || '').trim(), userId: user.id }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500)
  }

  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authorization header is required.' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const requester = await getRequesterRole(adminClient, authHeader)

  if (requester.role !== 'super_admin') {
    return jsonResponse({ error: 'Only super admin can manage Spizy subscriptions.' }, 403)
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'list')

  if (action === 'list') {
    const [restaurantsResult, attemptsResult, invoicesResult] = await Promise.all([
      adminClient
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
      adminClient
        .from('restaurant_subscription_payment_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80),
      adminClient
        .from('restaurant_subscription_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80),
    ])

    if (restaurantsResult.error) {
      return jsonResponse({ error: restaurantsResult.error.message }, 400)
    }

    return jsonResponse({
      restaurants: restaurantsResult.data || [],
      attempts: attemptsResult.error ? [] : attemptsResult.data || [],
      invoices: invoicesResult.error ? [] : invoicesResult.data || [],
      warnings: [attemptsResult.error?.message, invoicesResult.error?.message].filter(Boolean),
    })
  }

  if (action === 'update_subscription') {
    const restaurantId = String(body.restaurant_id || '')
    if (!restaurantId) return jsonResponse({ error: 'restaurant_id is required.' }, 400)

    const payload = {
      subscription_status: String(body.subscription_status || 'trialing'),
      subscription_plan: String(body.subscription_plan || 'qr_menu_monthly'),
      subscription_current_period_start: getDateInput(body.subscription_current_period_start),
      subscription_current_period_end: getDateInput(body.subscription_current_period_end),
      subscription_grace_until: getDateInput(body.subscription_grace_until),
      subscription_payment_gateway: 'manual_super_admin',
    }

    const { data, error } = await adminClient
      .from('restaurants')
      .update(payload)
      .eq('id', restaurantId)
      .select('*')
      .single()

    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({ success: true, restaurant: data })
  }

  if (action === 'extend_trial') {
    const restaurantId = String(body.restaurant_id || '')
    const days = Number(body.days || 7)
    if (!restaurantId) return jsonResponse({ error: 'restaurant_id is required.' }, 400)
    if (!Number.isFinite(days) || days <= 0) return jsonResponse({ error: 'days must be greater than zero.' }, 400)

    const { data: restaurant, error: loadError } = await adminClient
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single()

    if (loadError || !restaurant) {
      return jsonResponse({ error: loadError?.message || 'Restaurant not found.' }, 404)
    }

    const currentEnd = restaurant.subscription_trial_ends_at
      ? new Date(restaurant.subscription_trial_ends_at)
      : restaurant.subscription_current_period_end
        ? new Date(restaurant.subscription_current_period_end)
        : new Date()

    const nextEnd = addDays(currentEnd, days)

    const { data, error } = await adminClient
      .from('restaurants')
      .update({
        subscription_status: 'trialing',
        subscription_trial_started_at: restaurant.subscription_trial_started_at || new Date().toISOString().slice(0, 10),
        subscription_trial_ends_at: nextEnd.toISOString().slice(0, 10),
        subscription_grace_until: addDays(nextEnd, 3).toISOString().slice(0, 10),
      })
      .eq('id', restaurantId)
      .select('*')
      .single()

    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({ success: true, restaurant: data })
  }

  return jsonResponse({ error: `Unsupported action: ${action}` }, 400)
})
