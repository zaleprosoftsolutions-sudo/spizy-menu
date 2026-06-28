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

const moneyInTypes = new Set(['opening', 'income', 'transfer_in', 'adjustment_in'])
const moneyOutTypes = new Set(['expense', 'transfer_out', 'adjustment_out'])

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

function buildAccountBalance(account: AnyRow, transactions: AnyRow[]) {
  const accountTransactions = transactions.filter(
    (transaction) => transaction.account_id === account.id && !transaction.is_voided,
  )

  const hasOpeningEntry = accountTransactions.some(
    (transaction) => transaction.transaction_type === 'opening',
  )

  const openingFallback = hasOpeningEntry ? 0 : toMoney(account.opening_balance)

  const computedBalance = accountTransactions.reduce((total, transaction) => {
    const amount = toMoney(transaction.amount)
    const type = String(transaction.transaction_type || '')

    if (moneyInTypes.has(type)) return toMoney(total + amount)
    if (moneyOutTypes.has(type)) return toMoney(total - amount)

    return total
  }, openingFallback)

  const storedBalance = toMoney(account.current_balance)
  const difference = toMoney(computedBalance - storedBalance)

  return {
    account_id: account.id,
    account_name: account.account_name || 'Account',
    account_type: account.account_type || 'other',
    currency: account.currency || 'AED',
    stored_balance: storedBalance,
    computed_balance: computedBalance,
    difference,
    transaction_count: accountTransactions.length,
    opening_fallback_used: !hasOpeningEntry && openingFallback !== 0,
  }
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

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurant_id is required.' }, 400)
    }

    const allowed = await assertRestaurantAccess(serviceClient, restaurantId, userData.user.id)

    if (!allowed) {
      return jsonResponse({ error: 'You do not have permission to recalculate these balances.' }, 403)
    }

    const { data: accounts, error: accountsError } = await serviceClient
      .from('restaurant_finance_accounts')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (accountsError) {
      return jsonResponse({ error: accountsError.message }, 400)
    }

    const { data: transactions, error: transactionsError } = await serviceClient
      .from('restaurant_account_transactions')
      .select('id, account_id, transaction_type, amount, is_voided')
      .eq('restaurant_id', restaurantId)

    if (transactionsError) {
      return jsonResponse({ error: transactionsError.message }, 400)
    }

    const results = (accounts || []).map((account: AnyRow) =>
      buildAccountBalance(account, transactions || []),
    )

    const changedResults = results.filter((result) => Math.abs(result.difference) >= 0.01)

    for (const result of changedResults) {
      const { error: updateError } = await serviceClient
        .from('restaurant_finance_accounts')
        .update({
          current_balance: result.computed_balance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', result.account_id)
        .eq('restaurant_id', restaurantId)

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400)
      }
    }

    const totalBefore = toMoney(results.reduce((total, row) => total + row.stored_balance, 0))
    const totalAfter = toMoney(results.reduce((total, row) => total + row.computed_balance, 0))

    const { data: audit, error: auditError } = await serviceClient
      .from('restaurant_cash_bank_balance_recalculations')
      .insert({
        restaurant_id: restaurantId,
        accounts_checked: results.length,
        mismatched_accounts: changedResults.length,
        total_before: totalBefore,
        total_after: totalAfter,
        total_difference: toMoney(totalAfter - totalBefore),
        account_results: results,
        notes:
          changedResults.length > 0
            ? `${changedResults.length} account balance${changedResults.length === 1 ? '' : 's'} corrected from ledger.`
            : 'All account balances already matched the ledger.',
        recalculated_by: userData.user.id,
      })
      .select('*')
      .single()

    if (auditError) {
      return jsonResponse({ error: auditError.message }, 400)
    }

    return jsonResponse({
      ok: true,
      audit,
      accounts: results,
      changed_accounts: changedResults,
      message:
        changedResults.length > 0
          ? `${changedResults.length} account balance${changedResults.length === 1 ? '' : 's'} recalculated from ledger.`
          : 'All Cash & Bank balances already matched the ledger.',
    })
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to recalculate Cash & Bank balances.',
      },
      500,
    )
  }
})
