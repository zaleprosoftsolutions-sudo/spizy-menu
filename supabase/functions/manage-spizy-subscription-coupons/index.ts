import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'Supabase environment is missing.' }, 500)

    const authorization = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user
    if (userError || !user) return jsonResponse({ error: 'Login required.' }, 401)
    if (!isSuperAdminUser(user)) return jsonResponse({ error: 'Only super admin can manage subscription coupons.' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'list').toLowerCase()

    if (action === 'list') {
      const { data, error } = await adminClient
        .from('spizy_subscription_discount_coupons')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) return jsonResponse({ error: error.message }, 500)
      return jsonResponse({ success: true, coupons: data || [] })
    }

    if (action === 'upsert') {
      const coupon = normalizeCouponPayload(body.coupon || {}, user.id)
      if (!coupon.code) return jsonResponse({ error: 'Coupon code is required.' }, 400)
      if (!coupon.coupon_name) return jsonResponse({ error: 'Coupon name is required.' }, 400)

      const { data, error } = await adminClient
        .from('spizy_subscription_discount_coupons')
        .upsert(coupon, { onConflict: 'code' })
        .select('*')
        .single()
      if (error) return jsonResponse({ error: error.message }, 500)
      return jsonResponse({ success: true, coupon: data })
    }

    if (action === 'toggle') {
      const couponId = String(body.coupon_id || '').trim()
      const isActive = Boolean(body.is_active)
      if (!couponId) return jsonResponse({ error: 'coupon_id is required.' }, 400)
      const { data, error } = await adminClient
        .from('spizy_subscription_discount_coupons')
        .update({ is_active: isActive, updated_by: user.id })
        .eq('id', couponId)
        .select('*')
        .single()
      if (error) return jsonResponse({ error: error.message }, 500)
      return jsonResponse({ success: true, coupon: data })
    }

    return jsonResponse({ error: 'Unsupported action.' }, 400)
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unexpected coupon management error.' }, 500)
  }
})

function isSuperAdminUser(user: any) {
  const role = String(user?.app_metadata?.role || user?.user_metadata?.role || '').toLowerCase()
  return ['super_admin', 'partner_admin'].includes(role)
}

function normalizeCouponPayload(source: any, userId: string) {
  return {
    id: source.id || undefined,
    code: String(source.code || '').trim().replace(/\s+/g, '').toUpperCase(),
    coupon_name: String(source.coupon_name || source.name || '').trim(),
    description: String(source.description || '').trim() || null,
    discount_type: ['percentage', 'fixed_amount'].includes(String(source.discount_type)) ? source.discount_type : 'percentage',
    discount_value: Number(source.discount_value || 0),
    currency: String(source.currency || 'AED').trim().toUpperCase(),
    applicable_plan_keys: Array.isArray(source.applicable_plan_keys) && source.applicable_plan_keys.length > 0 ? source.applicable_plan_keys : ['qr_menu_monthly', 'qr_menu_yearly'],
    max_redemptions: source.max_redemptions ? Number(source.max_redemptions) : null,
    starts_at: source.starts_at || null,
    ends_at: source.ends_at || null,
    is_active: source.is_active !== false,
    created_by: source.id ? undefined : userId,
    updated_by: userId,
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
