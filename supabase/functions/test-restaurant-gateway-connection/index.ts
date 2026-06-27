// Supabase Edge Function: test-restaurant-gateway-connection
// Tests a restaurant-owned gateway credential without using a Spizy/Zalepro merchant account.
// For Ziina, this creates a small test-mode payment intent. For Stripe, Razorpay and Cashfree, it verifies the restaurant-owned API credentials.

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

    if (!['ziina', 'stripe', 'paypal', 'razorpay', 'cashfree', 'network', 'phonepe'].includes(gateway)) {
      return jsonResponse(
        { success: false, message: 'Only Ziina, Stripe, PayPal, Razorpay, Cashfree, Network / N-Genius and PhonePe connection tests are available in this package.' },
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
      .select('id, access_token, public_key, merchant_label, test_mode, is_enabled, metadata')
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
        message: `${formatGatewayName(gateway)} credentials are missing. Save this restaurant’s ${formatGatewayName(gateway)} credential first.`,
        status: 'not_connected',
        actorUserId: user.id,
      })

      return jsonResponse(
        { success: false, message: `${formatGatewayName(gateway)} credentials are missing. Save this restaurant’s ${formatGatewayName(gateway)} credential first.` },
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

    if (gateway === 'stripe') {
      const stripeResponse = await fetch('https://api.stripe.com/v1/account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
        },
      })

      const stripeJson = await stripeResponse.json().catch(() => ({}))

      if (!stripeResponse.ok) {
        const failureMessage =
          stripeJson?.error?.message ||
          'Stripe secret key test failed. Check this restaurant’s Stripe key and mode.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          metadata: { response_type: stripeJson?.error?.type || '', account_id: stripeJson?.id || '' },
          actorUserId: user.id,
        })

        return jsonResponse(
          { success: false, message: failureMessage, details: sanitizeStripeAccountResponse(stripeJson) },
          502,
        )
      }

      const successMessage = 'Stripe connection test passed. This restaurant’s own Stripe key can create checkout sessions.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: true,
        message: successMessage,
        status: 'tested',
        metadata: {
          account_id: stripeJson?.id || '',
          country: stripeJson?.country || '',
          charges_enabled: Boolean(stripeJson?.charges_enabled),
          payouts_enabled: Boolean(stripeJson?.payouts_enabled),
        },
        actorUserId: user.id,
      })

      return jsonResponse({
        success: true,
        message: successMessage,
        gateway,
        mode: credentials.test_mode === false ? 'live' : 'test',
        account_id: stripeJson?.id || '',
        country: stripeJson?.country || '',
        charges_enabled: Boolean(stripeJson?.charges_enabled),
        payouts_enabled: Boolean(stripeJson?.payouts_enabled),
      })
    }

    if (gateway === 'paypal') {
      if (!credentials.public_key) {
        const failureMessage = 'PayPal Client ID is missing. Save this restaurant’s PayPal Client ID in the Public key field.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: failureMessage }, 400)
      }

      const paypalBaseUrl = getPayPalBaseUrl(credentials.test_mode !== false)
      const tokenResult = await fetchPayPalAccessToken({
        baseUrl: paypalBaseUrl,
        clientId: credentials.public_key,
        clientSecret: credentials.access_token,
      })

      if (!tokenResult.success) {
        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: tokenResult.message,
          status: 'test_failed',
          metadata: { paypal_error: tokenResult.code || '' },
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: tokenResult.message, details: tokenResult.details || {} }, 502)
      }

      const successMessage = 'PayPal connection test passed. This restaurant’s own PayPal Client ID and Secret can create checkout orders.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: true,
        message: successMessage,
        status: 'tested',
        metadata: {
          test_mode: credentials.test_mode !== false,
          token_type: tokenResult.token_type || '',
          token_expires_in: tokenResult.expires_in || '',
        },
        actorUserId: user.id,
      })

      return jsonResponse({
        success: true,
        message: successMessage,
        gateway,
        mode: credentials.test_mode === false ? 'live' : 'test',
      })
    }

    if (gateway === 'razorpay') {
      if (!credentials.public_key) {
        const failureMessage = 'Razorpay key ID is missing. Save this restaurant’s Razorpay key ID in the Public key field.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: failureMessage }, 400)
      }

      const razorpayResponse = await fetch('https://api.razorpay.com/v1/payments?count=1', {
        method: 'GET',
        headers: {
          Authorization: `Basic ${encodeBasicAuth(credentials.public_key, credentials.access_token)}`,
        },
      })

      const razorpayJson = await razorpayResponse.json().catch(() => ({}))

      if (!razorpayResponse.ok) {
        const failureMessage =
          razorpayJson?.error?.description ||
          razorpayJson?.error?.reason ||
          'Razorpay credential test failed. Check this restaurant’s Razorpay key ID, key secret and mode.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          metadata: { response_code: razorpayJson?.error?.code || '', response_reason: razorpayJson?.error?.reason || '' },
          actorUserId: user.id,
        })

        return jsonResponse(
          { success: false, message: failureMessage, details: sanitizeRazorpayResponse(razorpayJson) },
          502,
        )
      }

      const successMessage = 'Razorpay connection test passed. This restaurant’s own Razorpay keys can create payment links.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: true,
        message: successMessage,
        status: 'tested',
        metadata: {
          test_mode: credentials.test_mode !== false,
          has_payments_list: Array.isArray(razorpayJson?.items),
          count: Number(razorpayJson?.count || 0),
        },
        actorUserId: user.id,
      })

      return jsonResponse({
        success: true,
        message: successMessage,
        gateway,
        mode: credentials.test_mode === false ? 'live' : 'test',
        payments_count_checked: Number(razorpayJson?.count || 0),
      })
    }

    if (gateway === 'cashfree') {
      if (!credentials.public_key) {
        const failureMessage = 'Cashfree client ID is missing. Save this restaurant’s Cashfree client ID in the Public key field.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: failureMessage }, 400)
      }

      const cashfreeBaseUrl = credentials.test_mode === false
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg'

      const cashfreeResponse = await fetch(`${cashfreeBaseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': '2025-01-01',
          'x-client-id': credentials.public_key,
          'x-client-secret': credentials.access_token,
        },
        body: JSON.stringify({
          order_id: `spizy_test_${Date.now()}`.slice(0, 45),
          order_amount: 1,
          order_currency: 'INR',
          customer_details: {
            customer_id: `spizy_test_${Date.now()}`.slice(0, 45),
            customer_phone: '9999999999',
          },
          order_meta: {
            return_url: `${Deno.env.get('PUBLIC_SITE_URL') || 'https://spizy.site'}/payment/failed?gateway=cashfree&ref={order_id}`,
          },
          order_tags: {
            source: 'spizy_menu_connection_test',
          },
        }),
      })

      const cashfreeJson = await cashfreeResponse.json().catch(() => ({}))

      if (!cashfreeResponse.ok) {
        const failureMessage =
          cashfreeJson?.message ||
          cashfreeJson?.error_description ||
          cashfreeJson?.error ||
          'Cashfree credential test failed. Check this restaurant’s Cashfree client ID, client secret and mode.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          metadata: { response_code: cashfreeJson?.code || '', response_type: cashfreeJson?.type || '' },
          actorUserId: user.id,
        })

        return jsonResponse(
          { success: false, message: failureMessage, details: sanitizeCashfreeResponse(cashfreeJson) },
          502,
        )
      }

      const successMessage = 'Cashfree connection test passed. This restaurant’s own Cashfree client ID and secret can create checkout orders.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: true,
        message: successMessage,
        status: 'tested',
        metadata: {
          test_mode: credentials.test_mode !== false,
          cf_order_id: cashfreeJson?.cf_order_id || '',
          has_payment_session_id: Boolean(cashfreeJson?.payment_session_id),
        },
        actorUserId: user.id,
      })

      return jsonResponse({
        success: true,
        message: successMessage,
        gateway,
        mode: credentials.test_mode === false ? 'live' : 'test',
        cf_order_id: cashfreeJson?.cf_order_id || '',
      })
    }


    if (gateway === 'network') {
      if (!credentials.public_key) {
        const failureMessage = 'Network / N-Genius Outlet Reference is missing. Save this restaurant’s Outlet Reference in the Public key field.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: failureMessage }, 400)
      }

      const networkBase = getNetworkBaseUrls(credentials.test_mode !== false)
      const tokenResult = await fetchNetworkAccessToken({
        identityBaseUrl: networkBase.identityBaseUrl,
        apiKey: credentials.access_token,
      })

      if (!tokenResult.success) {
        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: tokenResult.message,
          status: 'test_failed',
          metadata: { network_error_code: tokenResult.code || '' },
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: tokenResult.message, details: tokenResult.details || {} }, 502)
      }

      const successMessage = 'Network / N-Genius connection test passed. This restaurant’s own API key can generate an access token.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: true,
        message: successMessage,
        status: 'tested',
        metadata: {
          test_mode: credentials.test_mode !== false,
          outlet_reference_saved: Boolean(credentials.public_key),
          token_expires_in: tokenResult.expires_in || '',
        },
        actorUserId: user.id,
      })

      return jsonResponse({
        success: true,
        message: successMessage,
        gateway,
        mode: credentials.test_mode === false ? 'live' : 'test',
        outlet_reference: credentials.public_key,
      })
    }


    if (gateway === 'phonepe') {
      if (!credentials.public_key) {
        const failureMessage = 'PhonePe Client ID is missing. Save this restaurant’s PhonePe Client ID in the Public key field.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: failureMessage }, 400)
      }

      const phonepeMetadata = normalizeObject(credentials.metadata)
      const clientVersion = cleanString(phonepeMetadata.client_version)

      if (!clientVersion) {
        const failureMessage = 'PhonePe Client Version is missing. Save the Client Version from this restaurant’s PhonePe dashboard.'

        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: failureMessage,
          status: 'test_failed',
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: failureMessage }, 400)
      }

      const phonepeBase = getPhonePeBaseUrls(credentials.test_mode !== false)
      const tokenResult = await fetchPhonePeAccessToken({
        authBaseUrl: phonepeBase.authBaseUrl,
        clientId: credentials.public_key,
        clientSecret: credentials.access_token,
        clientVersion,
      })

      if (!tokenResult.success) {
        await updateCredentialAndPublicStatus({
          serviceClient,
          restaurant,
          credentialId: credentials.id,
          gateway,
          success: false,
          message: tokenResult.message,
          status: 'test_failed',
          metadata: { phonepe_error_code: tokenResult.code || '' },
          actorUserId: user.id,
        })

        return jsonResponse({ success: false, message: tokenResult.message, details: tokenResult.details || {} }, 502)
      }

      const successMessage = 'PhonePe connection test passed. This restaurant’s own PhonePe credentials can generate an authorization token.'

      await updateCredentialAndPublicStatus({
        serviceClient,
        restaurant,
        credentialId: credentials.id,
        gateway,
        success: true,
        message: successMessage,
        status: 'tested',
        metadata: {
          test_mode: credentials.test_mode !== false,
          token_type: tokenResult.token_type || '',
          expires_at: tokenResult.expires_at || '',
        },
        actorUserId: user.id,
      })

      return jsonResponse({
        success: true,
        message: successMessage,
        gateway,
        mode: credentials.test_mode === false ? 'live' : 'test',
        token_type: tokenResult.token_type || '',
      })
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
        actorUserId: user.id,
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
      actorUserId: user.id,
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
  actorUserId = '',
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

  await writeGatewayAuditLog({
    serviceClient,
    restaurantId: restaurant.id,
    gateway,
    actorUserId,
    action: 'test_connection',
    status: success ? 'success' : 'failed',
    message,
    metadata,
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
      actor_user_id: actorUserId || null,
      status,
      message,
      metadata,
    })
  } catch {
    // Audit logging must not block gateway connection tests.
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

function formatGatewayName(gateway = '') {
  const labels: Record<string, string> = {
    ziina: 'Ziina',
    stripe: 'Stripe',
    cashfree: 'Cashfree',
    razorpay: 'Razorpay',
    paypal: 'PayPal',
    network: 'Network / N-Genius',
    phonepe: 'PhonePe',
  }

  const normalizedGateway = String(gateway || '').toLowerCase()
  return labels[normalizedGateway] || normalizedGateway.toUpperCase()
}

function sanitizeStripeAccountResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    id: incoming.id || '',
    country: incoming.country || '',
    charges_enabled: Boolean(incoming.charges_enabled),
    payouts_enabled: Boolean(incoming.payouts_enabled),
    error: incoming.error
      ? {
          type: incoming.error.type || '',
          code: incoming.error.code || '',
          message: incoming.error.message || '',
        }
      : null,
  }
}

function encodeBasicAuth(username = '', password = '') {
  return btoa(`${username}:${password}`)
}

function sanitizeRazorpayResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    count: Number(incoming.count || 0),
    error: incoming.error
      ? {
          code: incoming.error.code || '',
          reason: incoming.error.reason || '',
          description: incoming.error.description || '',
        }
      : null,
  }
}

function sanitizeCashfreeResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    code: incoming.code || '',
    type: incoming.type || '',
    message: incoming.message || incoming.error_description || incoming.error || '',
  }
}


function getPayPalBaseUrl(testMode = true) {
  return testMode ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
}

async function fetchPayPalAccessToken({ baseUrl, clientId, clientSecret }) {
  const formData = new URLSearchParams()
  formData.set('grant_type', 'client_credentials')

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodeBasicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formData.toString(),
  })

  const json = await response.json().catch(() => ({}))

  if (!response.ok || !json?.access_token) {
    return {
      success: false,
      message:
        json?.error_description ||
        json?.error ||
        'PayPal access token request failed. Check this restaurant’s PayPal Client ID, Client Secret and mode.',
      code: json?.error || '',
      details: sanitizePayPalResponse(json),
    }
  }

  return {
    success: true,
    access_token: json.access_token,
    token_type: json.token_type || '',
    expires_in: json.expires_in || '',
  }
}

function sanitizePayPalResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    id: incoming.id || '',
    status: incoming.status || '',
    error: incoming.error || '',
    error_description: incoming.error_description || incoming.message || '',
    name: incoming.name || '',
    message: incoming.message || '',
  }
}

function getNetworkBaseUrls(testMode = true) {
  if (testMode) {
    return {
      identityBaseUrl: 'https://api-gateway.sandbox.ngenius-payments.com',
      paymentBaseUrl: 'https://api-gateway.sandbox.ngenius-payments.com',
    }
  }

  return {
    identityBaseUrl: 'https://api-gateway.ngenius-payments.com',
    paymentBaseUrl: 'https://api-gateway.ngenius-payments.com',
  }
}

async function fetchNetworkAccessToken({ identityBaseUrl, apiKey }) {
  const response = await fetch(`${identityBaseUrl}/identity/auth/access-token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/vnd.ni-identity.v1+json',
      Accept: 'application/vnd.ni-identity.v1+json',
    },
  })

  const json = await response.json().catch(() => ({}))

  if (!response.ok || !json?.access_token) {
    return {
      success: false,
      message:
        json?.message ||
        json?.error_description ||
        json?.error ||
        'Network / N-Genius access token request failed. Check this restaurant’s API key and environment.',
      code: json?.error || json?.code || '',
      details: sanitizeNetworkResponse(json),
    }
  }

  return {
    success: true,
    access_token: json.access_token,
    expires_in: json.expires_in || '',
  }
}

function sanitizeNetworkResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    code: incoming.code || incoming.error || '',
    message: incoming.message || incoming.error_description || incoming.error || '',
  }
}


function getPhonePeBaseUrls(testMode = true) {
  if (testMode) {
    return {
      authBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
      checkoutBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    }
  }

  return {
    authBaseUrl: 'https://api.phonepe.com/apis/identity-manager',
    checkoutBaseUrl: 'https://api.phonepe.com/apis/pg',
  }
}

async function fetchPhonePeAccessToken({ authBaseUrl, clientId, clientSecret, clientVersion }) {
  const formData = new URLSearchParams()
  formData.set('client_id', clientId)
  formData.set('client_version', clientVersion)
  formData.set('client_secret', clientSecret)
  formData.set('grant_type', 'client_credentials')

  const response = await fetch(`${authBaseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  })

  const json = await response.json().catch(() => ({}))

  if (!response.ok || !json?.access_token) {
    return {
      success: false,
      message:
        json?.message ||
        json?.error_description ||
        json?.error ||
        'PhonePe authorization token request failed. Check this restaurant’s Client ID, Client Secret, Client Version and mode.',
      code: json?.code || json?.error || '',
      details: sanitizePhonePeResponse(json),
    }
  }

  return {
    success: true,
    access_token: json.access_token,
    token_type: json.token_type || 'O-Bearer',
    expires_at: json.expires_at || json.session_expires_at || '',
  }
}

function sanitizePhonePeResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    code: incoming.code || incoming.error || '',
    message: incoming.message || incoming.error_description || '',
    state: incoming.state || '',
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
