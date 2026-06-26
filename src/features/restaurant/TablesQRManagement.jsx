import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './TablesQRManagement.css'

function TablesQRManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tableForm, setTableForm] = useState({
    tableName: '',
    tableNumber: '',
  })

  const liveMenuUrl = useMemo(() => {
    return buildMenuUrl(restaurant)
  }, [restaurant])

  const loadTables = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      showToast({
        type: 'error',
        title: 'Tables loading failed',
        message: error.message,
      })
      setTables([])
      setLoading(false)
      return
    }

    setTables(data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadTables()
  }, [loadTables])

  const updateForm = (key, value) => {
    setTableForm((current) => ({ ...current, [key]: value }))
  }

  const handleAddTable = async (event) => {
    event.preventDefault()

    const tableName = tableForm.tableName.trim()
    const tableNumber = tableForm.tableNumber.trim()

    if (!restaurant?.id) {
      showToast({
        type: 'warning',
        title: 'Restaurant missing',
        message: 'Restaurant profile is required before creating table QR.',
      })
      return
    }

    if (!tableName) {
      showToast({
        type: 'warning',
        title: 'Table name required',
        message: 'Please enter a table name or number.',
      })
      return
    }

    setSaving(true)

    const { error } = await supabase.from('restaurant_tables').insert({
      restaurant_id: restaurant.id,
      table_name: tableName,
      table_number: tableNumber || null,
      is_active: true,
    })

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Table QR create failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Table QR created',
      message: `${tableName} QR is ready.`,
    })

    setTableForm({
      tableName: '',
      tableNumber: '',
    })

    await loadTables()
  }

  const handleToggleTable = async (table) => {
    const nextActive = !table.is_active

    const { error } = await supabase
      .from('restaurant_tables')
      .update({
        is_active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', table.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Table update failed',
        message: error.message,
      })
      return
    }

    setTables((current) =>
      current.map((currentTable) =>
        currentTable.id === table.id
          ? {
              ...currentTable,
              is_active: nextActive,
            }
          : currentTable,
      ),
    )

    showToast({
      type: 'success',
      title: nextActive ? 'Table QR enabled' : 'Table QR disabled',
      message: `${table.table_name} is now ${
        nextActive ? 'active' : 'inactive'
      }.`,
    })
  }

  const handleDeleteTable = async (table) => {
    const confirmed = await confirmAction({
      title: 'Delete table QR?',
      message: `${table.table_name} QR will stop working for customers.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_tables')
      .update({
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', table.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Table QR delete failed',
        message: error.message,
      })
      return
    }

    setTables((current) =>
      current.filter((currentTable) => currentTable.id !== table.id),
    )

    showToast({
      type: 'success',
      title: 'Table QR deleted',
      message: `${table.table_name} has been removed.`,
    })
  }

  if (!restaurant?.id) {
    return (
      <section className="management-section">
        <div className="empty-state">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="tables-qr-screen">
      <div className="tables-qr-header">
        <div>
          <p className="pricing-label">Tables & QR</p>
          <h2>Live menu and table QR codes</h2>
          <span>
            Download your restaurant live menu QR and create unlimited
            table-wise QR codes for dine-in orders.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadTables}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="qr-top-grid">
        <QRCodeCard
          title="Restaurant Live Menu"
          subtitle="General QR for menu, takeaway and delivery visitors."
          url={liveMenuUrl}
          fileName={`${restaurant.slug || 'spizy-menu'}-live-menu-qr.png`}
          badge="Live QR"
          showToast={showToast}
        />

        <form className="table-create-card" onSubmit={handleAddTable}>
          <div className="table-create-head">
            <div className="feature-icon">
              <QrCode size={22} />
            </div>

            <div>
              <h3>Add table QR</h3>
              <p>Create a QR code for each dining table.</p>
            </div>
          </div>

          <label>
            Table name
            <input
              type="text"
              value={tableForm.tableName}
              onChange={(event) => updateForm('tableName', event.target.value)}
              placeholder="Example: Table 1"
              required
            />
          </label>

          <label>
            Table number / code
            <input
              type="text"
              value={tableForm.tableNumber}
              onChange={(event) =>
                updateForm('tableNumber', event.target.value)
              }
              placeholder="Optional: T01"
            />
          </label>

          <button type="submit" className="primary-button" disabled={saving}>
            <Plus size={18} />
            {saving ? 'Creating...' : 'Create Table QR'}
          </button>
        </form>
      </div>

      <div className="table-list-head">
        <div>
          <strong>Table-wise QR codes</strong>
          <span>
            {tables.length} table QR{tables.length === 1 ? '' : 's'} created
          </span>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading table QR codes...</div>
      ) : tables.length === 0 ? (
        <div className="empty-state">
          No table QR created yet. Add your first table above.
        </div>
      ) : (
        <div className="table-qr-grid">
          {tables.map((table) => {
            const tableUrl = buildMenuUrl(restaurant, table)

            return (
              <article className="table-qr-card" key={table.id}>
                <QRCodeCard
                  title={table.table_name}
                  subtitle={
                    table.table_number
                      ? `Table code: ${table.table_number}`
                      : 'Table-specific customer QR'
                  }
                  url={tableUrl}
                  fileName={`${restaurant.slug || 'spizy'}-${
                    table.table_name
                  }-qr.png`}
                  badge={table.is_active ? 'Active' : 'Inactive'}
                  showToast={showToast}
                  compact
                />

                <div className="table-qr-actions">
                  <button
                    type="button"
                    className={`tiny-button ${
                      table.is_active ? 'danger' : 'success'
                    }`}
                    onClick={() => handleToggleTable(table)}
                  >
                    {table.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                    {table.is_active ? 'Disable' : 'Enable'}
                  </button>

                  <button
                    type="button"
                    className="tiny-button danger"
                    onClick={() => handleDeleteTable(table)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function QRCodeCard({
  title,
  subtitle,
  url,
  fileName,
  badge,
  showToast,
  compact = false,
}) {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    let mounted = true

    QRCode.toDataURL(url, {
      width: compact ? 420 : 560,
      margin: 2,
      color: {
        dark: '#111111',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (mounted) setQrDataUrl(dataUrl)
      })
      .catch((error) => {
        showToast({
          type: 'error',
          title: 'QR generate failed',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to generate QR code.',
        })
      })

    return () => {
      mounted = false
    }
  }, [compact, showToast, url])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)

      showToast({
        type: 'success',
        title: 'Link copied',
        message: 'QR menu link copied to clipboard.',
      })
    } catch {
      showToast({
        type: 'error',
        title: 'Copy failed',
        message: 'Please copy the link manually.',
      })
    }
  }

  const downloadQr = () => {
    if (!qrDataUrl) return

    const link = document.createElement('a')
    link.href = qrDataUrl
    link.download = cleanFileName(fileName || 'spizy-qr.png')
    link.click()
  }

  return (
    <div className={`qr-code-card ${compact ? 'compact' : ''}`}>
      <div className="qr-card-head">
        <div>
          <span className="qr-badge">{badge}</span>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="qr-preview-box">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`${title} QR`} />
        ) : (
          <div className="empty-state compact">Generating QR...</div>
        )}
      </div>

      <div className="qr-link-box">
        <span>{url}</span>
      </div>

      <div className="qr-action-row">
        <button type="button" className="tiny-button" onClick={copyLink}>
          <Copy size={15} />
          Copy
        </button>

        <button type="button" className="tiny-button" onClick={downloadQr}>
          <Download size={15} />
          Download
        </button>

        <button
          type="button"
          className="tiny-button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={15} />
          Open
        </button>
      </div>
    </div>
  )
}

function buildMenuUrl(restaurant, table) {
  const appUrl = (
    import.meta.env.VITE_APP_URL || window.location.origin
  ).replace(/\/$/, '')

  const restaurantSlug = restaurant?.slug || restaurant?.id || 'restaurant'
  const baseUrl = `${appUrl}/menu/${encodeURIComponent(restaurantSlug)}`

  if (!table?.qr_token) return `${baseUrl}?source=live_qr`

  return `${baseUrl}?source=table_qr&table=${table.qr_token}`
}

function cleanFileName(value) {
  return String(value || 'spizy-qr.png')
    .replaceAll(' ', '-')
    .replaceAll('/', '-')
    .toLowerCase()
}

export default TablesQRManagement