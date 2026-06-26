import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  Copy,
  FileText,
  MonitorCheck,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Settings2,
  TestTube2,
  Utensils,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './PrintSettingsManagement.css'

const defaultSettings = {
  printer_mode: 'browser_print',
  paper_size: '80mm',
  receipt_print_enabled: true,
  kitchen_print_enabled: true,
  auto_print_pos_order: false,
  auto_print_customer_order: false,
  receipt_title: 'Tax Invoice / Receipt',
  receipt_footer_note: 'Thank you. Visit again.',
  tax_registration_number: '',
  invoice_prefix: 'INV',
  next_invoice_number: 1001,
  receipt_copy_count: 1,
  show_restaurant_logo: true,
  show_customer_info: true,
  show_payment_info: true,
  show_qr_code: false,
  kot_group_by_category: true,
  kot_show_customer_notes: true,
  kot_show_table_name: true,
  kot_large_item_text: true,
  kot_highlight_variations: true,
  print_header_text: '',
  print_footer_text: '',
}

const paperOptions = [
  { value: '58mm', label: '58 mm thermal', description: 'Small receipt printers' },
  { value: '80mm', label: '80 mm thermal', description: 'Recommended for restaurant POS' },
  { value: 'a4', label: 'A4 invoice', description: 'Office printer / tax invoice' },
]

const modeOptions = [
  {
    value: 'browser_print',
    label: 'Browser print',
    description: 'Use normal browser print dialog from POS / Orders.',
  },
  {
    value: 'silent_print_later',
    label: 'Silent print - later',
    description: 'Foundation for local printer agent / Android print bridge.',
  },
  {
    value: 'manual_only',
    label: 'Manual only',
    description: 'Do not auto open print. Staff prints only when needed.',
  },
]

