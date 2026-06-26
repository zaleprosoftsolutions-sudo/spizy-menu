import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ExpensesManagement.css'

const defaultExpenseForm = {
  title: '',
  category_id: '',
  expense_date: new Date().toISOString().slice(0, 10),
  amount: '',
  tax_amount: '0',
  payment_method: 'cash',
  vendor_name: '',
  invoice_number: '',
  notes: '',
}

const defaultCategoryNames = [
  'Rent',
  'Salary',
  'Utilities',
  'Groceries / Ingredients',
  'Packaging',
  'Delivery',
  'Marketing',
  'Maintenance',
  'Software',
  'Other',
]

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'online', label: 'Online' },
  { value: 'upi', label: 'UPI' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
]

function ExpensesManagement({ restaurant }) {
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(defaultExpenseForm)
  const [editingId, setEditingId] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('this_month')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const restaurantId = restaurant?.id
  const currency = restaurant?.currency || 'AED'

  const showNotice = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  const loadData = useCallback(async () => {
    if (!restaurantId) return

    setLoading(true)

    const [categoriesResult, expensesResult] = await Promise.all([
      supabase
        .from('restaurant_expense_categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_deleted', false)
        .order('name', { ascending: true }),
      supabase
        .from('restaurant_expenses')
        .select(
          `
            *,
            category:restaurant_expense_categories (
              id,
              name,
              color
            )
          `,
        )
        .eq('restaurant_id', restaurantId)
        .eq('is_deleted', false)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (categoriesResult.error) {
      showNotice(categoriesResult.error.message)
      setCategories([])
    } else {
      setCategories(categoriesResult.data || [])
    }

    if (expensesResult.error) {
      showNotice(expensesResult.error.message)
      setExpenses([])
    } else {
      setExpenses(expensesResult.data || [])
    }

    setLoading(false)
  }, [restaurantId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const ensureDefaultCategories = async () => {
    if (!restaurantId || categories.length > 0) return

    const rows = defaultCategoryNames.map((name) => ({
      restaurant_id: restaurantId,
      name,
      is_system: true,
    }))

    const { data, error } = await supabase
      .from('restaurant_expense_categories')
      .insert(rows)
      .select('*')

    if (!error) {
      setCategories(data || [])
    }
  }

  useEffect(() => {
    if (!loading && categories.length === 0 && restaurantId) {
      ensureDefaultCategories()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, categories.length, restaurantId])

  const filteredExpenses = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const now = new Date()
    const start = getRangeStart(range, now)

    return expenses.filter((expense) => {
      if (categoryFilter !== 'all' && expense.category_id !== categoryFilter) {
        return false
      }

      if (paymentFilter !== 'all' && expense.payment_method !== paymentFilter) {
        return false
      }

      if (start) {
        const expenseDate = new Date(expense.expense_date)
        if (expenseDate < start) return false
      }

      if (!keyword) return true

      return [
        expense.title,
        expense.vendor_name,
        expense.invoice_number,
        expense.notes,
        expense.category?.name,
        expense.payment_method,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [categoryFilter, expenses, paymentFilter, range, search])

  const stats = useMemo(() => {
    const total = filteredExpenses.reduce(
      (sum, expense) => sum + Number(expense.total_amount || 0),
      0,
    )
    const tax = filteredExpenses.reduce(
      (sum, expense) => sum + Number(expense.tax_amount || 0),
      0,
    )
    const todayIso = new Date().toISOString().slice(0, 10)
    const todayTotal = filteredExpenses
      .filter((expense) => expense.expense_date === todayIso)
      .reduce((sum, expense) => sum + Number(expense.total_amount || 0), 0)

    const categoryMap = new Map()
    filteredExpenses.forEach((expense) => {
      const key = expense.category?.name || 'Uncategorised'
      categoryMap.set(key, (categoryMap.get(key) || 0) + Number(expense.total_amount || 0))
    })

    const topCategory = [...categoryMap.entries()].sort((a, b) => b[1] - a[1])[0]

    return {
      total,
      tax,
      todayTotal,
      count: filteredExpenses.length,
      average: filteredExpenses.length > 0 ? total / filteredExpenses.length : 0,
      topCategory: topCategory?.[0] || 'No expenses yet',
      topCategoryAmount: topCategory?.[1] || 0,
    }
  }, [filteredExpenses])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetForm = () => {
    setForm(defaultExpenseForm)
    setEditingId(null)
  }

  const handleAddCategory = async () => {
    if (!restaurantId) return

    const cleanedName = newCategoryName.trim()

    if (!cleanedName) {
      showNotice('Enter a category name.')
      return
    }

    const { data, error } = await supabase
      .from('restaurant_expense_categories')
      .insert({
        restaurant_id: restaurantId,
        name: cleanedName,
        is_system: false,
      })
      .select('*')
      .single()

    if (error) {
      showNotice(error.message)
      return
    }

    setCategories((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
    setForm((current) => ({ ...current, category_id: data.id }))
    setNewCategoryName('')
    showNotice('Category added.')
  }

  const handleSaveExpense = async (event) => {
    event.preventDefault()

    if (!restaurantId) return

    const title = form.title.trim()
    const amount = Number(form.amount || 0)
    const taxAmount = Number(form.tax_amount || 0)
    const totalAmount = amount + taxAmount

    if (!title) {
      showNotice('Expense title is required.')
      return
    }

    if (amount <= 0) {
      showNotice('Expense amount should be greater than zero.')
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurantId,
      title,
      category_id: form.category_id || null,
      expense_date: form.expense_date || new Date().toISOString().slice(0, 10),
      amount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      payment_method: form.payment_method || 'cash',
      vendor_name: form.vendor_name.trim() || null,
      invoice_number: form.invoice_number.trim() || null,
      notes: form.notes.trim() || null,
    }

    const query = editingId
      ? supabase
          .from('restaurant_expenses')
          .update(payload)
          .eq('id', editingId)
          .eq('restaurant_id', restaurantId)
          .select(
            `
              *,
              category:restaurant_expense_categories (
                id,
                name,
                color
              )
            `,
          )
          .single()
      : supabase
          .from('restaurant_expenses')
          .insert(payload)
          .select(
            `
              *,
              category:restaurant_expense_categories (
                id,
                name,
                color
              )
            `,
          )
          .single()

    const { data, error } = await query

    setSaving(false)

    if (error) {
      showNotice(error.message)
      return
    }

    if (editingId) {
      setExpenses((current) =>
        current.map((expense) => (expense.id === editingId ? data : expense)),
      )
      showNotice('Expense updated.')
    } else {
      setExpenses((current) => [data, ...current])
      showNotice('Expense saved.')
    }

    resetForm()
  }

  const handleEditExpense = (expense) => {
    setEditingId(expense.id)
    setForm({
      title: expense.title || '',
      category_id: expense.category_id || '',
      expense_date: expense.expense_date || new Date().toISOString().slice(0, 10),
      amount: String(expense.amount ?? ''),
      tax_amount: String(expense.tax_amount ?? '0'),
      payment_method: expense.payment_method || 'cash',
      vendor_name: expense.vendor_name || '',
      invoice_number: expense.invoice_number || '',
      notes: expense.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteExpense = async (expenseId) => {
    if (!restaurantId) return

    const { error } = await supabase
      .from('restaurant_expenses')
      .update({ is_deleted: true })
      .eq('id', expenseId)
      .eq('restaurant_id', restaurantId)

    if (error) {
      showNotice(error.message)
      return
    }

    setExpenses((current) => current.filter((expense) => expense.id !== expenseId))
    showNotice('Expense deleted.')
  }

  return (
    <section className="expenses-page">
      {notice && <div className="expenses-toast">{notice}</div>}

      <div className="expenses-hero">
        <div>
          <p className="expenses-eyebrow">Restaurant Finance</p>
          <h1>Expenses & Cashbook</h1>
          <span>
            Track rent, salary, groceries, packaging, delivery, marketing and all daily costs.
          </span>
        </div>

        <button type="button" onClick={loadData} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="expenses-stats-grid">
        <ExpenseStat label="Filtered expenses" value={`${currency} ${stats.total.toFixed(2)}`} />
        <ExpenseStat label="Today" value={`${currency} ${stats.todayTotal.toFixed(2)}`} />
        <ExpenseStat label="Tax included" value={`${currency} ${stats.tax.toFixed(2)}`} />
        <ExpenseStat label="Average bill" value={`${currency} ${stats.average.toFixed(2)}`} />
      </div>

      <div className="expenses-layout-grid">
        <form className="expenses-form-card" onSubmit={handleSaveExpense}>
          <div className="expenses-card-head">
            <div>
              <p>{editingId ? 'Edit Expense' : 'New Expense'}</p>
              <h2>{editingId ? 'Update cost entry' : 'Add restaurant cost'}</h2>
            </div>

            {editingId && (
              <button type="button" className="ghost" onClick={resetForm}>
                <X size={16} />
                Cancel
              </button>
            )}
          </div>

          <div className="expenses-form-grid">
            <label className="full">
              Expense title
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateForm('title', event.target.value)}
                placeholder="Example: Vegetable purchase, rent, delivery fuel"
              />
            </label>

            <label>
              Category
              <select
                value={form.category_id}
                onChange={(event) => updateForm('category_id', event.target.value)}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Expense date
              <input
                type="date"
                value={form.expense_date}
                onChange={(event) => updateForm('expense_date', event.target.value)}
              />
            </label>

            <label>
              Amount before tax
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Tax amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.tax_amount}
                onChange={(event) => updateForm('tax_amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Payment method
              <select
                value={form.payment_method}
                onChange={(event) => updateForm('payment_method', event.target.value)}
              >
                {paymentMethods.map((method) => (
                  <option value={method.value} key={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Vendor / supplier
              <input
                type="text"
                value={form.vendor_name}
                onChange={(event) => updateForm('vendor_name', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label>
              Invoice / receipt no.
              <input
                type="text"
                value={form.invoice_number}
                onChange={(event) => updateForm('invoice_number', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="full">
              Notes
              <textarea
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Extra details, payment reference or staff note"
                rows="3"
              />
            </label>
          </div>

          <div className="expenses-total-preview">
            <span>Total expense</span>
            <strong>
              {currency} {(Number(form.amount || 0) + Number(form.tax_amount || 0)).toFixed(2)}
            </strong>
          </div>

          <button type="submit" className="expenses-primary-button" disabled={saving}>
            <Save size={17} />
            {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
          </button>
        </form>

        <aside className="expenses-side-card">
          <div className="expenses-card-head compact">
            <div>
              <p>Quick Category</p>
              <h2>Add cost type</h2>
            </div>
            <Plus size={18} />
          </div>

          <div className="expenses-category-create">
            <input
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Example: Cleaning"
            />
            <button type="button" onClick={handleAddCategory}>
              Add
            </button>
          </div>

          <div className="expenses-category-chips">
            {categories.map((category) => (
              <span key={category.id}>{category.name}</span>
            ))}
          </div>

          <div className="expenses-top-category">
            <WalletCards size={22} />
            <span>Top expense category</span>
            <strong>{stats.topCategory}</strong>
            <small>
              {currency} {stats.topCategoryAmount.toFixed(2)}
            </small>
          </div>
        </aside>
      </div>

      <div className="expenses-list-card">
        <div className="expenses-filters">
          <div className="expenses-search-box">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search expense, vendor, invoice, category..."
            />
          </div>

          <select value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="this_month">This month</option>
            <option value="last_7">Last 7 days</option>
            <option value="last_30">Last 30 days</option>
            <option value="all">All time</option>
          </select>

          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="all">All payments</option>
            {paymentMethods.map((method) => (
              <option value={method.value} key={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </div>

        <div className="expenses-list-headline">
          <div>
            <CalendarDays size={18} />
            <strong>{stats.count} entries</strong>
          </div>
          <span>
            Total {currency} {stats.total.toFixed(2)}
          </span>
        </div>

        {loading ? (
          <div className="expenses-empty-state">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="expenses-empty-state">
            No expenses found. Add your first restaurant cost from the form above.
          </div>
        ) : (
          <div className="expenses-table-wrap">
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Vendor</th>
                  <th className="right">Total</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      <strong>{expense.title}</strong>
                      {expense.invoice_number && <span>Invoice: {expense.invoice_number}</span>}
                    </td>
                    <td>
                      <span className="expenses-category-pill">
                        {expense.category?.name || 'Uncategorised'}
                      </span>
                    </td>
                    <td>{formatExpenseDate(expense.expense_date)}</td>
                    <td>{formatPaymentMethod(expense.payment_method)}</td>
                    <td>{expense.vendor_name || '—'}</td>
                    <td className="right">
                      <strong>
                        {currency} {Number(expense.total_amount || 0).toFixed(2)}
                      </strong>
                      {Number(expense.tax_amount || 0) > 0 && (
                        <span>Tax {currency} {Number(expense.tax_amount || 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="right">
                      <div className="expenses-row-actions">
                        <button type="button" onClick={() => handleEditExpense(expense)}>
                          <Edit3 size={15} />
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeleteExpense(expense.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function ExpenseStat({ label, value }) {
  return (
    <article className="expenses-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function getRangeStart(range, now) {
  if (range === 'all') return null

  const start = new Date(now)

  if (range === 'last_7') {
    start.setDate(start.getDate() - 7)
    start.setHours(0, 0, 0, 0)
    return start
  }

  if (range === 'last_30') {
    start.setDate(start.getDate() - 30)
    start.setHours(0, 0, 0, 0)
    return start
  }

  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return start
}

function formatPaymentMethod(method) {
  const found = paymentMethods.find((item) => item.value === method)
  return found?.label || 'Other'
}

function formatExpenseDate(value) {
  if (!value) return '—'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default ExpensesManagement
