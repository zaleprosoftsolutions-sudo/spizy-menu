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
    const mamoApiKey = Deno.env.get('MAMO_API_KEY') || ''
    const mamoApiBaseUrl = trimTrailingSlash(Deno.env.get('MAMO_API_BASE_URL') || 'https://sandbox.dev.business.mamopay.com/manage_api/v1')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'Supabase Edge Function environment is missing.' }, 500)

    const authorization = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user
    if (userError || !user) return jsonResponse({ error: 'Login required to verify subscription payment.' }, 401)

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || '').trim()
    const attemptId = String(body.attempt_id || '').trim()
    const paymentLinkId = String(body.payment_link_id || body.paymentLinkId || '').trim()
    const transactionId = String(body.transaction_id || body.transactionId || '').trim()
    const redirectStatus = String(body.redirect_status || body.status || '').trim().toLowerCase()

    if (!restaurantId) return jsonResponse({ error: 'restaurant_id is required.' }, 400)

    const hasAccess = await verifyRestaurantAdminAccess(adminClient, restaurantId, user.id)
    if (!hasAccess) return jsonResponse({ error: 'You do not have permission to verify this restaurant subscription.' }, 403)

    let query = adminClient.from('restaurant_subscription_payment_attempts').select('*').eq('restaurant_id', restaurantId)
    if (attemptId) query = query.eq('id', attemptId)
    else if (paymentLinkId) query = query.eq('mamo_link_id', paymentLinkId)
    else if (transactionId) query = query.eq('mamo_transaction_id', transactionId)
    else return jsonResponse({ error: 'attempt_id, payment_link_id or transaction_id is required.' }, 400)

    const { data: attempt, error: attemptError } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (attemptError || !attempt) return jsonResponse({ error: attemptError?.message || 'Subscription payment attempt not found.' }, 404)

    let chargeResponse = null
    let chargeStatus = ''

    if (transactionId && mamoApiKey) {
      const chargeResult = await fetch(`${mamoApiBaseUrl}/charges/${encodeURIComponent(transactionId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${mamoApiKey}`, 'Content-Type': 'application/json' },
      })
      chargeResponse = await chargeResult.json().catch(() => ({}))
      chargeStatus = normalizeStatus(extractFirstString(chargeResponse, ['status', 'payment_status', 'charge_status', 'state']))
    }

    const normalizedRedirectStatus = normalizeStatus(redirectStatus)
    const finalStatus = chargeStatus || normalizedRedirectStatus || normalizeStatus(attempt.status)
    const isCaptured = ['captured', 'paid', 'succeeded', 'success', 'settled', 'completed'].includes(finalStatus)
    const nextAttemptStatus = isCaptured ? 'captured' : ['failed', 'cancelled', 'expired'].includes(finalStatus) ? finalStatus : 'manual_review'

    const updatePayload: Record<string, unknown> = {
      status: nextAttemptStatus,
      mamo_status: finalStatus || redirectStatus || null,
      mamo_transaction_id: transactionId || attempt.mamo_transaction_id || null,
      mamo_link_id: paymentLinkId || attempt.mamo_link_id || null,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    }

    if (chargeResponse) updatePayload.raw_response = { ...(attempt.raw_response || {}), verification_charge_response: chargeResponse }

    const { data: updatedAttempt, error: updateError } = await adminClient
      .from('restaurant_subscription_payment_attempts')
      .update(updatePayload)
      .eq('id', attempt.id)
      .select('*')
      .single()

    if (updateError) return jsonResponse({ error: updateError.message }, 500)

    if (!isCaptured) return jsonResponse({ success: true, status: nextAttemptStatus, message: 'Payment is not captured yet. Review the Mamo dashboard if needed.', attempt: updatedAttempt })

    const periodStart = updatedAttempt.billing_period_start || toDateKey(new Date())
    const days = String(updatedAttempt.billing_cycle || '').toLowerCase() === 'yearly' ? 365 : 30
    const periodEnd = updatedAttempt.billing_period_end || addDaysDateKey(new Date(), days)
    const graceUntil = updatedAttempt.grace_until || addDaysDateKey(new Date(), days + 7)
    const paidAt = new Date().toISOString()

    await adminClient
      .from('restaurants')
      .update({
        subscription_plan: updatedAttempt.plan_key,
        subscription_status: 'active',
        subscription_current_period_start: periodStart,
        subscription_current_period_end: periodEnd,
        subscription_grace_until: graceUntil,
        subscription_cancel_at_period_end: false,
        subscription_last_payment_at: paidAt,
        subscription_payment_gateway: 'mamo_pay',
      })
      .eq('id', restaurantId)

    const invoiceNumber = `SPIZY-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`
    const { data: existingInvoice } = await adminClient.from('restaurant_subscription_invoices').select('id').eq('attempt_id', updatedAttempt.id).maybeSingle()

    let invoice = existingInvoice
    if (!existingInvoice) {
      const { data: insertedInvoice } = await adminClient
        .from('restaurant_subscription_invoices')
        .insert({
          restaurant_id: restaurantId,
          attempt_id: updatedAttempt.id,
          invoice_number: invoiceNumber,
          plan_key: updatedAttempt.plan_key,
          plan_name: updatedAttempt.plan_name,
          billing_cycle: updatedAttempt.billing_cycle,
          original_amount: updatedAttempt.original_amount || updatedAttempt.amount,
          discount_amount: updatedAttempt.discount_amount || 0,
          coupon_id: updatedAttempt.coupon_id || null,
          coupon_code: updatedAttempt.coupon_code || null,
          amount: updatedAttempt.amount,
          currency: updatedAttempt.currency || 'AED',
          status: 'paid',
          payment_gateway: 'mamo_pay',
          gateway_transaction_id: transactionId || updatedAttempt.mamo_transaction_id || null,
          period_start: periodStart,
          period_end: periodEnd,
          paid_at: paidAt,
          metadata: {
            source: 'mamo_subscription_verification',
            payment_link_id: paymentLinkId || updatedAttempt.mamo_link_id || null,
            transaction_id: transactionId || updatedAttempt.mamo_transaction_id || null,
            redirect_status: redirectStatus || null,
          },
        })
        .select('id')
        .maybeSingle()
      invoice = insertedInvoice || null
    }

    if (updatedAttempt.coupon_id && updatedAttempt.coupon_code) {
      const { data: existingRedemption } = await adminClient
        .from('spizy_subscription_coupon_redemptions')
        .select('id')
        .eq('attempt_id', updatedAttempt.id)
        .maybeSingle()

      if (!existingRedemption) {
        await adminClient.from('spizy_subscription_coupon_redemptions').insert({
          coupon_id: updatedAttempt.coupon_id,
          restaurant_id: restaurantId,
          attempt_id: updatedAttempt.id,
          invoice_id: invoice?.id || null,
          coupon_code: updatedAttempt.coupon_code,
          plan_key: updatedAttempt.plan_key,
          original_amount: updatedAttempt.original_amount || updatedAttempt.amount,
          discount_amount: updatedAttempt.discount_amount || 0,
          final_amount: updatedAttempt.amount,
          redeemed_by: user.id,
          metadata: { source: 'mamo_subscription_verification' },
        })

        await adminClient.rpc('increment_spizy_coupon_redeemed_count', { p_coupon_id: updatedAttempt.coupon_id }).catch(async () => {
          const { data: currentCoupon } = await adminClient.from('spizy_subscription_discount_coupons').select('redeemed_count').eq('id', updatedAttempt.coupon_id).maybeSingle()
          await adminClient.from('spizy_subscription_discount_coupons').update({ redeemed_count: Number(currentCoupon?.redeemed_count || 0) + 1 }).eq('id', updatedAttempt.coupon_id)
        })
      }
    }

    return jsonResponse({ success: true, status: 'captured', message: 'Mamo Pay subscription payment verified and restaurant subscription activated.', attempt: updatedAttempt })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unexpected Mamo verification error.' }, 500)
  }
})

