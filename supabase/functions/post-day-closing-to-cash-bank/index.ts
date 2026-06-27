import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

type AnyRow = Record<string, any>

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function toMoney(value: unknown) {
  const numberValue = Number(value || 0)
  if (!Number.isFinite(numberValue)) return 0
  return Math.round(numberValue * 100) / 100
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10)
}

async function assertRestaurantAccess(
  serviceClient: ReturnType<typeof createClient>,
  restaurantId: string,
  userId: string,
) {
  const { data: memberRows } = await serviceClient
    .from('restaurant_members')
    .select('id, role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .limit(1)

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  const memberRole = String(memberRows?.[0]?.role || '')
  const profileRole = String(profile?.role || '')
  const allowedRoles = new Set([
    'owner',
    'restaurant_owner',
    'admin',
    'manager',
    'partner_admin',
    'super_admin',
  ])

  return allowedRoles.has(memberRole) || allowedRoles.has(profileRole)
}

async function getOrCreateAccount({
  serviceClient,
  restaurantId,
  userId,
  accountType,
  accountName,
  currency,
}: {
  serviceClient: ReturnType<typeof createClient>
  restaurantId: string
  userId: string
  accountType: string
  accountName: string
  currency: string
}) {
  const { data: existing } = await serviceClient
    .from('restaurant_finance_accounts')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('account_type', accountType)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)

  if (existing?.[0]?.id) return existing[0]

  const { data, error } = await serviceClient
    .from('restaurant_finance_accounts')
    .insert({
      restaurant_id: restaurantId,
      account_name: accountName,
      account_type: accountType,
      currency,
      opening_balance: 0,
      current_balance: 0,
      notes: 'Auto-created by Day Closing → Cash & Bank posting.',
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

async function insertLedgerEntry({
  serviceClient,
  restaurantId,
  accountId,
  userId,
  closingDate,
  transactionType,
  amount,
  title,
  description,
  postingId,
  snapshotId,
  metadata,
}: {
  serviceClient: ReturnType<typeof createClient>
  restaurantId: string
  accountId: string
  userId: string
  closingDate: string
  transactionType: string
  amount: number
  title: string
  description: string
  postingId: string
  snapshotId: string
  metadata: Record<string, unknown>
}) {
  if (amount <= 0) return null

  const { data, error } = await serviceClient
    .from('restaurant_account_transactions')
    .insert({
      restaurant_id: restaurantId,
      account_id: accountId,
      transaction_type: transactionType,
      amount,
      transaction_date: closingDate,
      title,
      description,
      source_type: 'day_closing_cash_bank_posting',
      source_id: postingId,
      reference_type: 'day_closing_payment_snapshot',
      reference_id: snapshotId,
      external_reference: `DAY-CLOSE-${closingDate}`,
      metadata,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Supabase environment is not configured.' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || ''

    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header.' }, 401)
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: userData, error: userError } = await userClient.auth.getUser()

    if (userError || !userData?.user?.id) {
      return jsonResponse({ error: 'Invalid user session.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || body.restaurantId || '')
    const closingDate = normalizeDate(String(body.closing_date || body.closingDate || ''))

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurant_id is required.' }, 400)
    }

    const allowed = await assertRestaurantAccess(serviceClient, restaurantId, userData.user.id)

    if (!allowed) {
      return jsonResponse({ error: 'You do not have permission to post this closing.' }, 403)
    }

    const { data: restaurant } = await serviceClient
      .from('restaurants')
      .select('id, name, currency')
      .eq('id', restaurantId)
      .maybeSingle()

    if (!restaurant?.id) {
      return jsonResponse({ error: 'Restaurant not found.' }, 404)
    }

    const { data: existingPosting } = await serviceClient
      .from('restaurant_day_closing_cash_bank_postings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('closing_date', closingDate)
      .maybeSingle()

    if (existingPosting?.status === 'posted') {
      return jsonResponse({
        ok: true,
        already_posted: true,
        posting: existingPosting,
        message: 'This day closing is already posted to Cash & Bank. Duplicate posting is blocked.',
      })
    }

    const { data: snapshot, error: snapshotError } = await serviceClient
      .from('restaurant_day_closing_payment_snapshots')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('closing_date', closingDate)
      .maybeSingle()

    if (snapshotError) {
      return jsonResponse({ error: snapshotError.message }, 400)
    }

    if (!snapshot?.id) {
      return jsonResponse({ error: 'Create a payment snapshot before posting to Cash & Bank.' }, 400)
    }

    const { data: closing } = await serviceClient
      .from('restaurant_day_closings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('closing_date', closingDate)
      .maybeSingle()

    const currency = String(snapshot.currency || restaurant.currency || 'AED')
    const cashExtraCollections = toMoney(closing?.cash_collections)
    const cashAmount = toMoney(toMoney(snapshot.cash_collected) + toMoney(snapshot.cod_collected) + cashExtraCollections)
    const cardAmount = Math.max(toMoney(snapshot.card_collected), toMoney(closing?.card_total))
    const onlineAmount = Math.max(toMoney(snapshot.online_collected), toMoney(closing?.online_total))
    const refundAmount = toMoney(snapshot.refund_total)
    const cashDifferenceAmount = toMoney(closing?.cash_difference)

    const totalPostedIn = toMoney(cashAmount + cardAmount + onlineAmount + Math.max(cashDifferenceAmount, 0))
    const totalPostedOut = toMoney(refundAmount + Math.abs(Math.min(cashDifferenceAmount, 0)))
    const netPosted = toMoney(totalPostedIn - totalPostedOut)

    if (totalPostedIn <= 0 && totalPostedOut <= 0) {
      return jsonResponse({
        error: 'No collected, refund or cash difference amount is available to post.',
      }, 400)
    }

    const cashAccount = await getOrCreateAccount({
      serviceClient,
      restaurantId,
      userId: userData.user.id,
      accountType: 'cash',
      accountName: 'Main Cash Drawer',
      currency,
    })
    const cardAccount = await getOrCreateAccount({
      serviceClient,
      restaurantId,
      userId: userData.user.id,
      accountType: 'card_machine',
      accountName: 'Card Machine Settlement',
      currency,
    })
    const onlineAccount = await getOrCreateAccount({
      serviceClient,
      restaurantId,
      userId: userData.user.id,
      accountType: 'online_gateway',
      accountName: 'Online Gateway Clearing',
      currency,
    })

    const postingSeed = {
      restaurant_id: restaurantId,
      closing_date: closingDate,
      day_closing_id: closing?.id || null,
      payment_snapshot_id: snapshot.id,
      currency,
      cash_amount: cashAmount,
      card_amount: cardAmount,
      online_amount: onlineAmount,
      refund_amount: refundAmount,
      cash_difference_amount: cashDifferenceAmount,
      total_posted_in: totalPostedIn,
      total_posted_out: totalPostedOut,
      net_posted: netPosted,
      cash_account_id: cashAccount.id,
      card_account_id: cardAccount.id,
      online_gateway_account_id: onlineAccount.id,
      status: 'posting',
      notes: 'Posting started from Day Closing.',
      raw_payload: {
        snapshot_id: snapshot.id,
        day_closing_id: closing?.id || null,
        restaurant_name: restaurant.name || '',
      },
      posted_by: userData.user.id,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data: posting, error: postingError } = await serviceClient
      .from('restaurant_day_closing_cash_bank_postings')
      .upsert(postingSeed, { onConflict: 'restaurant_id,closing_date' })
      .select('*')
      .single()

    if (postingError) {
      return jsonResponse({ error: postingError.message }, 400)
    }

    const entryIds: string[] = []
    const commonMeta = {
      closing_date: closingDate,
      payment_snapshot_id: snapshot.id,
      day_closing_id: closing?.id || null,
      source: 'day_closing_cash_bank_posting',
    }

    const entries: Array<AnyRow | null> = []

    entries.push(await insertLedgerEntry({
      serviceClient,
      restaurantId,
      accountId: cashAccount.id,
      userId: userData.user.id,
      closingDate,
      transactionType: 'income',
      amount: cashAmount,
      title: `Day closing cash/COD collection - ${closingDate}`,
      description: 'Cash, COD and extra customer cash collections posted from Day Closing.',
      postingId: posting.id,
      snapshotId: snapshot.id,
      metadata: { ...commonMeta, bucket: 'cash_cod_collection' },
    }))

    entries.push(await insertLedgerEntry({
      serviceClient,
      restaurantId,
      accountId: cardAccount.id,
      userId: userData.user.id,
      closingDate,
      transactionType: 'income',
      amount: cardAmount,
      title: `Day closing card collection - ${closingDate}`,
      description: 'Card machine collection posted from Day Closing.',
      postingId: posting.id,
      snapshotId: snapshot.id,
      metadata: { ...commonMeta, bucket: 'card_collection' },
    }))

    entries.push(await insertLedgerEntry({
      serviceClient,
      restaurantId,
      accountId: onlineAccount.id,
      userId: userData.user.id,
      closingDate,
      transactionType: 'income',
      amount: onlineAmount,
      title: `Day closing online gateway collection - ${closingDate}`,
      description: 'Online gateway collection posted from Day Closing.',
      postingId: posting.id,
      snapshotId: snapshot.id,
      metadata: { ...commonMeta, bucket: 'online_gateway_collection' },
    }))

    entries.push(await insertLedgerEntry({
      serviceClient,
      restaurantId,
      accountId: onlineAccount.id,
      userId: userData.user.id,
      closingDate,
      transactionType: 'expense',
      amount: refundAmount,
      title: `Day closing refund adjustment - ${closingDate}`,
      description: 'Refund/adjustment amount recorded from Day Closing. Actual refund is processed in the restaurant-owned gateway account.',
      postingId: posting.id,
      snapshotId: snapshot.id,
      metadata: { ...commonMeta, bucket: 'refund_adjustment' },
    }))

    if (cashDifferenceAmount > 0) {
      entries.push(await insertLedgerEntry({
        serviceClient,
        restaurantId,
        accountId: cashAccount.id,
        userId: userData.user.id,
        closingDate,
        transactionType: 'adjustment_in',
        amount: Math.abs(cashDifferenceAmount),
        title: `Day closing cash surplus - ${closingDate}`,
        description: 'Cash drawer counted higher than expected during Day Closing.',
        postingId: posting.id,
        snapshotId: snapshot.id,
        metadata: { ...commonMeta, bucket: 'cash_surplus' },
      }))
    } else if (cashDifferenceAmount < 0) {
      entries.push(await insertLedgerEntry({
        serviceClient,
        restaurantId,
        accountId: cashAccount.id,
        userId: userData.user.id,
        closingDate,
        transactionType: 'adjustment_out',
        amount: Math.abs(cashDifferenceAmount),
        title: `Day closing cash shortage - ${closingDate}`,
        description: 'Cash drawer counted lower than expected during Day Closing.',
        postingId: posting.id,
        snapshotId: snapshot.id,
        metadata: { ...commonMeta, bucket: 'cash_shortage' },
      }))
    }

    for (const entry of entries) {
      if (entry?.id) entryIds.push(entry.id)
    }

    const { data: savedPosting, error: updatePostingError } = await serviceClient
      .from('restaurant_day_closing_cash_bank_postings')
      .update({
        status: 'posted',
        ledger_entry_ids: entryIds,
        notes: `${entryIds.length} ledger entr${entryIds.length === 1 ? 'y' : 'ies'} posted to Cash & Bank.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', posting.id)
      .select('*')
      .single()

    if (updatePostingError) {
      return jsonResponse({ error: updatePostingError.message }, 400)
    }

    const { data: updatedSnapshot } = await serviceClient
      .from('restaurant_day_closing_payment_snapshots')
      .update({
        posted_to_cash_bank: true,
        posting_status: 'posted',
        cash_bank_posting_id: savedPosting.id,
        cash_bank_posted_at: savedPosting.posted_at,
        cash_bank_posted_by: userData.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', snapshot.id)
      .select('*')
      .maybeSingle()

    let updatedClosing = null

    if (closing?.id) {
      const closingResult = await serviceClient
        .from('restaurant_day_closings')
        .update({
          cash_bank_posting_id: savedPosting.id,
          cash_bank_posting_status: 'posted',
          cash_bank_posted_at: savedPosting.posted_at,
          cash_bank_posted_by: userData.user.id,
        })
        .eq('id', closing.id)
        .select('*')
        .maybeSingle()

      updatedClosing = closingResult.data || null
    }

    return jsonResponse({
      ok: true,
      posting: savedPosting,
      snapshot: updatedSnapshot || snapshot,
      closing: updatedClosing,
      ledger_entry_ids: entryIds,
      message: `Posted ${entryIds.length} Cash & Bank ledger entr${entryIds.length === 1 ? 'y' : 'ies'} for ${closingDate}.`,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unable to post Day Closing to Cash & Bank.',
      },
      500,
    )
  }
})
