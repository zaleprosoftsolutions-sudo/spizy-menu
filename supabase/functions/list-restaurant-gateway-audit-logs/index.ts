// Supabase Edge Function: list-restaurant-gateway-audit-logs
// Returns public-safe gateway audit history for a restaurant owner/staff user.
// Never returns secret gateway credentials.

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
    const limit = Math.min(Math.max(Number(body.limit || 12), 1), 50)

    if (!restaurantId) {
      return jsonResponse({ success: false, message: 'Restaurant ID is required.' }, 400)
    }

    if (gateway && !['ziina', 'stripe', 'paypal', 'network', 'cashfree', 'razorpay', 'phonepe'].includes(gateway)) {
      return jsonResponse({ success: false, message: 'Unsupported gateway.' }, 400)
    }

    const hasAccess = await userCanManageRestaurant({
      serviceClient,
      restaurantId,
      userId: user.id,
    })

    if (!hasAccess) {
      return jsonResponse(
        { success: false, message: 'You do not have permission to view this restaurant gateway history.' },
        403,
      )
    }

    let query = serviceClient
      .from('restaurant_gateway_audit_logs')
      .select('id, restaurant_id, gateway, action, actor_user_id, status, message, metadata, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (gateway) {
      query = query.eq('gateway', gateway)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ success: false, message: error.message }, 500)
    }

    const logs = (data || []).map((log) => ({
      id: log.id,
      restaurant_id: log.restaurant_id,
      gateway: log.gateway,
      action: log.action,
      actor_user_id: log.actor_user_id,
      status: log.status,
      message: log.message,
      metadata: sanitizeAuditMetadata(log.metadata),
      created_at: log.created_at,
    }))

    return jsonResponse({ success: true, logs })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to load gateway history.' },
      500,
    )
  }
})

function cleanString(value: unknown) {
  return String(value || '').trim()
}

function sanitizeAuditMetadata(value: unknown) {
  const metadata = value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}

  delete metadata.access_token
  delete metadata.webhook_secret
  delete metadata.secret
  delete metadata.token
  delete metadata.authorization

  return metadata
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
    const { data: membership } = await serviceClient
      .from('restaurant_members')
      .select('id, role, is_active')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (membership?.id) return true
  } catch {
    // membership table unavailable; continue to owner_id fallback.
  }

  try {
    const { data: restaurant } = await serviceClient
      .from('restaurants')
      .select('id, owner_id')
      .eq('id', restaurantId)
      .maybeSingle()

    return restaurant?.owner_id === userId
  } catch {
    return false
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
