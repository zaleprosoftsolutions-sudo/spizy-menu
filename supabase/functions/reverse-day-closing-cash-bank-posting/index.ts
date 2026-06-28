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

function uniqueIds(values: unknown) {
  if (!Array.isArray(values)) return []

  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  )
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
    const reason = String(body.reason || '').trim() || 'Day Closing Cash & Bank posting reversed for correction.'

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurant_id is required.' }, 400)
    }

    const allowed = await assertRestaurantAccess(serviceClient, restaurantId, userData.user.id)

    if (!allowed) {
      return jsonResponse({ error: 'You do not have permission to reverse this posting.' }, 403)
    }

    const { data: posting, error: postingError } = await serviceClient
      .from('restaurant_day_closing_cash_bank_postings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('closing_date', closingDate)
      .maybeSingle()

    if (postingError) {
      return jsonResponse({ error: postingError.message }, 400)
    }

    if (!posting?.id) {
      return jsonResponse({ error: 'No Cash & Bank posting found for this closing date.' }, 404)
    }

    if (posting.status === 'reversed') {
      return jsonResponse({
        ok: true,
        already_reversed: true,
        posting,
        message: 'This Cash & Bank posting is already reversed.',
      })
    }

    if (posting.status !== 'posted') {
      return jsonResponse({
        error: `Only posted Day Closing ledger entries can be reversed. Current status: ${posting.status || 'unknown'}.`,
      }, 400)
    }

    let ledgerIds = uniqueIds(posting.ledger_entry_ids)

    if (ledgerIds.length === 0) {
      const { data: sourceEntries, error: sourceEntriesError } = await serviceClient
        .from('restaurant_account_transactions')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('source_type', 'day_closing_cash_bank_posting')
        .eq('source_id', posting.id)

      if (sourceEntriesError) {
        return jsonResponse({ error: sourceEntriesError.message }, 400)
      }

      ledgerIds = uniqueIds((sourceEntries || []).map((entry: AnyRow) => entry.id))
    }

    if (ledgerIds.length === 0) {
      return jsonResponse({ error: 'No ledger entries were found for this posting.' }, 400)
    }

    const { data: ledgerEntries, error: ledgerFetchError } = await serviceClient
      .from('restaurant_account_transactions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('id', ledgerIds)

    if (ledgerFetchError) {
      return jsonResponse({ error: ledgerFetchError.message }, 400)
    }

    const now = new Date().toISOString()
    const reversedIds: string[] = []

    for (const entry of ledgerEntries || []) {
      if (!entry?.id) continue

      const metadata = {
        ...(entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}),
        reversed_by_day_closing: true,
        reversed_at: now,
        reversed_by: userData.user.id,
        reversal_reason: reason,
        day_closing_cash_bank_posting_id: posting.id,
      }

      const { error: voidError } = await serviceClient
        .from('restaurant_account_transactions')
        .update({
          is_voided: true,
          voided_at: now,
          voided_by: userData.user.id,
          metadata,
        })
        .eq('id', entry.id)
        .eq('restaurant_id', restaurantId)

      if (voidError) {
        return jsonResponse({ error: voidError.message }, 400)
      }

      reversedIds.push(entry.id)
    }

    const { data: updatedPosting, error: postingUpdateError } = await serviceClient
      .from('restaurant_day_closing_cash_bank_postings')
      .update({
        status: 'reversed',
        reversed_at: now,
        reversed_by: userData.user.id,
        reversal_reason: reason,
        reversed_ledger_entry_ids: reversedIds,
        notes: `${reversedIds.length} Cash & Bank ledger entr${reversedIds.length === 1 ? 'y' : 'ies'} reversed/voided for correction.`,
        updated_at: now,
      })
      .eq('id', posting.id)
      .eq('restaurant_id', restaurantId)
      .select('*')
      .single()

    if (postingUpdateError) {
      return jsonResponse({ error: postingUpdateError.message }, 400)
    }

    let updatedSnapshot = null

    if (posting.payment_snapshot_id) {
      const snapshotResult = await serviceClient
        .from('restaurant_day_closing_payment_snapshots')
        .update({
          posted_to_cash_bank: false,
          posting_status: 'reversed',
          cash_bank_reversed_at: now,
          cash_bank_reversed_by: userData.user.id,
          updated_at: now,
        })
        .eq('id', posting.payment_snapshot_id)
        .eq('restaurant_id', restaurantId)
        .select('*')
        .maybeSingle()

      updatedSnapshot = snapshotResult.data || null
    }

    const closingResult = await serviceClient
      .from('restaurant_day_closings')
      .update({
        cash_bank_posting_status: 'reversed',
        cash_bank_reversed_at: now,
        cash_bank_reversed_by: userData.user.id,
      })
      .eq('restaurant_id', restaurantId)
      .eq('closing_date', closingDate)
      .select('*')
      .maybeSingle()

    return jsonResponse({
      ok: true,
      posting: updatedPosting,
      snapshot: updatedSnapshot,
      closing: closingResult.data || null,
      reversed_ledger_entry_ids: reversedIds,
      message: `Reversed ${reversedIds.length} Cash & Bank ledger entr${reversedIds.length === 1 ? 'y' : 'ies'} for ${closingDate}. You can correct and post again.`,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unable to reverse Day Closing Cash & Bank posting.',
      },
      500,
    )
  }
})
