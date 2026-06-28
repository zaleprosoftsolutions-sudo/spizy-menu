import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChefHat,
  ClipboardCheck,
  Copy,
  Download,
  Printer,
  ReceiptText,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ReceiptPrintCenterManagement.css'

const defaultPrintSettings = {
  paperWidth: '80',
  template: 'receipt',
  showLogo: true,
  showTaxBreakdown: true,
  showCustomer: true,
  showQrNote: true,
  kitchenGrouping: 'single',
}

function ReceiptPrintCenterManagement({ restaurant, onOpenSection }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrderId, setSelectedOrderId] = useState('demo')
  const [settings, setSettings] = useState(() => readPrintSettings(restaurant?.id))
  const [lastAction, setLastAction] = useState('')
  const [printerChecklist, setPrinterChecklist] = useState(() =>
    readPrinterChecklist(restaurant?.id),
  )

  const currency = restaurant?.currency || 'AED'

  const loadOrders = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: orderData, error } = await supabase
      .from('restaurant_orders')
      .select(
        'id, order_code, public_order_number, order_type, status, payment_method, payment_status, total_amount, paid_amount, tax_amount, discount_amount, service_charge, delivery_fee, packaging_fee, currency, customer_name, customer_phone, table_name, created_at',
      )
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(25)

    if (error) {
      setOrders([])
      setLastAction(error.message || 'Orders could not be loaded.')
      setLoading(false)
      return
    }

    const orderIds = (orderData || []).map((order) => order.id)
    let itemData = []

    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from('restaurant_order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })

      itemData = items || []
    }

    const nextOrders = (orderData || []).map((order) => ({
      ...order,
      items: itemData.filter((item) => item.order_id === order.id),
    }))

    setOrders(nextOrders)
    setSelectedOrderId((current) => {
      if (current && current !== 'demo' && nextOrders.some((order) => order.id === current)) {
        return current
      }

      return nextOrders[0]?.id || 'demo'
    })
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    savePrintSettings(restaurant?.id, settings)
  }, [restaurant?.id, settings])

  useEffect(() => {
    savePrinterChecklist(restaurant?.id, printerChecklist)
  }, [restaurant?.id, printerChecklist])

  const selectedOrder = useMemo(() => {
    if (selectedOrderId === 'demo') return buildDemoOrder({ restaurant, currency })

    return orders.find((order) => order.id === selectedOrderId) || buildDemoOrder({ restaurant, currency })
  }, [currency, orders, restaurant, selectedOrderId])

  const printSummary = useMemo(
    () => buildPrintSummary({ order: selectedOrder, restaurant, settings, currency }),
    [currency, restaurant, selectedOrder, settings],
  )

  const checklistSummary = useMemo(() => {
    const values = Object.values(printerChecklist)
    const completed = values.filter(Boolean).length

    return {
      completed,
      total: values.length,
      score: values.length ? Math.round((completed / values.length) * 100) : 0,
    }
  }, [printerChecklist])

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const toggleChecklist = (key) => {
    setPrinterChecklist((current) => ({ ...current, [key]: !current[key] }))
  }

  const handlePrint = () => {
    setLastAction(`Print dialog opened for ${settings.template === 'kot' ? 'KOT' : 'receipt'} test.`)
    window.setTimeout(() => window.print(), 50)
  }

  const handleCopyText = async () => {
    const text = settings.template === 'kot'
      ? buildKotPlainText(printSummary)
      : buildReceiptPlainText(printSummary)

    try {
      await navigator.clipboard.writeText(text)
      setLastAction('Printable text copied to clipboard.')
    } catch {
      setLastAction('Clipboard copy is not available in this browser.')
    }
  }

  const exportChecklistCsv = () => {
    const rows = [
      ['Area', 'Status'],
      ...printerChecklistItems.map((item) => [
        item.label,
        printerChecklist[item.key] ? 'Completed' : 'Pending',
      ]),
    ]

    downloadCsv(`spizy_print_checklist_${restaurant?.slug || 'restaurant'}.csv`, rows)
  }

  return (
    <section className="spizy-print-center-shell">
      <div className="spizy-print-center-hero">
        <div>
          <p className="pricing-label">Receipt / KOT Print Center</p>
          <h1>Thermal printer readiness</h1>
          <p>
            Prepare customer receipts, kitchen order tickets and printer test sheets before
            production. This screen is safe: it only previews and prints existing/demo orders.
          </p>
        </div>

        <div className="spizy-print-center-actions">
          <button type="button" onClick={loadOrders} disabled={loading}>
            <RefreshCw size={17} />
            {loading ? 'Loading...' : 'Refresh orders'}
          </button>
          <button type="button" className="primary" onClick={handlePrint}>
            <Printer size={17} />
            Print test
          </button>
        </div>
      </div>

      <div className="spizy-print-center-kpis">
        <PrintKpiCard
          icon={<ReceiptText size={20} />}
          label="Recent Orders"
          value={String(orders.length)}
          note="Loaded for print testing"
        />
        <PrintKpiCard
          icon={<Printer size={20} />}
          label="Paper Width"
          value={`${settings.paperWidth}mm`}
          note="Thermal preview width"
        />
        <PrintKpiCard
          icon={<ClipboardCheck size={20} />}
          label="Print QA"
          value={`${checklistSummary.score}%`}
          note={`${checklistSummary.completed}/${checklistSummary.total} checks done`}
        />
        <PrintKpiCard
          icon={<ChefHat size={20} />}
          label="Template"
          value={settings.template === 'kot' ? 'KOT' : 'Receipt'}
          note="Current print mode"
        />
      </div>

      {lastAction && (
        <div className="spizy-print-center-message">
          <AlertTriangle size={17} />
          <span>{lastAction}</span>
        </div>
      )}

      <div className="spizy-print-center-grid">
        <section className="spizy-print-center-panel">
          <div className="spizy-print-center-panel-head">
            <div>
              <p className="pricing-label">Print Settings</p>
              <h2>Choose receipt or kitchen ticket</h2>
            </div>
            <Settings size={20} />
          </div>

          <div className="spizy-print-center-form-grid">
            <label>
              Order
              <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                <option value="demo">Demo order</option>
                {orders.map((order) => (
                  <option value={order.id} key={order.id}>
                    {order.order_code || order.public_order_number || 'Order'} • {formatMoney(order.currency || currency, getOrderTotal(order))}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Template
              <select value={settings.template} onChange={(event) => updateSetting('template', event.target.value)}>
                <option value="receipt">Customer receipt</option>
                <option value="kot">Kitchen order ticket</option>
              </select>
            </label>

            <label>
              Paper width
              <select value={settings.paperWidth} onChange={(event) => updateSetting('paperWidth', event.target.value)}>
                <option value="58">58mm</option>
                <option value="80">80mm</option>
              </select>
            </label>

            <label>
              KOT grouping
              <select value={settings.kitchenGrouping} onChange={(event) => updateSetting('kitchenGrouping', event.target.value)}>
                <option value="single">Single kitchen ticket</option>
                <option value="by_category">Group by category later</option>
              </select>
            </label>
          </div>

          <div className="spizy-print-center-toggle-list">
            <ToggleRow
              label="Show restaurant logo/name header"
              checked={settings.showLogo}
              onChange={() => updateSetting('showLogo', !settings.showLogo)}
            />
            <ToggleRow
              label="Show customer/table details"
              checked={settings.showCustomer}
              onChange={() => updateSetting('showCustomer', !settings.showCustomer)}
            />
            <ToggleRow
              label="Show VAT/tax breakdown"
              checked={settings.showTaxBreakdown}
              onChange={() => updateSetting('showTaxBreakdown', !settings.showTaxBreakdown)}
            />
            <ToggleRow
              label="Show QR/order note footer"
              checked={settings.showQrNote}
              onChange={() => updateSetting('showQrNote', !settings.showQrNote)}
            />
          </div>

          <div className="spizy-print-center-button-row">
            <button type="button" onClick={handlePrint}>
              <Printer size={16} />
              Print preview
            </button>
            <button type="button" onClick={handleCopyText}>
              <Copy size={16} />
              Copy text
            </button>
            <button type="button" onClick={exportChecklistCsv}>
              <Download size={16} />
              Export QA CSV
            </button>
            <button type="button" onClick={() => onOpenSection?.('printers')}>
              <Settings size={16} />
              Printer settings
            </button>
          </div>
        </section>

        <section className="spizy-print-center-panel">
          <div className="spizy-print-center-panel-head">
            <div>
              <p className="pricing-label">Printer QA</p>
              <h2>Real device checklist</h2>
            </div>
            <span className="spizy-print-center-score">{checklistSummary.score}%</span>
          </div>

          <div className="spizy-print-center-checklist">
            {printerChecklistItems.map((item) => (
              <button
                type="button"
                className={printerChecklist[item.key] ? 'done' : ''}
                onClick={() => toggleChecklist(item.key)}
                key={item.key}
              >
                <span>{printerChecklist[item.key] ? '✓' : '○'}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="spizy-print-preview-panel">
        <div className="spizy-print-center-panel-head no-print">
          <div>
            <p className="pricing-label">Live Preview</p>
            <h2>{settings.template === 'kot' ? 'Kitchen Order Ticket' : 'Customer Receipt'}</h2>
          </div>
          <span>{settings.paperWidth}mm thermal style</span>
        </div>

        <div className="spizy-print-preview-wrap">
          <div className={`spizy-thermal-paper paper-${settings.paperWidth}`}>
            {settings.template === 'kot' ? (
              <KitchenTicketPreview summary={printSummary} />
            ) : (
              <ReceiptPreview summary={printSummary} />
            )}
          </div>
        </div>
      </section>
    </section>
  )
}

function PrintKpiCard({ icon, label, value, note }) {
  return (
    <article className="spizy-print-kpi-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <button type="button" className={`spizy-print-toggle-row ${checked ? 'active' : ''}`} onClick={onChange}>
      <span>{checked ? 'ON' : 'OFF'}</span>
      <strong>{label}</strong>
    </button>
  )
}

function ReceiptPreview({ summary }) {
  return (
    <div className="spizy-receipt-preview">
      {summary.settings.showLogo && (
        <header>
          <strong>{summary.restaurantName}</strong>
          <span>{summary.restaurantAddress}</span>
          <span>{summary.restaurantPhone}</span>
        </header>
      )}

      <div className="thermal-divider" />

      <div className="thermal-row">
        <span>Order</span>
        <strong>{summary.orderCode}</strong>
      </div>
      <div className="thermal-row">
        <span>Date</span>
        <strong>{summary.dateLabel}</strong>
      </div>
      <div className="thermal-row">
        <span>Type</span>
        <strong>{summary.orderTypeLabel}</strong>
      </div>

      {summary.settings.showCustomer && (
        <>
          <div className="thermal-row">
            <span>Customer</span>
            <strong>{summary.customerName}</strong>
          </div>
          <div className="thermal-row">
            <span>Table</span>
            <strong>{summary.tableName}</strong>
          </div>
        </>
      )}

      <div className="thermal-divider" />

      <div className="thermal-items">
        {summary.items.map((item) => (
          <div className="thermal-item" key={item.key}>
            <div>
              <strong>{item.name}</strong>
              {item.note && <span>{item.note}</span>}
            </div>
            <span>{item.quantity} x {formatMoney(summary.currency, item.unitPrice)}</span>
            <strong>{formatMoney(summary.currency, item.total)}</strong>
          </div>
        ))}
      </div>

      <div className="thermal-divider" />

      <ThermalAmountRow label="Subtotal" value={summary.subtotal} currency={summary.currency} />
      {summary.discount > 0 && <ThermalAmountRow label="Discount" value={-summary.discount} currency={summary.currency} />}
      {summary.serviceCharge > 0 && <ThermalAmountRow label="Service" value={summary.serviceCharge} currency={summary.currency} />}
      {summary.deliveryFee > 0 && <ThermalAmountRow label="Delivery" value={summary.deliveryFee} currency={summary.currency} />}
      {summary.packagingFee > 0 && <ThermalAmountRow label="Packaging" value={summary.packagingFee} currency={summary.currency} />}
      {summary.settings.showTaxBreakdown && (
        <ThermalAmountRow label="VAT / Tax" value={summary.taxAmount} currency={summary.currency} />
      )}

      <div className="thermal-total-row">
        <span>Total</span>
        <strong>{formatMoney(summary.currency, summary.total)}</strong>
      </div>

      <div className="thermal-row">
        <span>Payment</span>
        <strong>{summary.paymentLabel}</strong>
      </div>

      {summary.settings.showQrNote && (
        <footer>
          <span>Thank you for dining with us.</span>
          <span>Powered by Spizy Menu</span>
        </footer>
      )}
    </div>
  )
}

function KitchenTicketPreview({ summary }) {
  return (
    <div className="spizy-receipt-preview kot">
      <header>
        <strong>KITCHEN ORDER TICKET</strong>
        <span>{summary.restaurantName}</span>
      </header>

      <div className="thermal-divider" />

      <div className="thermal-row big">
        <span>Order</span>
        <strong>{summary.orderCode}</strong>
      </div>
      <div className="thermal-row big">
        <span>Type</span>
        <strong>{summary.orderTypeLabel}</strong>
      </div>
      <div className="thermal-row big">
        <span>Table</span>
        <strong>{summary.tableName}</strong>
      </div>
      <div className="thermal-row">
        <span>Time</span>
        <strong>{summary.timeLabel}</strong>
      </div>

      <div className="thermal-divider" />

      <div className="thermal-kot-items">
        {summary.items.map((item) => (
          <div className="thermal-kot-item" key={item.key}>
            <strong>{item.quantity} x {item.name}</strong>
            {item.note && <span>{item.note}</span>}
          </div>
        ))}
      </div>

      <div className="thermal-divider" />
      <footer>
        <span>Prepared by: __________</span>
        <span>Checked by: __________</span>
      </footer>
    </div>
  )
}

function ThermalAmountRow({ label, value, currency }) {
  return (
    <div className="thermal-row">
      <span>{label}</span>
      <strong>{formatMoney(currency, value)}</strong>
    </div>
  )
}

function buildPrintSummary({ order, restaurant, settings, currency }) {
  const safeOrder = order || {}
  const orderCurrency = safeOrder.currency || currency || 'AED'
  const items = normalizePrintItems(safeOrder.items, orderCurrency)
  const itemSubtotal = items.reduce((total, item) => total + Number(item.total || 0), 0)
  const fallbackTotal = getOrderTotal(safeOrder) || itemSubtotal
  const discount = Number(safeOrder.discount_amount || safeOrder.discount_total || 0)
  const serviceCharge = Number(safeOrder.service_charge || 0)
  const deliveryFee = Number(safeOrder.delivery_fee || 0)
  const packagingFee = Number(safeOrder.packaging_fee || 0)
  const taxAmount = Number(safeOrder.tax_amount || safeOrder.vat_amount || 0)
  const subtotal = Math.max(
    itemSubtotal || fallbackTotal - taxAmount - serviceCharge - deliveryFee - packagingFee + discount,
    0,
  )

  return {
    restaurantName: order?.restaurant_name || restaurant?.name || 'Restaurant',
    restaurantAddress: order?.restaurant_address || restaurant?.address || '',
    restaurantPhone: order?.restaurant_phone || restaurant?.phone || restaurant?.whatsapp_phone || '',
    orderCode: safeOrder.order_code || safeOrder.public_order_number || 'DEMO-001',
    dateLabel: formatDateTime(safeOrder.created_at),
    timeLabel: formatTime(safeOrder.created_at),
    orderTypeLabel: formatOrderType(safeOrder.order_type),
    customerName: safeOrder.customer_name || 'Walk-in customer',
    tableName: safeOrder.table_name || (safeOrder.order_type === 'dine_in' ? 'Table' : '-'),
    paymentLabel: formatPaymentLabel(safeOrder),
    currency: orderCurrency,
    items,
    subtotal,
    discount,
    serviceCharge,
    deliveryFee,
    packagingFee,
    taxAmount,
    total: fallbackTotal,
    settings,
  }
}

function normalizePrintItems(items = []) {
  const rows = Array.isArray(items) ? items : []

  if (rows.length === 0) {
    return [
      {
        key: 'demo-1',
        name: 'Signature Burger',
        note: 'No onion',
        quantity: 2,
        unitPrice: 24,
        total: 48,
      },
      {
        key: 'demo-2',
        name: 'Fresh Lime Soda',
        note: '',
        quantity: 2,
        unitPrice: 8,
        total: 16,
      },
    ]
  }

  return rows.map((item, index) => {
    const quantity = Number(item.quantity || 1)
    const unitPrice = Number(item.unit_price ?? item.price ?? item.item_price ?? 0)
    const total = Number(item.total_price ?? item.line_total ?? item.total_amount ?? quantity * unitPrice)

    return {
      key: item.id || `${item.item_name || item.name}-${index}`,
      name: [item.item_name, item.variation_name].filter(Boolean).join(' - ') || item.name || 'Menu item',
      note: item.notes || item.special_instructions || '',
      quantity,
      unitPrice,
      total,
    }
  })
}

function buildDemoOrder({ restaurant, currency }) {
  return {
    id: 'demo',
    restaurant_name: restaurant?.name || 'Spizy Demo Restaurant',
    restaurant_address: restaurant?.address || 'Restaurant address',
    restaurant_phone: restaurant?.phone || restaurant?.whatsapp_phone || '',
    order_code: 'DEMO-001',
    order_type: 'dine_in',
    status: 'preparing',
    payment_status: 'unpaid',
    payment_method: 'cash',
    currency: currency || restaurant?.currency || 'AED',
    customer_name: 'Walk-in customer',
    table_name: 'Table 04',
    created_at: new Date().toISOString(),
    tax_amount: 3.2,
    discount_amount: 0,
    service_charge: 0,
    delivery_fee: 0,
    packaging_fee: 0,
    total_amount: 67.2,
    items: [],
  }
}

function buildReceiptPlainText(summary) {
  const lines = [
    summary.restaurantName,
    summary.restaurantAddress,
    `Order: ${summary.orderCode}`,
    `Date: ${summary.dateLabel}`,
    `Type: ${summary.orderTypeLabel}`,
    '-------------------------',
    ...summary.items.map((item) => `${item.quantity} x ${item.name} ${formatMoney(summary.currency, item.total)}`),
    '-------------------------',
    `Subtotal: ${formatMoney(summary.currency, summary.subtotal)}`,
    `Tax: ${formatMoney(summary.currency, summary.taxAmount)}`,
    `Total: ${formatMoney(summary.currency, summary.total)}`,
    `Payment: ${summary.paymentLabel}`,
    'Thank you.',
  ]

  return lines.filter(Boolean).join('\n')
}

function buildKotPlainText(summary) {
  const lines = [
    'KITCHEN ORDER TICKET',
    `Order: ${summary.orderCode}`,
    `Type: ${summary.orderTypeLabel}`,
    `Table: ${summary.tableName}`,
    '-------------------------',
    ...summary.items.map((item) => `${item.quantity} x ${item.name}${item.note ? ` - ${item.note}` : ''}`),
    '-------------------------',
    'Prepared by: __________',
  ]

  return lines.join('\n')
}

function readPrintSettings(restaurantId) {
  return {
    ...defaultPrintSettings,
    ...readJson(getPrintSettingsKey(restaurantId), {}),
  }
}

function savePrintSettings(restaurantId, value) {
  writeJson(getPrintSettingsKey(restaurantId), value)
}

function getPrintSettingsKey(restaurantId) {
  return `spizy_print_settings_${restaurantId || 'global'}`
}

function readPrinterChecklist(restaurantId) {
  return {
    mobilePrintTest: false,
    receiptWidthTest: false,
    kotKitchenTest: false,
    cashDrawerTest: false,
    qrOrderReceiptTest: false,
    poorNetworkPrintTest: false,
    ...readJson(getPrinterChecklistKey(restaurantId), {}),
  }
}

function savePrinterChecklist(restaurantId, value) {
  writeJson(getPrinterChecklistKey(restaurantId), value)
}

function getPrinterChecklistKey(restaurantId) {
  return `spizy_printer_checklist_${restaurantId || 'global'}`
}

const printerChecklistItems = [
  {
    key: 'mobilePrintTest',
    label: 'Mobile browser print tested',
    note: 'Open owner dashboard on mobile and print a test receipt.',
  },
  {
    key: 'receiptWidthTest',
    label: '58mm / 80mm receipt width checked',
    note: 'Confirm text does not overflow on the actual thermal printer.',
  },
  {
    key: 'kotKitchenTest',
    label: 'Kitchen KOT readability checked',
    note: 'Chef can clearly read item quantity, modifiers and table.',
  },
  {
    key: 'cashDrawerTest',
    label: 'Cash drawer / counter handover checked',
    note: 'Cashier can attach printed receipt to drawer close workflow.',
  },
  {
    key: 'qrOrderReceiptTest',
    label: 'QR order receipt tested',
    note: 'Place table QR order, complete bill, then print receipt.',
  },
  {
    key: 'poorNetworkPrintTest',
    label: 'Poor-network print fallback checked',
    note: 'Use copy text or browser print when direct printer is unavailable.',
  },
]

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local checklist storage is best effort only.
  }
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsvValue(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function getOrderTotal(order) {
  return Number(order?.total_amount ?? order?.grand_total ?? order?.amount ?? 0)
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
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value ? new Date(value) : new Date())
  } catch {
    return 'Today'
  }
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(value ? new Date(value) : new Date())
  } catch {
    return 'Now'
  }
}

function formatOrderType(type) {
  if (type === 'dine_in') return 'Dine-in'
  if (type === 'delivery') return 'Delivery'
  if (type === 'takeaway') return 'Takeaway'
  return 'Counter'
}

function formatPaymentLabel(order) {
  const status = String(order?.payment_status || 'pending').replace(/[_-]+/g, ' ')
  const method = String(order?.payment_method || 'cash').replace(/[_-]+/g, ' ')

  return `${method} • ${status}`.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default ReceiptPrintCenterManagement
