import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Copy,
  Download,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './NotificationProviderSettingsManagement.css'

const providerDefinitions = [
  {
    channel: 'email',
    provider: 'resend',
    title: 'Email delivery',
    subtitle: 'Transactional email for reminders and owner alerts.',
    icon: Mail,
    recommended: true,
    secretKeys: ['SPIZY_EMAIL_PROVIDER', 'RESEND_API_KEY', 'SPIZY_EMAIL_FROM'],
    sampleSecrets: [
      'supabase secrets set SPIZY_EMAIL_PROVIDER="resend"',
      'supabase secrets set RESEND_API_KEY="your_resend_api_key"',
      'supabase secrets set SPIZY_EMAIL_FROM="Spizy <alerts@yourdomain.com>"',
    ],
    placeholders: {
      sender_label: 'Spizy Alerts',
      sender_identity: 'alerts@yourdomain.com',
    },
  },
  {
    channel: 'whatsapp',
    provider: 'whatsapp_cloud',
    title: 'WhatsApp delivery',
    subtitle: 'Owner and staff reminders through WhatsApp templates.',
    icon: MessageCircle,
    recommended: false,
    secretKeys: [
      'SPIZY_WHATSAPP_PROVIDER',
      'WHATSAPP_CLOUD_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
    ],
    sampleSecrets: [
      'supabase secrets set SPIZY_WHATSAPP_PROVIDER="whatsapp_cloud"',
      'supabase secrets set WHATSAPP_CLOUD_TOKEN="your_whatsapp_cloud_token"',
      'supabase secrets set WHATSAPP_PHONE_NUMBER_ID="your_phone_number_id"',
    ],
    placeholders: {
      sender_label: 'Restaurant WhatsApp Alerts',
      sender_identity: '+971XXXXXXXXX',
    },
  },
  {
    channel: 'push',
    provider: 'fcm',
    title: 'Push notification delivery',
    subtitle: 'PWA/mobile push reminders for active devices.',
    icon: Smartphone,
    recommended: false,
    secretKeys: ['SPIZY_PUSH_PROVIDER', 'FCM_SERVER_KEY'],
    sampleSecrets: [
      'supabase secrets set SPIZY_PUSH_PROVIDER="fcm"',
      'supabase secrets set FCM_SERVER_KEY="your_firebase_server_key"',
    ],
    placeholders: {
      sender_label: 'Spizy Push Alerts',
      sender_identity: 'Firebase project / app',
    },
  },
  {
    channel: 'in_app',
    provider: 'spizy_in_app',
    title: 'In-app alerts',
    subtitle: 'Safe default alerts shown inside Spizy Reminder Center.',
    icon: BellRing,
    recommended: true,
    secretKeys: [],
    sampleSecrets: [],
    placeholders: {
      sender_label: 'Spizy In-app',
      sender_identity: 'Reminder Center',
    },
  },
]

