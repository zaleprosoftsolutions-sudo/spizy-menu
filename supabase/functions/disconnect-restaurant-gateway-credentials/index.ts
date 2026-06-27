// Supabase Edge Function: disconnect-restaurant-gateway-credentials
// Disconnects a restaurant-owned payment gateway without touching Spizy/Zalepro platform subscription payments.
// Customer payment gateways belong to each restaurant; removing credentials hides the gateway from public checkout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse(
        { success: false, message: 'Supabase function environment is missing.' },
        500,
      )
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user

    if (userError || !user?.id) {
      return jsonResponse({ success: false, message: 'Login is required.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = cleanString(body.restaurant_id)
    const gateway = cleanString(body.gateway).toLowerCase()

    if (!restaurantId) {
      return jsonResponse({ success: false, message: 'Restaurant ID is required.' }, 400)
    }

    if (!['ziina', 'stripe', 'paypal', 'network', 'cashfree', 'razorpay', 'phonepe'].includes(gateway)) {
      return jsonResponse({ success: false, message: 'Unsupported gateway.' }, 400)
    }

    const hasAccess = await userCanManageRestaurant({
      serviceClient,
      restaurantId,
      userId: user.id,
    })

    if (!hasAccess) {
      return jsonResponse(
        { success: false, message: 'You do not have permission to disconnect this restaurant gateway.' },
        403,
      )
    }

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from('restaurants')
      .select('id, payment_gateway_settings')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse(
        { success: false, message: restaurantError?.message || 'Restaurant not found.' },
        404,
      )
    }

    const now = new Date().toISOString()

    await serviceClient
      .from('restaurant_gateway_credentials')
      .update({
        access_token: null,
        webhook_secret: null,
        public_key: null,
        is_enabled: false,
        connection_status: 'disconnected',
        last_error: null,
        last_test_status: null,
        last_test_message: null,
        disconnected_at: now,
        disconnected_by: user.id,
        rotate_required: false,
        updated_at: now,
      })
      .eq('restaurant_id', restaurantId)
      .eq('gateway', gateway)

    const currentSettings = normalizeObject(restaurant.payment_gateway_settings)
    const currentGateway = normalizeObject(currentSettings[gateway])

    await serviceClient
      .from('restaurants')
      .update({
        payment_gateway_settings: {
          ...currentSettings,
          [gateway]: {
            ...currentGateway,
            enabled: false,
            public_key: '',
            connection_status: 'disconnected',
            credential_status: 'removed',
            last_test_status: '',
            last_test_message: '',
            disconnected_at: now,
          },
        },
        accepts_online: hasAnotherEnabledOnlineGateway(currentSettings, gateway),
        updated_at: now,
      })
      .eq('id', restaurantId)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway,
      actorUserId: user.id,
      action: 'disconnect',
      status: 'success',
      message: `${formatGatewayName(gateway)} disconnected. Public checkout will no longer show this gateway for the restaurant.`,
      metadata: { source: 'settings' },
    })

    return jsonResponse({
      success: true,
      message: `${formatGatewayName(gateway)} disconnected for this restaurant. Customers will not see it until credentials are saved and tested again.`,
      gateway,
      disconnected_at: now,
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to disconnect gateway.' },
      500,
    )
  }
})

function hasAnotherEnabledOnlineGateway(settings, removedGateway) {
  return Object.entries(normalizeObject(settings)).some(([key, value]) => {
    if (key === removedGateway || key === 'cod') return false
    return Boolean(normalizeObject(value).enabled)
  })
}

async function writeGatewayAuditLog({
  serviceClient,
  restaurantId,
  gateway,
  actorUserId,
  action,
  status,
  message,
  metadata = {},
}) {
  try {
    await serviceClient.from('restaurant_gateway_audit_logs').insert({
      restaurant_id: restaurantId,
      gateway,
      action,
      actor_user_id: actorUserId,
      status,
      message,
      metadata,
    })
  } catch {
    // Audit logging must not block a safe disconnect operation.
  }
}

async function userCanManageRestaurant({ serviceClient, restaurantId, userId }) {
  try {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (['super_admin', 'partner_admin'].includes(String(profile?.role || ''))) {
      return true
    }
  } catch {
    // profiles table/role check unavailable; continue with membership checks.
  }

  try {
    const { data: member } = await serviceClient
      .from('restaurant_members')
      .select('id, role, is_active')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .maybeSingle()

    if (member && member.is_active !== false) {
      return ['restaurant_owner', 'owner', 'admin', 'manager'].includes(
        String(member.role || '').toLowerCase(),
      )
    }
  } catch {
    // restaurant_members check unavailable; continue with owner fallback.
  }

  try {
    const { data: restaurant } = await serviceClient
      .from('restaurants')
      .select('id, owner_id, user_id, created_by')
      .eq('id', restaurantId)
      .maybeSingle()

    return [restaurant?.owner_id, restaurant?.user_id, restaurant?.created_by].includes(userId)
  } catch {
    return false
  }
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function formatGatewayName(gateway) {
  if (gateway === 'ziina') return 'Ziina'
  if (gateway === 'stripe') return 'Stripe'
  if (gateway === 'paypal') return 'PayPal'
  if (gateway === 'network') return 'Network / N-Genius'
  if (gateway === 'cashfree') return 'Cashfree'
  if (gateway === 'razorpay') return 'Razorpay'
  if (gateway === 'phonepe') return 'PhonePe'
  return gateway
}

function cleanString(value) {
  return String(value || '').trim()
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
