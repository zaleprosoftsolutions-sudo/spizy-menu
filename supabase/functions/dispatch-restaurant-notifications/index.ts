import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-spizy-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type NotificationEvent = {
  id: string
  restaurant_id: string
  event_type?: string | null
  title?: string | null
  message?: string | null
  priority?: string | null
  delivery_channels?: unknown
  payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

type DispatchResult = {
  event_id: string
  restaurant_id: string
  channels: string[]
  status: 'dry_run' | 'queued' | 'delivered' | 'failed'
  message?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = Deno.env.get('SPIZY_CRON_SECRET')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' },
      500,
    )
  }

  if (!cronSecret) {
    return jsonResponse(
      { error: 'Missing SPIZY_CRON_SECRET. Set it before enabling notification dispatch.' },
      500,
    )
  }

  const requestSecret = req.headers.get('x-spizy-cron-secret') || ''

  if (requestSecret !== cronSecret) {
    return jsonResponse({ error: 'Unauthorized notification dispatch request.' }, 401)
  }

  const body = await safeJson(req)
  const restaurantId = cleanText(body?.restaurant_id)
  const dryRun = body?.dry_run === true
  const limit = clampNumber(Number(body?.limit || 50), 1, 200)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  let query = supabase
    .from('restaurant_notification_events')
    .select('*')
    .in('delivery_status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit)

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId)
  }

  const { data: events, error } = await query

  if (error) {
    return jsonResponse(
      {
        error: 'Unable to load notification events.',
        details: error.message,
      },
      500,
    )
  }

  const results: DispatchResult[] = []
  let queuedCount = 0
  let deliveredCount = 0
  let providerPendingCount = 0
  let failedCount = 0

  for (const event of (events || []) as NotificationEvent[]) {
    const channels = normalizeChannels(event.delivery_channels)
    const payload = buildOutboxPayload(event)

    if (dryRun) {
      results.push({
        event_id: event.id,
        restaurant_id: event.restaurant_id,
        channels,
        status: 'dry_run',
        message: 'Dry run only. No outbox rows were created.',
      })
      continue
    }

    try {
      for (const channel of channels) {
        const deliveryStatus = getInitialDeliveryStatus(channel)
        const { error: upsertError } = await supabase
          .from('restaurant_notification_delivery_outbox')
          .upsert(
            {
              restaurant_id: event.restaurant_id,
              notification_event_id: event.id,
              channel,
              recipient_type: 'restaurant_admin',
              recipient_label: getRecipientLabel(channel),
              recipient_target: getRecipientTarget(channel, event),
              delivery_status: deliveryStatus,
              payload,
              attempted_at: new Date().toISOString(),
              delivered_at: channel === 'in_app' ? new Date().toISOString() : null,
              error_message:
                channel === 'in_app'
                  ? null
                  : 'Provider delivery is not configured yet. This outbox row is ready for a future provider connector.',
            },
            { onConflict: 'notification_event_id,channel' },
          )

        if (upsertError) throw upsertError

        if (channel === 'in_app') deliveredCount += 1
        else providerPendingCount += 1
      }

      queuedCount += channels.length

      const eventDeliveryStatus = channels.every((channel) => channel === 'in_app')
        ? 'delivered'
        : 'queued'

      const { error: eventUpdateError } = await supabase
        .from('restaurant_notification_events')
        .update({
          delivery_status: eventDeliveryStatus,
          delivery_attempt_count: 1,
          last_delivery_attempt_at: new Date().toISOString(),
          last_delivery_error: null,
          delivered_at: eventDeliveryStatus === 'delivered' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)

      if (eventUpdateError) throw eventUpdateError

      results.push({
        event_id: event.id,
        restaurant_id: event.restaurant_id,
        channels,
        status: eventDeliveryStatus === 'delivered' ? 'delivered' : 'queued',
        message:
          eventDeliveryStatus === 'delivered'
            ? 'In-app notification marked delivered.'
            : 'Notification placed into delivery outbox. External providers are pending setup.',
      })
    } catch (dispatchError) {
      failedCount += 1
      const message = dispatchError instanceof Error ? dispatchError.message : 'Unknown dispatch error.'

      await supabase
        .from('restaurant_notification_events')
        .update({
          delivery_status: 'failed',
          delivery_attempt_count: 1,
          last_delivery_attempt_at: new Date().toISOString(),
          last_delivery_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)

      results.push({
        event_id: event.id,
        restaurant_id: event.restaurant_id,
        channels,
        status: 'failed',
        message,
      })
    }
  }

  return jsonResponse({
    success: true,
    dry_run: dryRun,
    scanned: events?.length || 0,
    queued_count: dryRun ? 0 : queuedCount,
    delivered_count: dryRun ? 0 : deliveredCount,
    provider_pending_count: dryRun ? 0 : providerPendingCount,
    failed_count: failedCount,
    results,
  })
})

function normalizeChannels(value: unknown): string[] {
  const allowed = new Set(['in_app', 'email', 'whatsapp', 'push'])
  let rawChannels: unknown[] = []

  if (Array.isArray(value)) rawChannels = value
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      rawChannels = Array.isArray(parsed) ? parsed : [value]
    } catch {
      rawChannels = [value]
    }
  }

  const channels = rawChannels
    .map((channel) => String(channel || '').trim().toLowerCase())
    .filter((channel) => allowed.has(channel))

  if (!channels.includes('in_app')) channels.unshift('in_app')

  return [...new Set(channels)]
}

function getInitialDeliveryStatus(channel: string) {
  if (channel === 'in_app') return 'delivered'
  return 'provider_pending'
}

function getRecipientLabel(channel: string) {
  if (channel === 'email') return 'Owner email / configured recipients'
  if (channel === 'whatsapp') return 'Restaurant WhatsApp / configured recipients'
  if (channel === 'push') return 'Registered admin devices'
  return 'Spizy in-app Reminder Center'
}

function getRecipientTarget(channel: string, event: NotificationEvent) {
  const payload = event.payload || event.metadata || {}

  if (channel === 'email') return cleanText(payload.email) || cleanText(payload.owner_email) || null
  if (channel === 'whatsapp') return cleanText(payload.whatsapp) || cleanText(payload.phone) || null
  if (channel === 'push') return cleanText(payload.push_topic) || `restaurant:${event.restaurant_id}`

  return `restaurant:${event.restaurant_id}:in_app`
}

function buildOutboxPayload(event: NotificationEvent) {
  return {
    event_id: event.id,
    restaurant_id: event.restaurant_id,
    event_type: event.event_type || 'reminder',
    priority: event.priority || 'normal',
    title: event.title || 'Spizy Reminder',
    message: event.message || 'A restaurant reminder needs attention.',
    payload: event.payload || {},
    metadata: event.metadata || {},
    created_at: event.created_at || null,
  }
}

async function safeJson(req: Request) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

function cleanText(value: unknown) {
  return String(value || '').trim()
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
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
