import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function money(value: unknown) {
  const numberValue = Number(value || 0)
  if (!Number.isFinite(numberValue)) return 0
  return Math.round(numberValue * 100) / 100
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const authorization = req.headers.get('Authorization') || ''

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      throw new Error('Server configuration or login session is missing.')
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()

    if (userError || !userData?.user?.id) {
      throw new Error('Please login again before posting finance snapshot.')
    }

    const body = await req.json()
    const restaurantId = String(body?.restaurant_id || '')

    if (!restaurantId) {
      throw new Error('Restaurant is required.')
    }

    const { data: membership } = await adminClient
      .from('restaurant_members')
      .select('id, role')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userData.user.id)
      .maybeSingle()

    const role = String(membership?.role || '')

    let isAllowed = ['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'].includes(role)

    if (!isAllowed) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle()

      isAllowed = ['super_admin', 'partner_admin'].includes(String(profile?.role || ''))
    }

    if (!isAllowed) {
      throw new Error('You do not have permission to post finance snapshots for this restaurant.')
    }

    const totals = body?.totals || {}
    const gatewayRows = Array.isArray(body?.gateway_rows) ? body.gateway_rows : []
    const warningRows = Array.isArray(body?.warning_rows) ? body.warning_rows : []

    const payload = {
      restaurant_id: restaurantId,
      currency: String(body?.currency || 'AED').slice(0, 12),
      source: String(body?.source || 'orders_reconciliation').slice(0, 80),
      status: 'posted',
      collected_amount: money(totals.collected),
      pending_amount: money(totals.pending),
      cod_pending_amount: money(totals.codPending),
      online_pending_amount: money(totals.onlinePending),
      refunded_amount: money(totals.refunded),
      cancelled_unpaid_amount: money(totals.cancelledUnpaid),
      net_collected_amount: money(totals.netCollected),
      totals,
      gateway_breakdown: gatewayRows,
      warning_items: warningRows,
      notes: 'Posted from Admin Orders payment reconciliation panel.',
      posted_by: userData.user.id,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data: inserted, error: insertError } = await adminClient
      .from('restaurant_payment_finance_postings')
      .insert(payload)
      .select('*')
      .single()

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({
        success: true,
        posting: inserted,
        message: 'Finance collection snapshot posted successfully.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: error?.message || 'Unable to post finance snapshot.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
