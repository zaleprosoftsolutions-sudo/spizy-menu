import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Calculator,
  CalendarDays,
  CreditCard,
  Landmark,
  ReceiptText,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './FinanceManagement.css'

const rangeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

function FinanceManagement({ restaurant }) {
  const [orders, setOrders] = useState([])
  const [purchases, setPurchases] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('30d')

  const currency = restaurant?.currency || 'AED'

  const loadFinance = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [ordersResult, purchasesResult, expensesResult] = await Promise.all([
      supabase
        .from('restaurant_orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_purchases')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('purchase_date', { ascending: false }),
      supabase
        .from('restaurant_expenses')
        .select('*, category:restaurant_expense_categories(id, name)')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('expense_date', { ascending: false }),
    ])

    setOrders(ordersResult.data || [])
    setPurchases(purchasesResult.data || [])
    setExpenses(expensesResult.data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadFinance()
  }, [loadFinance])

  const filteredOrders = useMemo(
    () => filterByRange(orders, range, 'created_at'),
    [orders, range],
  )

  const filteredPurchases = useMemo(
    () => filterByRange(purchases, range, 'purchase_date'),
    [purchases, range],
  )

  const filteredExpenses = useMemo(
    () => filterByRange(expenses, range, 'expense_date'),
    [expenses, range],
  )

  const finance = useMemo(() => {
    const validOrders = filteredOrders.filter(
      (order) => order.status !== 'cancelled',
    )
    const paidOrders = validOrders.filter(
      (order) => order.payment_status === 'paid',
    )
    const unpaidOrders = validOrders.filter(
      (order) => order.payment_status !== 'paid',
    )
    const receivedPurchases = filteredPurchases.filter(
      (purchase) => purchase.status === 'received',
    )
    const draftPurchases = filteredPurchases.filter(
      (purchase) => purchase.status === 'draft',
    )

    const grossSales = sumBy(validOrders, 'total_amount')
    const collectedSales = sumBy(paidOrders, 'total_amount')
    const unpaidSales = sumBy(unpaidOrders, 'total_amount')
    const salesTax = sumBy(validOrders, 'tax_amount')
    const salesDiscounts = sumBy(validOrders, 'discount_amount')
    const salesExtras = sumBy(validOrders, 'extra_amount')

    const purchaseTotal = sumBy(receivedPurchases, 'total_amount')
    const purchasePaid = sumBy(receivedPurchases, 'amount_paid')
    const purchaseDue = receivedPurchases.reduce(
      (total, purchase) =>
        total +
        Math.max(
          Number(purchase.total_amount || 0) - Number(purchase.amount_paid || 0),
          0,
        ),
      0,
    )
    const draftPurchaseTotal = sumBy(draftPurchases, 'total_amount')

    const expenseTotal = sumBy(filteredExpenses, 'total_amount')
    const expenseTax = sumBy(filteredExpenses, 'tax_amount')
    const directCost = purchaseTotal
    const grossProfit = collectedSales - directCost
    const netProfit = collectedSales - directCost - expenseTotal
    const cashIn = paidOrders.reduce((total, order) => {
      if (normalisePayment(order.payment_method) === 'cash') {
        return total + Number(order.total_amount || 0)
      }
      return total
    }, 0)
    const cashOut =
      filteredExpenses
        .filter((expense) => normalisePayment(expense.payment_method) === 'cash')
        .reduce((total, expense) => total + Number(expense.total_amount || 0), 0) +
      receivedPurchases
        .filter((purchase) => normalisePayment(purchase.payment_method) === 'cash')
        .reduce((total, purchase) => total + Number(purchase.amount_paid || 0), 0)

    return {
      grossSales,
      collectedSales,
      unpaidSales,
      salesTax,
      salesDiscounts,
      salesExtras,
      purchaseTotal,
      purchasePaid,
      purchaseDue,
      draftPurchaseTotal,
      expenseTotal,
      expenseTax,
      directCost,
      grossProfit,
      netProfit,
      cashIn,
      cashOut,
      cashBalance: cashIn - cashOut,
      paidOrders: paidOrders.length,
      unpaidOrders: unpaidOrders.length,
      totalOrders: validOrders.length,
      receivedPurchases: receivedPurchases.length,
      expenseCount: filteredExpenses.length,
    }
  }, [filteredExpenses, filteredOrders, filteredPurchases])

  const paymentBreakdown = useMemo(() => {
    const paidOrders = filteredOrders.filter(
      (order) => order.status !== 'cancelled' && order.payment_status === 'paid',
    )

    return buildAmountBreakdown(paidOrders, 'payment_method', 'total_amount')
  }, [filteredOrders])

  const expenseBreakdown = useMemo(() => {
    const grouped = new Map()

    filteredExpenses.forEach((expense) => {
      const categoryName = expense.category?.name || 'Uncategorised'
      const existing = grouped.get(categoryName) || {
        label: categoryName,
        amount: 0,
        count: 0,
      }

      existing.amount += Number(expense.total_amount || 0)
      existing.count += 1
      grouped.set(categoryName, existing)
    })

    return Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
  }, [filteredExpenses])

  const supplierDues = useMemo(() => {
    const grouped = new Map()

    filteredPurchases
      .filter((purchase) => purchase.status === 'received')
      .forEach((purchase) => {
        const dueAmount = Math.max(
          Number(purchase.total_amount || 0) - Number(purchase.amount_paid || 0),
          0,
        )

        if (dueAmount <= 0) return

        const supplierName =
          purchase.supplier_name || purchase.invoice_number || 'Supplier due'
        const existing = grouped.get(supplierName) || {
          label: supplierName,
          amount: 0,
          count: 0,
        }

        existing.amount += dueAmount
        existing.count += 1
        grouped.set(supplierName, existing)
      })

    return Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
  }, [filteredPurchases])

  const financeHealth = getFinanceHealth(finance.netProfit)

  if (loading) {
    return (
      <section className="management-section finance-screen">
        <div className="finance-loading-card">
          <Calculator size={38} />
          <h2>Loading finance...</h2>
          <p>Spizy is preparing profit, expense and cash flow summary.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section finance-screen">
      <header className="finance-header">
        <div>
          <p className="section-kicker">Finance</p>
          <h2>Profit, cash flow and dues</h2>
          <span>
            Simple restaurant finance view from paid sales, purchases, supplier
            dues and recorded expenses.
          </span>
        </div>

        <div className="finance-actions">
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {rangeOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="button" onClick={loadFinance}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <div className="finance-hero-grid">
        <div className={`finance-profit-card ${financeHealth.className}`}>
          <div className="finance-profit-top">
            <div>
              <span>Estimated net profit</span>
              <strong>{formatMoney(finance.netProfit, currency)}</strong>
            </div>

            <div className="finance-profit-icon">
              {finance.netProfit >= 0 ? (
                <TrendingUp size={28} />
              ) : (
                <TrendingDown size={28} />
              )}
            </div>
          </div>

          <p>{financeHealth.text}</p>

          <div className="finance-profit-math">
            <span>Collected sales</span>
            <strong>{formatMoney(finance.collectedSales, currency)}</strong>
            <span>Purchases / stock-in</span>
            <strong>-{formatMoney(finance.purchaseTotal, currency)}</strong>
            <span>Expenses</span>
            <strong>-{formatMoney(finance.expenseTotal, currency)}</strong>
          </div>
        </div>

        <div className="finance-mini-grid">
          <FinanceStatCard
            icon={WalletCards}
            label="Collected sales"
            value={formatMoney(finance.collectedSales, currency)}
            note={`${finance.paidOrders} paid orders`}
          />
          <FinanceStatCard
            icon={ReceiptText}
            label="Unpaid bills"
            value={formatMoney(finance.unpaidSales, currency)}
            note={`${finance.unpaidOrders} unpaid orders`}
          />
          <FinanceStatCard
            icon={ArrowDownLeft}
            label="Purchases"
            value={formatMoney(finance.purchaseTotal, currency)}
            note={`${finance.receivedPurchases} received bills`}
          />
          <FinanceStatCard
            icon={ArrowUpRight}
            label="Expenses"
            value={formatMoney(finance.expenseTotal, currency)}
            note={`${finance.expenseCount} entries`}
          />
        </div>
      </div>

      <div className="finance-section-grid">
        <section className="finance-panel">
          <div className="finance-panel-head">
            <div>
              <h3>Cashbook snapshot</h3>
              <p>Cash collected minus cash payments recorded in expenses and purchases.</p>
            </div>
            <Banknote size={20} />
          </div>

          <div className="finance-cash-row positive">
            <span>Cash in</span>
            <strong>{formatMoney(finance.cashIn, currency)}</strong>
          </div>
          <div className="finance-cash-row negative">
            <span>Cash out</span>
            <strong>{formatMoney(finance.cashOut, currency)}</strong>
          </div>
          <div className="finance-cash-row final">
            <span>Estimated cash balance</span>
            <strong>{formatMoney(finance.cashBalance, currency)}</strong>
          </div>
        </section>

        <section className="finance-panel">
          <div className="finance-panel-head">
            <div>
              <h3>Payment collection</h3>
              <p>Paid sales grouped by payment method.</p>
            </div>
            <CreditCard size={20} />
          </div>

          {paymentBreakdown.length === 0 ? (
            <div className="finance-empty-line">No paid collections found.</div>
          ) : (
            <div className="finance-breakdown-list">
              {paymentBreakdown.map((item) => (
                <FinanceBreakdownRow
                  item={item}
                  total={finance.collectedSales}
                  currency={currency}
                  key={item.label}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="finance-section-grid three">
        <section className="finance-panel">
          <div className="finance-panel-head compact">
            <div>
              <h3>Sales details</h3>
              <p>Gross sales, tax, discounts and extras.</p>
            </div>
            <CalendarDays size={19} />
          </div>

          <FinanceLine label="Gross sales" value={finance.grossSales} currency={currency} />
          <FinanceLine label="Collected" value={finance.collectedSales} currency={currency} />
          <FinanceLine label="Tax in sales" value={finance.salesTax} currency={currency} />
          <FinanceLine label="Discounts" value={finance.salesDiscounts} currency={currency} negative />
          <FinanceLine label="Extra / fees" value={finance.salesExtras} currency={currency} />
        </section>

        <section className="finance-panel">
          <div className="finance-panel-head compact">
            <div>
              <h3>Top expenses</h3>
              <p>Largest expense categories.</p>
            </div>
            <Landmark size={19} />
          </div>

          {expenseBreakdown.length === 0 ? (
            <div className="finance-empty-line">No expense entries yet.</div>
          ) : (
            expenseBreakdown.map((item) => (
              <FinanceBreakdownRow
                item={item}
                total={finance.expenseTotal}
                currency={currency}
                key={item.label}
                compact
              />
            ))
          )}
        </section>

        <section className="finance-panel">
          <div className="finance-panel-head compact">
            <div>
              <h3>Supplier dues</h3>
              <p>Unpaid purchase balance.</p>
            </div>
            <ReceiptText size={19} />
          </div>

          <FinanceLine label="Purchase paid" value={finance.purchasePaid} currency={currency} />
          <FinanceLine label="Supplier due" value={finance.purchaseDue} currency={currency} warning />
          <FinanceLine label="Draft purchases" value={finance.draftPurchaseTotal} currency={currency} />

          {supplierDues.length > 0 && (
            <div className="finance-due-list">
              {supplierDues.map((item) => (
                <div className="finance-due-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatMoney(item.amount, currency)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="finance-note-card">
        <strong>Accounting note</strong>
        <span>
          This foundation gives restaurant owners a quick business view. It uses
          paid sales as income, received purchases as stock cost, and expense
          entries as operating costs. Full accountant-style ledger, VAT filing,
          closing stock and profit reports can be added in the next phase.
        </span>
      </div>
    </section>
  )
}

function FinanceStatCard({ icon: Icon, label, value, note }) {
  return (
    <article className="finance-stat-card">
      <div className="finance-stat-icon">
        <Icon size={19} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function FinanceBreakdownRow({ item, total, currency, compact = false }) {
  const percentage = total > 0 ? Math.min((item.amount / total) * 100, 100) : 0

  return (
    <div className={`finance-breakdown-row ${compact ? 'compact' : ''}`}>
      <div>
        <span>{formatLabel(item.label)}</span>
        <strong>{formatMoney(item.amount, currency)}</strong>
      </div>
      <div className="finance-progress-track">
        <span style={{ width: `${percentage}%` }} />
      </div>
      <small>
        {item.count} record{item.count === 1 ? '' : 's'} • {percentage.toFixed(0)}%
      </small>
    </div>
  )
}

function FinanceLine({ label, value, currency, negative = false, warning = false }) {
  return (
    <div className={`finance-line ${negative ? 'negative' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>
        {negative && Number(value || 0) > 0 ? '-' : ''}
        {formatMoney(value, currency)}
      </strong>
    </div>
  )
}

function buildAmountBreakdown(rows, groupKey, amountKey) {
  const grouped = new Map()

  rows.forEach((row) => {
    const key = normalisePayment(row[groupKey])
    const existing = grouped.get(key) || {
      label: key,
      amount: 0,
      count: 0,
    }

    existing.amount += Number(row[amountKey] || 0)
    existing.count += 1
    grouped.set(key, existing)
  })

  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount)
}

function filterByRange(rows, range, dateKey) {
  if (range === 'all') return rows

  const now = new Date()
  let startDate = new Date(now)

  if (range === 'today') {
    startDate.setHours(0, 0, 0, 0)
  } else if (range === '7d') {
    startDate.setDate(startDate.getDate() - 6)
    startDate.setHours(0, 0, 0, 0)
  } else if (range === '30d') {
    startDate.setDate(startDate.getDate() - 29)
    startDate.setHours(0, 0, 0, 0)
  } else if (range === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  return rows.filter((row) => {
    const value = row[dateKey] || row.created_at
    if (!value) return false
    return new Date(value) >= startDate
  })
}

function sumBy(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0)
}

function normalisePayment(value) {
  const payment = String(value || 'other').toLowerCase()

  if (payment.includes('cash')) return 'cash'
  if (payment.includes('card')) return 'card'
  if (payment.includes('upi')) return 'upi'
  if (payment.includes('bank')) return 'bank'
  if (payment.includes('online')) return 'online'
  if (payment.includes('cod')) return 'cod'
  return payment || 'other'
}

function formatLabel(value) {
  return String(value || 'Other')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatMoney(value, currency) {
  return `${currency} ${Number(value || 0).toFixed(2)}`
}

function getFinanceHealth(netProfit) {
  if (netProfit > 0) {
    return {
      className: 'positive',
      text: 'Business is profitable in this selected period based on available entries.',
    }
  }

  if (netProfit < 0) {
    return {
      className: 'negative',
      text: 'Costs are higher than collected sales for this selected period.',
    }
  }

  return {
    className: 'neutral',
    text: 'No profit movement yet for this selected period.',
  }
}

export default FinanceManagement