function PrintSettingsManagement({ restaurant }) {
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const testPrintRef = useRef(null)

  const selectedPaper = useMemo(
    () => paperOptions.find((option) => option.value === settings.paper_size),
    [settings.paper_size],
  )

  useEffect(() => {
    loadPrintSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id])

  const loadPrintSettings = async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_print_settings')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle()

    if (!error && data) {
      setSettings({ ...defaultSettings, ...data })
    }

    setLoading(false)
  }

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const toggleSetting = (key) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }))
  }

  const handleSave = async () => {
    if (!restaurant?.id) return

    setSaving(true)
    setMessage('')

    const payload = {
      ...settings,
      restaurant_id: restaurant.id,
      next_invoice_number: Number(settings.next_invoice_number || 1001),
      receipt_copy_count: Math.max(
        1,
        Math.min(Number(settings.receipt_copy_count || 1), 5),
      ),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('restaurant_print_settings')
      .upsert(payload, { onConflict: 'restaurant_id' })

    setSaving(false)

    if (error) {
      setMessage(error.message || 'Failed to save print settings.')
      return
    }

    setSettings(payload)
    setMessage('Print settings saved successfully.')
  }

  const resetToDefault = () => {
    setSettings(defaultSettings)
    setMessage('Default print settings loaded. Click Save to apply.')
  }

  const copyPrintNotes = async () => {
    const text = [
      `Printer mode: ${formatMode(settings.printer_mode)}`,
      `Paper size: ${settings.paper_size}`,
      `Receipt title: ${settings.receipt_title}`,
      `Invoice prefix: ${settings.invoice_prefix}`,
      `KOT enabled: ${settings.kitchen_print_enabled ? 'Yes' : 'No'}`,
      `Receipt enabled: ${settings.receipt_print_enabled ? 'Yes' : 'No'}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setMessage('Print setup copied.')
    } catch {
      setMessage('Unable to copy in this browser.')
    }
  }

  const handleTestPrint = () => {
    const printContent = testPrintRef.current?.innerHTML

    if (!printContent) return

    const printWindow = window.open('', '_blank', 'width=420,height=720')

    if (!printWindow) {
      setMessage('Popup blocked. Please allow popup to test print.')
      return
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Spizy Test Print</title>
          <style>
            body { margin: 0; padding: 16px; font-family: Arial, sans-serif; color: #111; }
            .test-receipt { max-width: ${settings.paper_size === '58mm' ? '220px' : settings.paper_size === 'a4' ? '720px' : '310px'}; margin: 0 auto; }
            .center { text-align: center; }
            .row { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px dashed #999; padding: 6px 0; }
            .total { font-weight: 800; font-size: 18px; border-top: 2px solid #111; margin-top: 8px; padding-top: 8px; }
            .small { font-size: 12px; color: #444; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  if (loading) {
    return (
      <section className="print-settings-shell">
        <div className="print-settings-loading">Loading print settings...</div>
      </section>
    )
  }

  return (
    <section className="print-settings-shell">
      <div className="print-settings-hero">
        <div>
          <p>Printer & receipts</p>
          <h1>Print settings</h1>
          <span>
            Configure thermal receipt, kitchen KOT and invoice print behavior for
            POS and online orders.
          </span>
        </div>

        <div className="print-settings-actions">
          <button type="button" className="ghost" onClick={copyPrintNotes}>
            <Copy size={16} />
            Copy setup
          </button>

          <button type="button" className="ghost" onClick={resetToDefault}>
            <RotateCcw size={16} />
            Defaults
          </button>

          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>

      {message && <div className="print-settings-message">{message}</div>}

      <div className="print-settings-stats">
        <PrintStatCard
          icon={<Printer size={22} />}
          label="Printer mode"
          value={formatMode(settings.printer_mode)}
        />
        <PrintStatCard
          icon={<ReceiptText size={22} />}
          label="Receipt paper"
          value={selectedPaper?.label || settings.paper_size}
        />
        <PrintStatCard
          icon={<Utensils size={22} />}
          label="Kitchen KOT"
          value={settings.kitchen_print_enabled ? 'Enabled' : 'Disabled'}
        />
        <PrintStatCard
          icon={<BadgeCheck size={22} />}
          label="Receipt copies"
          value={`${settings.receipt_copy_count || 1} copy`}
        />
      </div>

      <div className="print-settings-grid">
        <div className="print-settings-card wide">
          <div className="print-card-title">
            <Settings2 size={20} />
            <div>
              <h2>Print behavior</h2>
              <p>Choose how Spizy should handle bills and KOT printing.</p>
            </div>
          </div>

          <div className="print-option-grid">
            {modeOptions.map((mode) => (
              <button
                type="button"
                className={`print-choice ${
                  settings.printer_mode === mode.value ? 'active' : ''
                }`}
                onClick={() => updateSetting('printer_mode', mode.value)}
                key={mode.value}
              >
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </button>
            ))}
          </div>

          <div className="print-option-grid paper">
            {paperOptions.map((paper) => (
              <button
                type="button"
                className={`print-choice ${
                  settings.paper_size === paper.value ? 'active' : ''
                }`}
                onClick={() => updateSetting('paper_size', paper.value)}
                key={paper.value}
              >
                <strong>{paper.label}</strong>
                <span>{paper.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="print-settings-card">
          <div className="print-card-title">
            <ReceiptText size={20} />
            <div>
              <h2>Receipt / invoice</h2>
              <p>Text and visibility controls for customer receipts.</p>
            </div>
          </div>

          <div className="print-form-stack">
            <label>
              Receipt title
              <input
                type="text"
                value={settings.receipt_title || ''}
                onChange={(event) => updateSetting('receipt_title', event.target.value)}
                placeholder="Tax Invoice / Receipt"
              />
            </label>

            <label>
              Tax registration number
              <input
                type="text"
                value={settings.tax_registration_number || ''}
                onChange={(event) =>
                  updateSetting('tax_registration_number', event.target.value)
                }
                placeholder="TRN / VAT / GST number"
              />
            </label>

            <div className="print-two-cols">
              <label>
                Invoice prefix
                <input
                  type="text"
                  value={settings.invoice_prefix || ''}
                  onChange={(event) =>
                    updateSetting('invoice_prefix', event.target.value.toUpperCase())
                  }
                  placeholder="INV"
                />
              </label>

              <label>
                Next number
                <input
                  type="number"
                  min="1"
                  value={settings.next_invoice_number || 1001}
                  onChange={(event) =>
                    updateSetting('next_invoice_number', event.target.value)
                  }
                />
              </label>
            </div>

            <label>
              Footer note
              <textarea
                value={settings.receipt_footer_note || ''}
                onChange={(event) =>
                  updateSetting('receipt_footer_note', event.target.value)
                }
                placeholder="Thank you. Visit again."
                rows="3"
              />
            </label>

            <div className="print-two-cols">
              <label>
                Receipt copies
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.receipt_copy_count || 1}
                  onChange={(event) =>
                    updateSetting('receipt_copy_count', event.target.value)
                  }
                />
              </label>
            </div>
          </div>
        </div>

        <div className="print-settings-card">
          <div className="print-card-title">
            <Utensils size={20} />
            <div>
              <h2>Kitchen KOT</h2>
              <p>Kitchen ticket controls for preparation team.</p>
            </div>
          </div>

          <div className="print-toggle-list">
            <PrintToggle
              label="Enable kitchen KOT"
              text="Allow kitchen ticket printing from Orders / Kitchen Display."
              checked={settings.kitchen_print_enabled}
              onClick={() => toggleSetting('kitchen_print_enabled')}
            />
            <PrintToggle
              label="Group items by category"
              text="Useful for kitchen sections like grill, drinks and desserts."
              checked={settings.kot_group_by_category}
              onClick={() => toggleSetting('kot_group_by_category')}
            />
            <PrintToggle
              label="Show customer notes"
              text="Print special notes and preparation requests on KOT."
              checked={settings.kot_show_customer_notes}
              onClick={() => toggleSetting('kot_show_customer_notes')}
            />
            <PrintToggle
              label="Show table name"
              text="Important for dine-in service and waiter handover."
              checked={settings.kot_show_table_name}
              onClick={() => toggleSetting('kot_show_table_name')}
            />
            <PrintToggle
              label="Large item text"
              text="Make kitchen item names easier to read."
              checked={settings.kot_large_item_text}
              onClick={() => toggleSetting('kot_large_item_text')}
            />
            <PrintToggle
              label="Highlight variations"
              text="Bold item options like spicy, size, sugar level or add-ons."
              checked={settings.kot_highlight_variations}
              onClick={() => toggleSetting('kot_highlight_variations')}
            />
          </div>
        </div>

        <div className="print-settings-card">
          <div className="print-card-title">
            <MonitorCheck size={20} />
            <div>
              <h2>Auto print rules</h2>
              <p>Foundation for future auto-print and printer bridge.</p>
            </div>
          </div>

          <div className="print-toggle-list">
            <PrintToggle
              label="Enable receipt printing"
              text="Allow receipt print buttons in POS and Orders."
              checked={settings.receipt_print_enabled}
              onClick={() => toggleSetting('receipt_print_enabled')}
            />
            <PrintToggle
              label="Auto print POS orders"
              text="After counter checkout, open receipt print automatically."
              checked={settings.auto_print_pos_order}
              onClick={() => toggleSetting('auto_print_pos_order')}
            />
            <PrintToggle
              label="Auto print customer online orders"
              text="Later phase: print KOT when customer places QR/delivery order."
              checked={settings.auto_print_customer_order}
              onClick={() => toggleSetting('auto_print_customer_order')}
            />
            <PrintToggle
              label="Show restaurant logo"
              text="Use logo in customer receipt header if available."
              checked={settings.show_restaurant_logo}
              onClick={() => toggleSetting('show_restaurant_logo')}
            />
            <PrintToggle
              label="Show customer info"
              text="Print customer name, phone, table or delivery address."
              checked={settings.show_customer_info}
              onClick={() => toggleSetting('show_customer_info')}
            />
            <PrintToggle
              label="Show payment info"
              text="Print payment method and paid/unpaid status."
              checked={settings.show_payment_info}
              onClick={() => toggleSetting('show_payment_info')}
            />
            <PrintToggle
              label="Show QR code"
              text="Future support for receipt QR / review QR / tax QR."
              checked={settings.show_qr_code}
              onClick={() => toggleSetting('show_qr_code')}
            />
          </div>
        </div>

        <div className="print-settings-card preview">
          <div className="print-card-title">
            <TestTube2 size={20} />
            <div>
              <h2>Test receipt</h2>
              <p>Preview and test browser printing with selected paper width.</p>
            </div>
          </div>

          <div className={`print-receipt-preview paper-${settings.paper_size}`} ref={testPrintRef}>
            <div className="test-receipt">
              <div className="center">
                <strong>{restaurant?.name || 'Restaurant Name'}</strong>
                <div className="small">{restaurant?.address || 'Restaurant address'}</div>
                {settings.tax_registration_number && (
                  <div className="small">TRN: {settings.tax_registration_number}</div>
                )}
                <h3>{settings.receipt_title || 'Receipt'}</h3>
                <div className="small">
                  {settings.invoice_prefix || 'INV'}-{settings.next_invoice_number || 1001}
                </div>
              </div>

              <div className="row">
                <span>Chicken Biryani × 1</span>
                <strong>AED 12.00</strong>
              </div>
              <div className="row">
                <span>Fresh Juice × 2</span>
                <strong>AED 16.00</strong>
              </div>
              <div className="row total">
                <span>Total</span>
                <strong>AED 28.00</strong>
              </div>
              <div className="center small">{settings.receipt_footer_note}</div>
            </div>
          </div>

          <button type="button" className="print-test-button" onClick={handleTestPrint}>
            <Printer size={16} />
            Test print
          </button>
        </div>

        <div className="print-settings-card notes">
          <div className="print-card-title">
            <FileText size={20} />
            <div>
              <h2>Implementation note</h2>
              <p>Current browser print is ready. Silent printing needs a local bridge.</p>
            </div>
          </div>

          <div className="print-note-box">
            <strong>Current phase</strong>
            <span>
              Browser print opens the normal system print dialog. This works on
              desktop, tablet and Android browsers.
            </span>
          </div>

          <div className="print-note-box">
            <strong>Next printer phase</strong>
            <span>
              Connect local Android POS printer, ESC/POS thermal printer or a
              small Spizy printer agent for silent KOT printing.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function PrintStatCard({ icon, label, value }) {
  return (
    <article className="print-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function PrintToggle({ label, text, checked, onClick }) {
  return (
    <button
      type="button"
      className={`print-toggle-row ${checked ? 'active' : ''}`}
      onClick={onClick}
    >
      <span>
        <strong>{label}</strong>
        <small>{text}</small>
      </span>
      <i>{checked ? 'On' : 'Off'}</i>
    </button>
  )
}

function formatMode(value) {
  if (value === 'silent_print_later') return 'Silent later'
  if (value === 'manual_only') return 'Manual only'
  return 'Browser print'
}

export default PrintSettingsManagement