async function verifyRestaurantAdminAccess(adminClient: any, restaurantId: string, userId: string) {
  const { data, error } = await adminClient.from('restaurant_members').select('id, role').eq('restaurant_id', restaurantId).eq('user_id', userId).limit(1)
  if (error) throw error
  return (data || []).some((row: any) => ['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'].includes(String(row.role || '')))
}

function jsonResponse(payload: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
function trimTrailingSlash(value: string) { return String(value || '').replace(/\/+$/, '') }
function normalizeStatus(value: string) { const normalized = String(value || '').trim().toLowerCase(); if (['captured', 'paid', 'succeeded', 'success', 'settled', 'completed'].includes(normalized)) return 'captured'; if (['fail', 'failed', 'declined', 'error'].includes(normalized)) return 'failed'; if (['cancel', 'cancelled', 'canceled'].includes(normalized)) return 'cancelled'; if (['expire', 'expired'].includes(normalized)) return 'expired'; return normalized }
function extractFirstString(source: any, keys: string[]) { for (const key of keys) { const value = source?.[key]; if (typeof value === 'string' && value.trim()) return value.trim() } for (const key of keys) { const value = source?.data?.[key]; if (typeof value === 'string' && value.trim()) return value.trim() } return '' }
function toDateKey(date: Date) { return date.toISOString().slice(0, 10) }
function addDaysDateKey(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return toDateKey(next) }