const providerStatusOptions = [
  { value: 'not_configured', label: 'Not configured' },
  { value: 'configured', label: 'Configured' },
  { value: 'testing', label: 'Testing' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
]

function NotificationProviderSettingsManagement({ restaurant, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [settings, setSettings] = useState([])
  const [rules, setRules] = useState([])
  const [message, setMessage] = useState('')
  const [copiedKey, setCopiedKey] = useState('')

  const loadProviderSettings = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setMessage('')

    const [settingsResult, rulesResult] = await Promise.all([
      supabase
        .from('restaurant_notification_provider_settings')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('channel', { ascending: true })
        .order('provider', { ascending: true }),
      supabase
        .from('restaurant_notification_rules')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('rule_type', { ascending: true }),
    ])

    if (settingsResult.error && settingsResult.error.code !== '42P01') {
      setMessage(settingsResult.error.message)
    }

    if (rulesResult.error && rulesResult.error.code !== '42P01') {
      setMessage(rulesResult.error.message)
    }

    setSettings(settingsResult.data || [])
    setRules(rulesResult.data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadProviderSettings()
  }, [loadProviderSettings])

  const providerRows = useMemo(
    () =>
      providerDefinitions.map((definition) => {
        const saved = settings.find(
          (setting) =>
            setting.channel === definition.channel &&
            setting.provider === definition.provider,
        )

        return {
          ...definition,
          saved,
          isEnabled: Boolean(saved?.is_enabled),
          status: saved?.status || 'not_configured',
          senderLabel:
            saved?.sender_label || definition.placeholders.sender_label || '',
          senderIdentity:
            saved?.sender_identity || definition.placeholders.sender_identity || '',
          notes: saved?.notes || '',
        }
      }),
    [settings],
  )

  const readiness = useMemo(() => buildProviderReadiness(providerRows, rules), [providerRows, rules])

  const handleSaveProvider = async (providerRow, changes = {}) => {
    if (!restaurant?.id) return

    const rowKey = `${providerRow.channel}:${providerRow.provider}`
    setSavingKey(rowKey)
    setMessage('')

    const payload = {
      restaurant_id: restaurant.id,
      channel: providerRow.channel,
      provider: providerRow.provider,
      is_enabled:
        typeof changes.is_enabled === 'boolean'
          ? changes.is_enabled
          : providerRow.isEnabled,
      status: changes.status || providerRow.status || 'configured',
      sender_label:
        typeof changes.sender_label === 'string'
          ? changes.sender_label.trim() || null
          : providerRow.senderLabel || null,
      sender_identity:
        typeof changes.sender_identity === 'string'
          ? changes.sender_identity.trim() || null
          : providerRow.senderIdentity || null,
      notes:
        typeof changes.notes === 'string'
          ? changes.notes.trim() || null
          : providerRow.notes || null,
      metadata: {
        secret_keys_required: providerRow.secretKeys,
        managed_by: 'backend_secrets',
        last_frontend_update: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('restaurant_notification_provider_settings')
      .upsert(payload, { onConflict: 'restaurant_id,channel,provider' })

    setSavingKey('')

    if (error) {
      setMessage(error.message)
      return
    }

    await loadProviderSettings()
    setMessage(`${providerRow.title} settings saved.`)
  }

  const copyText = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(''), 1800)
    } catch {
      setMessage('Copy failed. Please copy the command manually.')
    }
  }

  const exportCsv = () => {
    const rows = [
      ['Channel', 'Provider', 'Enabled', 'Status', 'Sender Label', 'Sender Identity', 'Required Secrets'],
      ...providerRows.map((providerRow) => [
        providerRow.channel,
        providerRow.provider,
        providerRow.isEnabled ? 'Enabled' : 'Disabled',
        providerRow.status,
        providerRow.senderLabel,
        providerRow.senderIdentity,
        providerRow.secretKeys.join(' | '),
      ]),
    ]

    downloadCsv(`spizy-notification-providers-${restaurant?.slug || 'restaurant'}.csv`, rows)
  }

  return (
    <section className="provider-settings-shell">
      <div className="provider-settings-hero">
        <div>
          <p className="pricing-label">Notification Delivery</p>
          <h1>Email, WhatsApp & Push Provider Settings</h1>
          <p>
            Prepare backend-only provider settings for notification delivery. Secrets stay inside Supabase
            Edge Function secrets and must never be stored in frontend code.
          </p>
        </div>

        <div className="provider-settings-hero-actions">
          <button type="button" onClick={loadProviderSettings} disabled={loading}>
            <RefreshCw size={17} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button type="button" onClick={exportCsv}>
            <Download size={17} />
            Export CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="provider-settings-message">
          <AlertTriangle size={17} />
          <span>{message}</span>
        </div>
      )}

      <div className="provider-settings-kpi-grid">
        <ProviderKpiCard
          icon={<ShieldCheck size={20} />}
          label="Readiness"
          value={`${readiness.score}%`}
          note={readiness.label}
          tone={readiness.score >= 80 ? 'good' : readiness.score >= 45 ? 'warn' : 'danger'}
        />
        <ProviderKpiCard
          icon={<Send size={20} />}
          label="Enabled Channels"
          value={String(readiness.enabledChannels)}
          note="Channels marked active"
        />
        <ProviderKpiCard
          icon={<BellRing size={20} />}
          label="Reminder Rules"
          value={String(readiness.activeRules)}
          note="Active delivery rules"
        />
        <ProviderKpiCard
          icon={<AlertTriangle size={20} />}
          label="Backend Secrets"
          value={String(readiness.requiredSecretCount)}
          note="Set only in Supabase"
          tone={readiness.requiredSecretCount > 0 ? 'warn' : 'good'}
        />
      </div>

      <section className="provider-settings-panel">
        <div className="provider-settings-panel-head">
          <div>
            <p className="pricing-label">Provider Readiness</p>
            <h2>Configure safe delivery channels</h2>
          </div>
          <button type="button" onClick={() => onOpenSection?.('notification-center')}>
            <BellRing size={16} />
            Reminder Center
          </button>
        </div>

        <div className="provider-settings-grid">
          {providerRows.map((providerRow) => {
            const Icon = providerRow.icon
            const rowKey = `${providerRow.channel}:${providerRow.provider}`
            const isSaving = savingKey === rowKey

            return (
              <article className="provider-card" key={rowKey}>
                <div className="provider-card-head">
                  <div className="provider-card-icon">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3>{providerRow.title}</h3>
                    <span>{providerRow.subtitle}</span>
                  </div>
                  <ProviderStatusBadge status={providerRow.status} />
                </div>

                <label className="provider-toggle-row">
                  <span>
                    <strong>Enable channel</strong>
                    <small>
                      {providerRow.channel === 'in_app'
                        ? 'Works from Reminder Center records.'
                        : 'Requires backend provider secrets before real delivery.'}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={providerRow.isEnabled}
                    onChange={(event) =>
                      handleSaveProvider(providerRow, {
                        is_enabled: event.target.checked,
                        status: event.target.checked ? 'configured' : 'not_configured',
                      })
                    }
                  />
                </label>

                <div className="provider-form-grid">
                  <label>
                    Sender label
                    <input
                      type="text"
                      defaultValue={providerRow.senderLabel}
                      placeholder={providerRow.placeholders.sender_label}
                      onBlur={(event) =>
                        event.target.value !== providerRow.senderLabel &&
                        handleSaveProvider(providerRow, { sender_label: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Sender identity
                    <input
                      type="text"
                      defaultValue={providerRow.senderIdentity}
                      placeholder={providerRow.placeholders.sender_identity}
                      onBlur={(event) =>
                        event.target.value !== providerRow.senderIdentity &&
                        handleSaveProvider(providerRow, { sender_identity: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Readiness status
                    <select
                      value={providerRow.status}
                      onChange={(event) =>
                        handleSaveProvider(providerRow, { status: event.target.value })
                      }
                    >
                      {providerStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="provider-secret-box">
                  <strong>Backend-only secrets</strong>
                  {providerRow.secretKeys.length === 0 ? (
                    <span>No provider secret required for in-app alerts.</span>
                  ) : (
                    <div className="provider-secret-list">
                      {providerRow.secretKeys.map((secretKey) => (
                        <code key={secretKey}>{secretKey}</code>
                      ))}
                    </div>
                  )}
                </div>

                {providerRow.sampleSecrets.length > 0 && (
                  <div className="provider-command-list">
                    {providerRow.sampleSecrets.map((command, index) => {
                      const commandKey = `${rowKey}:${index}`
                      return (
                        <button
                          type="button"
                          key={command}
                          onClick={() => copyText(commandKey, command)}
                        >
                          <Copy size={14} />
                          <span>{copiedKey === commandKey ? 'Copied' : command}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="provider-card-footer">
                  <span>
                    {providerRow.recommended ? 'Recommended foundation channel' : 'Optional production channel'}
                  </span>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveProvider(providerRow, { status: 'configured' })}
                  >
                    <Save size={15} />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="provider-settings-panel">
        <div className="provider-settings-panel-head">
          <div>
            <p className="pricing-label">Safe Delivery Flow</p>
            <h2>Recommended production order</h2>
          </div>
        </div>

        <div className="provider-flow-list">
          {[
            'Run Reminder Center SQL and Notification Event Generator SQL.',
            'Run Notification Delivery Outbox SQL and deploy dispatch-restaurant-notifications.',
            'Set provider secrets only in Supabase secrets, never in frontend code.',
            'Enable providers here after secrets are configured.',
            'Run dispatch function in dry_run mode first.',
            'Connect real provider adapters one channel at a time after sandbox testing.',
          ].map((step, index) => (
            <div className="provider-flow-step" key={step}>
              <strong>{index + 1}</strong>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function ProviderKpiCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`provider-kpi-card ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function ProviderStatusBadge({ status }) {
  const label = providerStatusOptions.find((option) => option.value === status)?.label || 'Not configured'
  return <span className={`provider-status-badge ${status}`}>{label}</span>
}

function buildProviderReadiness(providerRows, rules) {
  const enabledRows = providerRows.filter((providerRow) => providerRow.isEnabled)
  const readyRows = providerRows.filter((providerRow) => ['ready', 'configured'].includes(providerRow.status))
  const activeRules = Array.isArray(rules)
    ? rules.filter((rule) => rule.is_enabled !== false).length
    : 0
  const requiredSecretCount = enabledRows.reduce(
    (total, providerRow) => total + providerRow.secretKeys.length,
    0,
  )

  let score = 20
  if (enabledRows.some((row) => row.channel === 'in_app')) score += 20
  if (activeRules > 0) score += 15
  score += Math.min(35, readyRows.length * 10)
  if (enabledRows.some((row) => row.channel !== 'in_app')) score += 10

  const safeScore = Math.max(0, Math.min(100, score))

  return {
    score: safeScore,
    label:
      safeScore >= 80
        ? 'Ready for provider testing'
        : safeScore >= 45
          ? 'Setup in progress'
          : 'Needs setup',
    enabledChannels: enabledRows.length,
    activeRules,
    requiredSecretCount,
  }
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default NotificationProviderSettingsManagement
