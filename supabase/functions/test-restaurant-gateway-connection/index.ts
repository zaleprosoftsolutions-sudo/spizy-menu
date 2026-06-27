// Supabase Edge Function: test-restaurant-gateway-connection
// Tests a restaurant-owned gateway credential without using a Spizy/Zalepro merchant account.
// For Ziina, this creates a small test-mode payment intent to verify the restaurant token can create checkout sessions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ZIINA_API_BASE_URL = 'https://api-v2.ziina.com/api'

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

    if (gateway !== 'ziina') {
      return jsonResponse(
        { success: false, message: 'Only Ziina connection test is available in this package.' },
        400,
      )
    }

    const hasAccess = await userCanManageRestaurant({
      serviceClient,
      restaurantId,
      userId: user.id,
    })

    if (!hasAccess) {
      return jsonResponse(
        { success: false, message: 'You do not have permission to test this restaurant gateway.' },
        403,
      )
    }

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from('restaurants')
      .select('id, name, slug, currency, payment_gateway_settings')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse(
        { success: false, message: restaurantError?.message || 'Restaurant not found.' },
        404,
      )
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, access_token, merchant_label, test_mode, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', gateway)
      .maybeSingle()

    if (credentialError) {
      return jsonResponse(
        { success: false, message: credentialError.message || 'Unable to read gateway credentials.' },
        500,
      )
    }

    if (!credentials?.is_enabled || !credentials?.access_token) {
      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials?.id || '',
        gateway,
        success: false,
        message: 'Ziina credentials are missing. Save this restaurant’s Ziina token first.',
        status: 'not_connected',
      })

      return jsonResponse(
        { success: false, message: 'Ziina credentials are missing. Save this restaurant’s Ziina token first.' },
        400,
      )
    }

    const publicOrigin = normalizeOrigin(
      body.origin || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('APP_URL') || '',
    )

    if (!publicOrigin) {
      return jsonResponse(
        { success: false, message: 'PUBLIC_SITE_URL or request origin is required for the test.' },
        500,
      )
    }

    const testReference = `spizy-test-${Date.now()}`
    const encodedSlug = encodeURIComponent(restaurant.slug || '')
    const encodedReference = encodeURIComponent(testReference)
    const testPayload = {
      amount: 200,
      currency_code: 'AED',
      message: `${restaurant.name || 'Restaurant'} Ziina connection test`,
      success_url: `${publicOrigin}/payment/success?gateway=ziina&restaurant=${encodedSlug}&ref=${encodedReference}&test=1`,
      cancel_url: `${publicOrigin}/payment/failed?gateway=ziina&restaurant=${encodedSlug}&ref=${encodedReference}&test=1&reason=cancelled`,
      failure_url: `${publicOrigin}/payment/failed?gateway=ziina&restaurant=${encodedSlug}&ref=${encodedReference}&test=1&reason=failed`,
      test: true,
      expiry: String(Date.now() + 10 * 60 * 1000),
      allow_tips: false,
    }

    const ziinaResponse = await fetch(`${ZIINA_API_BASE_URL}/payment_intent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    })

    const ziinaJson = await ziinaResponse.json().catch(() => ({}))

    if (!ziinaResponse.ok) {
      const failureMessage =
        ziinaJson?.message ||
        ziinaJson?.error ||
        ziinaJson?.latest_error?.message ||
        'Ziina token test failed. Check the restaurant token and mode.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: false,
        message: failureMessage,
        status: 'test_failed',
        metadata: { test_reference: testReference, response: ziinaJson },
      })

      return jsonResponse(
        { success: false, message: failureMessage, details: ziinaJson },
        502,
      )
    }

    const successMessage = 'Ziina connection test passed. This restaurant’s own token can create checkout sessions.'

    await updateCredentialAndPublicStatus({
      serviceClient,
      restaurant,
      credentialId: credentials.id,
      gateway,
      success: true,
      message: successMessage,
      status: 'tested',
      metadata: {
        test_reference: testReference,
        payment_intent_id: ziinaJson?.id || '',
        operation_id: ziinaJson?.operation_id || '',
      },
    })

    return jsonResponse({
      success: true,
      message: successMessage,
      gateway,
      mode: 'test',
      test_reference: testReference,
      payment_intent_id: ziinaJson?.id || '',
      redirect_url: ziinaJson?.redirect_url || '',
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to test gateway connection.' },
      500,
    )
  }
})

async function updateCredentialAndPublicStatus({
  serviceClient,
  restaurant,
  credentialId,
  gateway,
  success,
  message,
  status,
  metadata = {},
}) {
  const now = new Date().toISOString()

  if (credentialId) {
    await serviceClient
      .from('restaurant_gateway_credentials')
      .update({
        last_tested_at: now,
        last_test_status: success ? 'success' : 'failed',
        last_test_message: message,
        last_error: success ? null : message,
        metadata,
        updated_at: now,
      })
      .eq('id', credentialId)
  }

  const currentSettings = normalizeObject(restaurant.payment_gateway_settings)
  const currentGateway = normalizeObject(currentSettings[gateway])
  const nextSettings = {
    ...currentSettings,
    [gateway]: {
      ...currentGateway,
      connection_status: status,
      credential_status: credentialId ? 'saved' : 'missing',
      last_test_status: success ? 'success' : 'failed',
      last_test_message: message,
      last_tested_at: now,
    },
  }

  await serviceClient
    .from('restaurants')
    .update({
      payment_gateway_settings: nextSettings,
      updated_at: now,
    })
    .eq('id', restaurant.id)
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
    // profiles check unavailable; continue.
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
    // membership check unavailable; continue.
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

function normalizeOrigin(value) {
  const cleanValue = cleanString(value).replace(/\/+$/, '')

  if (!cleanValue) return ''

  try {
    const url = new URL(cleanValue)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.origin
  } catch {
    return ''
  }
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
