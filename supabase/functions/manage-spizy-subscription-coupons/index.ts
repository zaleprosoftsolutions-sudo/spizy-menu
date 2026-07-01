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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase service environment is missing.' }, 500)
    }

    const authorization = req.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Login required.' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const requester = await getRequester(adminClient, authorization)

    if (requester.role !== 'super_admin') {
      return jsonResponse({ error: 'Only super admin can manage subscription coupons.', detected_role: requester.role || 'none' }, 403)
    }

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
      const coupon = normalizeCouponPayload(body.coupon || {}, requester.userId)

      if (!coupon.code) return jsonResponse({ error: 'Coupon code is required.' }, 400)
      if (!coupon.coupon_name) return jsonResponse({ error: 'Coupon name is required.' }, 400)
      if (!Number.isFinite(coupon.discount_value) || coupon.discount_value <= 0) {
        return jsonResponse({ error: 'Discount value must be greater than zero.' }, 400)
      }

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
        .update({ is_active: isActive, updated_by: requester.userId })
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

async function getRequester(adminClient: any, authHeader: string) {
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return { role: '', userId: '' }

  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
  const user = userData?.user

  if (userError || !user) return { role: '', userId: '' }

  // Supabase JWT app_metadata.role is often "authenticated". Do not treat that
  // as the product role. The app dashboard already reads role from profiles,
  // so Edge Functions must use the same source for Super Admin checks.
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const profileRole = String(profile?.role || '').trim()
  if (profileRole) return { role: profileRole, userId: user.id }

  const metadataRole = String(user.user_metadata?.role || user.app_metadata?.app_role || '').trim()
  return { role: metadataRole, userId: user.id }
}

function normalizeCouponPayload(source: any, userId: string) {
  const code = String(source.code || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()

  const planKeys = Array.isArray(source.applicable_plan_keys)
    ? source.applicable_plan_keys
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => ['qr_menu_monthly', 'qr_menu_yearly'].includes(value))
    : []

  const payload: Record<string, unknown> = {
    code,
    coupon_name: String(source.coupon_name || source.name || '').trim(),
    description: String(source.description || '').trim() || null,
    discount_type: ['percentage', 'fixed_amount'].includes(String(source.discount_type))
      ? source.discount_type
      : 'fixed_amount',
    discount_value: Number(source.discount_value || 0),
    currency: String(source.currency || 'AED').trim().toUpperCase(),
    applicable_plan_keys: planKeys.length > 0 ? planKeys : ['qr_menu_monthly', 'qr_menu_yearly'],
    max_redemptions: source.max_redemptions ? Number(source.max_redemptions) : null,
    starts_at: source.starts_at || null,
    ends_at: source.ends_at || null,
    is_active: source.is_active !== false,
    updated_by: userId,
  }

  if (source.id) payload.id = source.id
  else payload.created_by = userId

  return payload
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
