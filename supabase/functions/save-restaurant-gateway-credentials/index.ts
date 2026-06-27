// Supabase Edge Function: save-restaurant-gateway-credentials
// Saves a restaurant's OWN payment gateway credentials in a backend-only table.
// Spizy/Zalepro does not provide its Ziina/Stripe/etc. merchant account for restaurant customer payments.

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
    const accessToken = cleanString(body.access_token)
    const webhookSecret = cleanString(body.webhook_secret)
    const publicKey = cleanString(body.public_key)
    const merchantLabel = cleanString(body.merchant_label)
    const testMode = body.test_mode !== false
    const isEnabled = body.is_enabled !== false
    const incomingMetadata = normalizeObject(body.metadata)

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
        { success: false, message: 'You do not have permission to manage this restaurant gateway.' },
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

    const { data: existing } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, access_token, webhook_secret, public_key, merchant_label, last_test_status, last_test_message, metadata')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', gateway)
      .maybeSingle()

    if (!accessToken && !existing?.access_token) {
      return jsonResponse(
        { success: false, message: 'Gateway secret credential is required the first time you connect this gateway.' },
        400,
      )
    }

    if (gateway === 'phonepe' && !publicKey && !existing?.public_key) {
      return jsonResponse(
        { success: false, message: 'PhonePe Client ID is required. Add it in the Public key / client ID field.' },
        400,
      )
    }

    if (gateway === 'network' && !publicKey && !existing?.public_key) {
      return jsonResponse(
        { success: false, message: 'Network / N-Genius Outlet Reference is required. Add it in the Public key / client ID field.' },
        400,
      )
    }

    if (gateway === 'paypal' && !publicKey && !existing?.public_key) {
      return jsonResponse(
        { success: false, message: 'PayPal Client ID is required. Add it in the Public key / client ID field.' },
        400,
      )
    }

    const mergedMetadata = {
      ...normalizeObject(existing?.metadata),
      ...removeEmptyValues(incomingMetadata),
    }

    if (gateway === 'phonepe' && !cleanString(mergedMetadata.client_version)) {
      return jsonResponse(
        { success: false, message: 'PhonePe Client Version is required. Add it in the PhonePe Client Version field.' },
        400,
      )
    }

    const credentialPayload = {
      restaurant_id: restaurantId,
      gateway,
      merchant_label: merchantLabel || existing?.merchant_label || null,
      public_key: publicKey || existing?.public_key || null,
      access_token: accessToken || existing?.access_token || null,
      webhook_secret: webhookSecret || existing?.webhook_secret || null,
      test_mode: testMode,
      is_enabled: isEnabled,
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_test_status: existing?.last_test_status || null,
      last_test_message: existing?.last_test_message || null,
      metadata: mergedMetadata,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await serviceClient
      .from('restaurant_gateway_credentials')
      .upsert(credentialPayload, {
        onConflict: 'restaurant_id,gateway',
      })
      .select('id, restaurant_id, gateway, merchant_label, public_key, test_mode, is_enabled, connected_at, updated_at, metadata')
      .single()

    if (error) throw new Error(error.message)

    await updateRestaurantGatewayPublicStatus({
      serviceClient,
      restaurant,
      gateway,
      gatewayPatch: {
        enabled: isEnabled,
        test_mode: testMode,
        public_key: publicKey || existing?.public_key || '',
        merchant_label: merchantLabel || existing?.merchant_label || '',
        connection_status: 'connected',
        credential_status: 'saved',
        last_connected_at: new Date().toISOString(),
        last_test_status: existing?.last_test_status || '',
        last_test_message: existing?.last_test_message || '',
      },
    })

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway,
      actorUserId: user.id,
      action: existing?.id ? 'rotate_or_update' : 'connect',
      status: 'success',
      message: `${formatGatewayName(gateway)} credentials saved for this restaurant-owned account.`,
      metadata: {
        test_mode: testMode,
        is_enabled: isEnabled,
        token_updated: Boolean(accessToken),
        webhook_secret_updated: Boolean(webhookSecret),
        phonepe_client_version_saved: gateway === 'phonepe' ? Boolean(mergedMetadata.client_version) : undefined,
        phonepe_webhook_username_saved: gateway === 'phonepe' ? Boolean(mergedMetadata.webhook_username) : undefined,
        network_outlet_reference_saved: gateway === 'network' ? Boolean(publicKey || existing?.public_key) : undefined,
        paypal_client_id_saved: gateway === 'paypal' ? Boolean(publicKey || existing?.public_key) : undefined,
      },
    })

    return jsonResponse({
      success: true,
      message: `${formatGatewayName(gateway)} credentials saved for this restaurant account.`,
      credential: data,
      token_saved: Boolean(accessToken || existing?.access_token),
      webhook_secret_saved: Boolean(webhookSecret || existing?.webhook_secret),
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to save gateway credentials.' },
      500,
    )
  }
})

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
    // Audit logging must never block saving credentials.
  }
}

async function updateRestaurantGatewayPublicStatus({
  serviceClient,
  restaurant,
  gateway,
  gatewayPatch,
}) {
  const currentSettings = normalizeObject(restaurant.payment_gateway_settings)
  const currentGateway = normalizeObject(currentSettings[gateway])

  await serviceClient
    .from('restaurants')
    .update({
      payment_gateway_settings: {
        ...currentSettings,
        [gateway]: {
          ...currentGateway,
          ...gatewayPatch,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', restaurant.id)
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
    // restaurant_members check unavailable; continue with owner column fallback.
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

function removeEmptyValues(value) {
  const incoming = normalizeObject(value)
  return Object.fromEntries(
    Object.entries(incoming).filter(([, entryValue]) => String(entryValue || '').trim()),
  )
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
