import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Printer,
  RefreshCw,
  Save,
  ShoppingCart,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import './OfflinePOSQueueManagement.css'

const draftStatuses = {
  draft: 'Draft',
  ready_to_sync: 'Ready to sync',
  synced: 'Synced / submitted',
  discarded: 'Discarded',
}

const defaultDraftForm = {
  customer_name: '',
  customer_phone: '',
  table_name: '',
  order_type: 'counter',
  payment_method: 'cash',
  estimated_total: '',
  items_text: '',
  notes: '',
}

export function getOfflinePOSQueueKey(restaurantId) {
  return `spizy_offline_pos_queue_${restaurantId || 'unknown'}`
}

export function readOfflinePOSDrafts(restaurantId) {
  if (typeof window === 'undefined' || !restaurantId) return []

  try {
    const rawValue = window.localStorage.getItem(getOfflinePOSQueueKey(restaurantId))
    const parsed = rawValue ? JSON.parse(rawValue) : []

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeOfflinePOSDrafts(restaurantId, drafts) {
  if (typeof window === 'undefined' || !restaurantId) return

  window.localStorage.setItem(
    getOfflinePOSQueueKey(restaurantId),
    JSON.stringify(Array.isArray(drafts) ? drafts : []),
  )
}

export function saveOfflinePOSDraft(restaurantId, draftPayload) {
  if (!restaurantId) return null

  const currentDrafts = readOfflinePOSDrafts(restaurantId)
  const nowIso = new Date().toISOString()
  const draft = {
    id: `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: 'draft',
    created_at: nowIso,
    updated_at: nowIso,
    source: 'offline_pos_queue',
    sync_error: '',
    ...draftPayload,
  }

  writeOfflinePOSDrafts(restaurantId, [draft, ...currentDrafts])

  return draft
}

function OfflinePOSQueueManagement({ restaurant, onOpenSection }) {
  const [drafts, setDrafts] = useState([])
  const [form, setForm] = useState(defaultDraftForm)
  const [isOnline, setIsOnline] = useState(() => getNavigatorOnlineStatus())
  const [message, setMessage] = useState('')
  const [importText, setImportText] = useState('')
  const [showImportBox, setShowImportBox] = useState(false)

  const currency = restaurant?.currency || 'AED'

  const loadDrafts = useCallback(() => {
    if (!restaurant?.id) return
    setDrafts(readOfflinePOSDrafts(restaurant.id))
  }, [restaurant?.id])

  useEffect(() => {
    loadDrafts()
  }, [loadDrafts])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleStorage = (event) => {
      if (event.key === getOfflinePOSQueueKey(restaurant?.id)) loadDrafts()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('storage', handleStorage)
    }
  }, [loadDrafts, restaurant?.id])

  const queueSummary = useMemo(() => buildQueueSummary(drafts), [drafts])

  const saveDrafts = (nextDrafts, successMessage = '') => {
    writeOfflinePOSDrafts(restaurant?.id, nextDrafts)
    setDrafts(nextDrafts)
    setMessage(successMessage)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const handleCreateDraft = (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    if (!form.items_text.trim()) {
      setMessage('Add at least one item or order note before saving an offline draft.')
      return
    }

    const draft = saveOfflinePOSDraft(restaurant.id, {
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name || '',
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      table_name: form.table_name.trim(),
      order_type: form.order_type,
      payment_method: form.payment_method,
      estimated_total: Number(form.estimated_total || 0),
      currency,
      items_text: form.items_text.trim(),
      notes: form.notes.trim(),
      device_label: getDeviceLabel(),
    })

    if (!draft) {
      setMessage('Offline draft could not be saved on this browser.')
      return
    }

    setDrafts(readOfflinePOSDrafts(restaurant.id))
    setForm(defaultDraftForm)
    setMessage('Offline POS draft saved on this device. Review it before creating the real order.')
  }

  const updateDraftStatus = (draftId, status) => {
    const nextDrafts = drafts.map((draft) =>
      draft.id === draftId
        ? {
            ...draft,
            status,
            updated_at: new Date().toISOString(),
            sync_error: status === 'ready_to_sync' ? '' : draft.sync_error || '',
          }
        : draft,
    )

    saveDrafts(nextDrafts, `Draft marked as ${draftStatuses[status] || status}.`)
  }

  const deleteDraft = (draftId) => {
    const nextDrafts = drafts.filter((draft) => draft.id !== draftId)
    saveDrafts(nextDrafts, 'Offline draft removed from this device.')
  }

  const clearCompleted = () => {
    const nextDrafts = drafts.filter(
      (draft) => !['synced', 'discarded'].includes(draft.status),
    )
    saveDrafts(nextDrafts, 'Synced and discarded drafts cleared.')
  }

  const exportQueue = () => {
    downloadTextFile(
      `spizy-offline-pos-queue-${restaurant?.slug || restaurant?.id || 'restaurant'}.json`,
      JSON.stringify(
        {
          restaurant_id: restaurant?.id || null,
          restaurant_name: restaurant?.name || '',
          exported_at: new Date().toISOString(),
          drafts,
        },
        null,
        2,
      ),
    )
  }

  const importQueue = () => {
    try {
      const parsed = JSON.parse(importText)
      const importedDrafts = Array.isArray(parsed) ? parsed : parsed?.drafts

      if (!Array.isArray(importedDrafts)) {
        setMessage('Import failed. Paste a valid exported Spizy offline queue JSON.')
        return
      }

      const normalizedImportedDrafts = importedDrafts.map((draft) => ({
        ...draft,
        id: draft.id || `imported-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        imported_at: new Date().toISOString(),
        status: draft.status || 'draft',
      }))

      const existingIds = new Set(drafts.map((draft) => draft.id))
      const mergedDrafts = [
        ...normalizedImportedDrafts.filter((draft) => !existingIds.has(draft.id)),
        ...drafts,
      ]

      saveDrafts(mergedDrafts, `${normalizedImportedDrafts.length} offline draft${normalizedImportedDrafts.length === 1 ? '' : 's'} imported.`)
      setImportText('')
      setShowImportBox(false)
    } catch (error) {
      setMessage(error?.message || 'Import failed. Check the JSON and try again.')
    }
  }

  const printQueue = () => {
    window.print()
  }

  return (
    <section className="offline-pos-shell">
      <div className="offline-pos-hero">
        <div>
          <p className="pricing-label">Mobile POS Safety</p>
          <h1>Offline POS Draft Queue</h1>
          <p>
            Save rough POS orders on this device during poor network moments, then review
            and recreate/submit them safely when the connection is stable.
          </p>
        </div>

        <div className={`offline-pos-network-pill ${isOnline ? 'online' : 'offline'}`}>
          {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
          <span>{isOnline ? 'Browser online' : 'Browser offline'}</span>
        </div>
      </div>

      <div className="offline-pos-warning">
        <AlertTriangle size={18} />
        <div>
          <strong>Foundation mode</strong>
          <span>
            These drafts are local browser records only. They do not create real orders,
            reduce stock, post payments or affect Cash & Bank until a staff member submits
            the real order from POS.
          </span>
        </div>
      </div>

      {message && <div className="offline-pos-message">{message}</div>}

      <div className="offline-pos-kpi-grid">
        <QueueMetricCard label="Total Drafts" value={drafts.length} note="Saved on this device" />
        <QueueMetricCard label="Ready to Sync" value={queueSummary.ready} note="Needs real order submission" tone={queueSummary.ready > 0 ? 'warning' : 'good'} />
        <QueueMetricCard label="Draft / Open" value={queueSummary.draft} note="Still being prepared" />
        <QueueMetricCard label="Synced" value={queueSummary.synced} note="Marked completed by staff" tone="good" />
      </div>

      <div className="offline-pos-grid">
        <section className="offline-pos-panel">
          <div className="offline-pos-panel-head">
            <div>
              <p className="pricing-label">Create Draft</p>
              <h2>Manual offline order note</h2>
            </div>
          </div>

          <form className="offline-pos-form" onSubmit={handleCreateDraft}>
            <div className="offline-pos-form-row two">
              <label>
                Customer name
                <input
                  value={form.customer_name}
                  onChange={(event) => updateForm('customer_name', event.target.value)}
                  placeholder="Walk-in customer"
                />
              </label>
              <label>
                Phone
                <input
                  value={form.customer_phone}
                  onChange={(event) => updateForm('customer_phone', event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className="offline-pos-form-row three">
              <label>
                Order type
                <select value={form.order_type} onChange={(event) => updateForm('order_type', event.target.value)}>
                  <option value="counter">Counter</option>
                  <option value="dine_in">Dine-in</option>
                  <option value="takeaway">Takeaway</option>
                  <option value="delivery">Delivery</option>
                </select>
              </label>
              <label>
                Table / token
                <input
                  value={form.table_name}
                  onChange={(event) => updateForm('table_name', event.target.value)}
                  placeholder="Table 1"
                />
              </label>
              <label>
                Payment
                <select value={form.payment_method} onChange={(event) => updateForm('payment_method', event.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="cod">COD</option>
                  <option value="online">Online later</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </label>
            </div>

            <label>
              Items / order details
              <textarea
                value={form.items_text}
                onChange={(event) => updateForm('items_text', event.target.value)}
                placeholder="Example: 2 Chicken biryani, 1 Fresh juice, no spicy..."
                rows={5}
              />
            </label>

            <div className="offline-pos-form-row two">
              <label>
                Estimated total
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimated_total}
                  onChange={(event) => updateForm('estimated_total', event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Staff notes
                <input
                  value={form.notes}
                  onChange={(event) => updateForm('notes', event.target.value)}
                  placeholder="Reason, waiter, kitchen note..."
                />
              </label>
            </div>

            <button type="submit" className="offline-pos-primary-button">
              <Save size={17} />
              Save Offline Draft
            </button>
          </form>
        </section>

        <section className="offline-pos-panel">
          <div className="offline-pos-panel-head">
            <div>
              <p className="pricing-label">Sync SOP</p>
              <h2>Safe staff process</h2>
            </div>
          </div>

          <div className="offline-pos-step-list">
            <OfflineStep number="1" title="Save draft only" text="During unstable internet, save the order details here instead of repeatedly submitting POS." />
            <OfflineStep number="2" title="When online, open POS" text="Use the real POS to create the order from the draft details. This ensures stock, payment and order status are correct." />
            <OfflineStep number="3" title="Verify payment" text="Collect cash/card/online payment using the normal workflow. Do not mark a local draft as synced before the real order exists." />
            <OfflineStep number="4" title="Mark synced" text="After the real order is visible in Orders, mark this draft as synced and keep it for audit or clear completed drafts." />
          </div>

          <div className="offline-pos-tools">
            <button type="button" onClick={() => onOpenSection?.('pos')}>
              <ShoppingCart size={16} />
              Open POS
            </button>
            <button type="button" onClick={() => onOpenSection?.('orders')}>
              <ClipboardList size={16} />
              Open Orders
            </button>
            <button type="button" onClick={printQueue}>
              <Printer size={16} />
              Print Queue
            </button>
            <button type="button" onClick={exportQueue}>
              <Download size={16} />
              Export JSON
            </button>
            <button type="button" onClick={() => setShowImportBox((current) => !current)}>
              <UploadCloud size={16} />
              Import JSON
            </button>
            <button type="button" onClick={clearCompleted} disabled={queueSummary.completed === 0}>
              <Trash2 size={16} />
              Clear completed
            </button>
          </div>

          {showImportBox && (
            <div className="offline-pos-import-box">
              <div>
                <strong>Import offline queue backup</strong>
                <button type="button" onClick={() => setShowImportBox(false)}>
                  <X size={15} />
                </button>
              </div>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={5}
                placeholder="Paste exported Spizy offline queue JSON here..."
              />
              <button type="button" onClick={importQueue}>Import Drafts</button>
            </div>
          )}
        </section>
      </div>

      <section className="offline-pos-panel offline-pos-queue-panel">
        <div className="offline-pos-panel-head">
          <div>
            <p className="pricing-label">Local Queue</p>
            <h2>Drafts saved on this device</h2>
          </div>
          <button type="button" className="offline-pos-refresh-button" onClick={loadDrafts}>
            <RefreshCw size={16} />
            Reload
          </button>
        </div>

        <div className="offline-pos-draft-list">
          {drafts.length === 0 ? (
            <div className="offline-pos-empty">
              <CheckCircle2 size={18} />
              <span>No offline POS drafts saved on this device.</span>
            </div>
          ) : (
            drafts.map((draft) => (
              <OfflineDraftCard
                key={draft.id}
                draft={draft}
                currency={currency}
                onStatusChange={updateDraftStatus}
                onDelete={deleteDraft}
              />
            ))
          )}
        </div>
      </section>
    </section>
  )
}

function QueueMetricCard({ label, value, note, tone = 'neutral' }) {
  return (
    <article className={`offline-pos-kpi-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function OfflineStep({ number, title, text }) {
  return (
    <article className="offline-pos-step-card">
      <div>{number}</div>
      <strong>{title}</strong>
      <span>{text}</span>
    </article>
  )
}

function OfflineDraftCard({ draft, currency, onStatusChange, onDelete }) {
  return (
    <article className={`offline-pos-draft-card ${draft.status || 'draft'}`}>
      <div className="offline-pos-draft-main">
        <div>
          <div className="offline-pos-draft-title-row">
            <strong>{draft.customer_name || draft.table_name || 'Offline POS Draft'}</strong>
            <span>{draftStatuses[draft.status] || draft.status || 'Draft'}</span>
          </div>
          <small>
            {formatOrderType(draft.order_type)} • {draft.payment_method || 'cash'} • {formatDateTime(draft.created_at)}
          </small>
        </div>
        <strong>{formatMoney(currency, draft.estimated_total)}</strong>
      </div>

      <div className="offline-pos-draft-body">
        <p>{draft.items_text || 'No item details added.'}</p>
        {draft.notes && <small>Notes: {draft.notes}</small>}
        {draft.device_label && <small>Device: {draft.device_label}</small>}
      </div>

      <div className="offline-pos-draft-actions">
        <button type="button" onClick={() => onStatusChange(draft.id, 'ready_to_sync')} disabled={draft.status === 'ready_to_sync'}>
          Ready
        </button>
        <button type="button" onClick={() => onStatusChange(draft.id, 'synced')} disabled={draft.status === 'synced'}>
          Synced
        </button>
        <button type="button" onClick={() => onStatusChange(draft.id, 'discarded')} disabled={draft.status === 'discarded'}>
          Discard
        </button>
        <button type="button" className="danger" onClick={() => onDelete(draft.id)}>
          Delete
        </button>
      </div>
    </article>
  )
}

function buildQueueSummary(drafts) {
  return drafts.reduce(
    (summary, draft) => {
      const status = draft.status || 'draft'
      if (status === 'ready_to_sync') summary.ready += 1
      if (status === 'draft') summary.draft += 1
      if (status === 'synced') summary.synced += 1
      if (['synced', 'discarded'].includes(status)) summary.completed += 1
      return summary
    },
    { ready: 0, draft: 0, synced: 0, completed: 0 },
  )
}

function getNavigatorOnlineStatus() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

function getDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Unknown device'

  const platform = navigator.platform || 'Web device'
  const language = navigator.language || ''

  return `${platform}${language ? ` • ${language}` : ''}`
}

function formatOrderType(value) {
  if (value === 'dine_in') return 'Dine-in'
  if (value === 'takeaway') return 'Takeaway'
  if (value === 'delivery') return 'Delivery'
  return 'Counter'
}

function formatMoney(currency, amount) {
  const safeCurrency = currency || 'AED'
  const numericAmount = Number(amount || 0)

  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(numericAmount)
  } catch {
    return `${safeCurrency} ${numericAmount.toFixed(2)}`
  }
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default OfflinePOSQueueManagement
