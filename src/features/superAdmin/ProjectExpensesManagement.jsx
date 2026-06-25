import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ReceiptText, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import { formatDate } from '../../utils/dateHelpers'

const expenseCategories = [
  'Domain',
  'Hosting',
  'Marketing',
  'Development',
  'Staff',
  'Office',
  'Software',
  'Payment Gateway',
  'Other',
]

const currencyOptions = ['AED', 'INR', 'USD', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD']

function ProjectExpensesManagement({ onStatsRefresh }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: 'AED',
    category: 'Domain',
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  const loadExpenses = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('project_expenses')
      .select(
        `
          id,
          title,
          amount,
          currency,
          category,
          notes,
          expense_date,
          created_at,
          created_by
        `,
      )
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      showToast({
        type: 'error',
        title: 'Expenses loading failed',
        message: error.message,
      })
      setExpenses([])
      setLoading(false)
      return
    }

    setExpenses(data || [])
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const filteredExpenses = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return expenses

    return expenses.filter((expense) => {
      const values = [
        expense.title,
        expense.amount,
        expense.currency,
        expense.category,
        expense.notes,
        expense.expense_date,
      ]

      return values.some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [expenses, search])

  const totalsByCurrency = useMemo(() => {
    return filteredExpenses.reduce((totals, expense) => {
      const currency = expense.currency || 'AED'
      const amount = Number(expense.amount || 0)

      totals[currency] = (totals[currency] || 0) + amount

      return totals
    }, {})
  }, [filteredExpenses])

  const handleAddExpense = async (event) => {
    event.preventDefault()

    const cleanTitle = form.title.trim()
    const amount = Number(form.amount)

    if (!cleanTitle) {
      showToast({
        type: 'warning',
        title: 'Expense title required',
        message: 'Please enter what this expense is for.',
      })
      return
    }

    if (!amount || amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Valid amount required',
        message: 'Please enter an amount greater than zero.',
      })
      return
    }

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase.from('project_expenses').insert({
      title: cleanTitle,
      amount,
      currency: form.currency,
      category: form.category,
      expense_date: form.expenseDate,
      notes: form.notes.trim() || null,
      created_by: userData?.user?.id || null,
    })

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Expense add failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Expense added',
      message: `${cleanTitle} has been added to Spizy project expenses.`,
    })

    setForm({
      title: '',
      amount: '',
      currency: 'AED',
      category: 'Domain',
      expenseDate: new Date().toISOString().slice(0, 10),
      notes: '',
    })

    await loadExpenses()
    await onStatsRefresh?.()
  }

  const handleDeleteExpense = async (expense) => {
    const confirmed = await confirmAction({
      title: 'Delete this expense?',
      message: `${expense.title} (${expense.currency} ${Number(
        expense.amount,
      ).toFixed(2)}) will be permanently removed.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('project_expenses')
      .delete()
      .eq('id', expense.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Expense deleted',
      message: `${expense.title} has been removed.`,
    })

    await loadExpenses()
    await onStatsRefresh?.()
  }

  return (
    <section className="management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">Project Expenses</p>
          <h2>Spizy cost tracker</h2>
          <span>
            Add and monitor project costs like domain, hosting, marketing,
            development, staff, software and other business expenses.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadExpenses}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="expense-summary-grid">
        <div className="expense-summary-card">
          <ReceiptText size={24} />
          <span>Total Records</span>
          <strong>{filteredExpenses.length}</strong>
        </div>

        {Object.entries(totalsByCurrency).length === 0 ? (
          <div className="expense-summary-card">
            <span>Total Expense</span>
            <strong>AED 0.00</strong>
          </div>
        ) : (
          Object.entries(totalsByCurrency).map(([currency, total]) => (
            <div className="expense-summary-card" key={currency}>
              <span>Total Expense</span>
              <strong>
                {currency} {total.toFixed(2)}
              </strong>
            </div>
          ))
        )}
      </div>

      <form className="expense-form" onSubmit={handleAddExpense}>
        <div className="form-grid">
          <label>
            Expense title
            <input
              type="text"
              value={form.title}
              onChange={(event) => updateForm('title', event.target.value)}
              placeholder="Example: Domain purchase"
              required
            />
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => updateForm('amount', event.target.value)}
              placeholder="5.00"
              required
            />
          </label>
        </div>

        <div className="form-grid three">
          <label>
            Currency
            <select
              value={form.currency}
              onChange={(event) => updateForm('currency', event.target.value)}
            >
              {currencyOptions.map((currency) => (
                <option value={currency} key={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select
              value={form.category}
              onChange={(event) => updateForm('category', event.target.value)}
            >
              {expenseCategories.map((category) => (
                <option value={category} key={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            Expense date
            <input
              type="date"
              value={form.expenseDate}
              onChange={(event) => updateForm('expenseDate', event.target.value)}
              required
            />
          </label>
        </div>

        <label>
          Notes
          <textarea
            value={form.notes}
            onChange={(event) => updateForm('notes', event.target.value)}
            placeholder="Optional notes about this expense"
            rows="3"
          />
        </label>

        <button type="submit" className="primary-button" disabled={saving}>
          <Plus size={18} />
          {saving ? 'Adding expense...' : 'Add Expense'}
        </button>
      </form>

      <div className="management-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, category, notes, amount..."
          />
        </div>

        <div className="table-count-pill">
          {filteredExpenses.length} expense
          {filteredExpenses.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="restaurants-table-wrap">
        {loading ? (
          <div className="empty-state">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            No expenses found. Add your first project cost above.
          </div>
        ) : (
          <table className="restaurants-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Date</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <strong>{expense.title}</strong>
                    <span>Added {formatDate(expense.created_at)}</span>
                  </td>

                  <td>
                    <strong>
                      {expense.currency} {Number(expense.amount).toFixed(2)}
                    </strong>
                    <span>{expense.currency}</span>
                  </td>

                  <td>
                    <strong>{expense.category || 'Other'}</strong>
                    <span>Project cost</span>
                  </td>

                  <td>
                    <strong>{formatDate(expense.expense_date)}</strong>
                    <span>Expense date</span>
                  </td>

                  <td>
                    <strong>{expense.notes || '—'}</strong>
                    <span>Notes</span>
                  </td>

                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="tiny-button danger"
                        onClick={() => handleDeleteExpense(expense)}
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default ProjectExpensesManagement