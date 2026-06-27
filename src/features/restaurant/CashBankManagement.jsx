import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './CashBankManagement.css'

const accountTypes = [
  { value: 'cash', label: 'Cash drawer' },
  { value: 'petty_cash', label: 'Petty cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'card_machine', label: 'Card machine / POS' },
  { value: 'online_gateway', label: 'Online gateway' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other account' },
]

const transactionTypes = [
  { value: 'income', label: 'Cash / Bank In' },
  { value: 'expense', label: 'Cash / Bank Out' },
  { value: 'adjustment_in', label: 'Balance Adjustment +' },
  { value: 'adjustment_out', label: 'Balance Adjustment -' },
]

const currencies = ['AED', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR', 'INR']

const emptyAccountForm = {
  account_name: '',
  account_type: 'cash',
  currency: 'AED',
  opening_balance: '',
  notes: '',
}

const emptyTransactionForm = {
  account_id: '',
  transaction_type: 'income',
  amount: '',
  transaction_date: getTodayInputDate(),
  title: '',
  description: '',
}

const emptyTransferForm = {
  from_account_id: '',
  to_account_id: '',
  amount: '',
  transaction_date: getTodayInputDate(),
  title: 'Internal transfer',
  description: '',
}

function CashBankManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingTransaction, setSavingTransaction] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [accountForm, setAccountForm] = useState(() => ({
    ...emptyAccountForm,
    currency: restaurant?.currency || 'AED',
  }))
  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm)
  const [transferForm, setTransferForm] = useState(emptyTransferForm)

  const loadCashBank = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: accountData, error: accountError } = await supabase
      .from('restaurant_finance_accounts')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    const { data: transactionData, error: transactionError } = await supabase
      .from('restaurant_account_transactions')
      .select(
        `
          *,
          account:restaurant_finance_accounts!restaurant_account_transactions_account_id_fkey (
            id,
            account_name,
            account_type,
            currency
          ),
          related_account:restaurant_finance_accounts!restaurant_account_transactions_related_account_id_fkey (
            id,
            account_name,
            account_type,
            currency
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120)

    if (accountError) {
      showToast({
        type: 'error',
        title: 'Accounts loading failed',
        message: accountError.message,
      })
    }

    if (transactionError) {
      showToast({
        type: 'error',
        title: 'Ledger loading failed',
        message: transactionError.message,
      })
    }

    const normalizedAccounts = accountData || []

    setAccounts(normalizedAccounts)
    setTransactions(transactionData || [])

    setTransactionForm((current) => ({
      ...current,
      account_id: current.account_id || normalizedAccounts[0]?.id || '',
    }))

    setTransferForm((current) => ({
      ...current,
      from_account_id: current.from_account_id || normalizedAccounts[0]?.id || '',
      to_account_id: current.to_account_id || normalizedAccounts[1]?.id || '',
    }))

    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    setAccountForm((current) => ({
      ...current,
      currency: current.currency || restaurant?.currency || 'AED',
    }))
  }, [restaurant?.currency])

  useEffect(() => {
    loadCashBank()
  }, [loadCashBank])

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.is_active !== false),
    [accounts],
  )

  const summary = useMemo(() => {
    const totalBalance = activeAccounts.reduce(
      (total, account) => total + Number(account.current_balance || 0),
      0,
    )
    const cashBalance = activeAccounts
      .filter((account) => ['cash', 'petty_cash'].includes(account.account_type))
      .reduce((total, account) => total + Number(account.current_balance || 0), 0)
    const bankBalance = activeAccounts
      .filter((account) => ['bank', 'card_machine'].includes(account.account_type))
      .reduce((total, account) => total + Number(account.current_balance || 0), 0)
    const gatewayBalance = activeAccounts
      .filter((account) => ['online_gateway', 'wallet'].includes(account.account_type))
      .reduce((total, account) => total + Number(account.current_balance || 0), 0)
    const todayIn = transactions
      .filter((transaction) =>
        transaction.transaction_date === getTodayInputDate() &&
        !transaction.is_voided &&
        ['income', 'transfer_in', 'opening', 'adjustment_in'].includes(
          transaction.transaction_type,
        ),
      )
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)
    const todayOut = transactions
      .filter((transaction) =>
        transaction.transaction_date === getTodayInputDate() &&
        !transaction.is_voided &&
        ['expense', 'transfer_out', 'adjustment_out'].includes(
          transaction.transaction_type,
        ),
      )
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)

    return {
      totalBalance,
      cashBalance,
      bankBalance,
      gatewayBalance,
      todayIn,
      todayOut,
    }
  }, [activeAccounts, transactions])

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return transactions.filter((transaction) => {
      if (accountFilter !== 'all' && transaction.account_id !== accountFilter) {
        return false
      }

      if (!keyword) return true

      return [
        transaction.title,
        transaction.description,
        transaction.account?.account_name,
        transaction.related_account?.account_name,
        transaction.transaction_type,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [accountFilter, search, transactions])

  const updateAccountForm = (key, value) => {
    setAccountForm((current) => ({ ...current, [key]: value }))
  }

  const updateTransactionForm = (key, value) => {
    setTransactionForm((current) => ({ ...current, [key]: value }))
  }

  const updateTransferForm = (key, value) => {
    setTransferForm((current) => ({ ...current, [key]: value }))
  }

  const handleCreateAccount = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const name = accountForm.account_name.trim()

    if (!name) {
      showToast({
        type: 'warning',
        title: 'Account name required',
        message: 'Enter cash drawer, bank, card machine or gateway account name.',
      })
      return
    }

    setSavingAccount(true)

    const openingBalance = Number(accountForm.opening_balance || 0)
    const { data: userData } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('restaurant_finance_accounts')
      .insert({
        restaurant_id: restaurant.id,
        account_name: name,
        account_type: accountForm.account_type,
        currency: accountForm.currency || restaurant.currency || 'AED',
        opening_balance: openingBalance,
        current_balance: 0,
        notes: accountForm.notes.trim() || null,
        created_by: userData?.user?.id || null,
      })
      .select('*')
      .single()

    if (error) {
      setSavingAccount(false)
      showToast({
        type: 'error',
        title: 'Account save failed',
        message: error.message,
      })
      return
    }

    if (openingBalance > 0) {
      await supabase.from('restaurant_account_transactions').insert({
        restaurant_id: restaurant.id,
        account_id: data.id,
        transaction_type: 'opening',
        amount: openingBalance,
        transaction_date: getTodayInputDate(),
        title: 'Opening balance',
        description: 'Opening balance entered when account was created.',
        created_by: userData?.user?.id || null,
      })
    }

    setSavingAccount(false)
    setAccountForm({ ...emptyAccountForm, currency: restaurant.currency || 'AED' })
    await loadCashBank()

    showToast({
      type: 'success',
      title: 'Account created',
      message: `${name} added to Cash & Bank.`,
    })
  }

  const handleCreateTransaction = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    if (!transactionForm.account_id) {
      showToast({
        type: 'warning',
        title: 'Select account',
        message: 'Choose the account for this cash/bank entry.',
      })
      return
    }

    const amount = Number(transactionForm.amount || 0)

    if (amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Amount required',
        message: 'Enter an amount greater than zero.',
      })
      return
    }

    const title = transactionForm.title.trim()

    if (!title) {
      showToast({
        type: 'warning',
        title: 'Title required',
        message: 'Enter a short title for the ledger entry.',
      })
      return
    }

    setSavingTransaction(true)

    const { data: userData } = await supabase.auth.getUser()
    const transactionType = transactionForm.transaction_type

    const { error } = await supabase.from('restaurant_account_transactions').insert({
      restaurant_id: restaurant.id,
      account_id: transactionForm.account_id,
      transaction_type: transactionType,
      amount,
      transaction_date: transactionForm.transaction_date || getTodayInputDate(),
      title,
      description: transactionForm.description.trim() || null,
      created_by: userData?.user?.id || null,
    })

    setSavingTransaction(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Transaction failed',
        message: error.message,
      })
      return
    }

    setTransactionForm((current) => ({
      ...emptyTransactionForm,
      account_id: current.account_id,
      transaction_date: getTodayInputDate(),
    }))
    await loadCashBank()

    showToast({
      type: 'success',
      title: 'Ledger updated',
      message: 'Cash / bank entry saved successfully.',
    })
  }

  const handleCreateTransfer = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const amount = Number(transferForm.amount || 0)

    if (!transferForm.from_account_id || !transferForm.to_account_id) {
      showToast({
        type: 'warning',
        title: 'Select accounts',
        message: 'Choose both from and to accounts.',
      })
      return
    }

    if (transferForm.from_account_id === transferForm.to_account_id) {
      showToast({
        type: 'warning',
        title: 'Same account selected',
        message: 'Transfer needs two different accounts.',
      })
      return
    }

    if (amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Amount required',
        message: 'Enter transfer amount greater than zero.',
      })
      return
    }

    setSavingTransfer(true)

    const { data: userData } = await supabase.auth.getUser()
    const transferTitle = transferForm.title.trim() || 'Internal transfer'
    const transferDate = transferForm.transaction_date || getTodayInputDate()
    const description = transferForm.description.trim() || null

    const { error } = await supabase.from('restaurant_account_transactions').insert([
      {
        restaurant_id: restaurant.id,
        account_id: transferForm.from_account_id,
        related_account_id: transferForm.to_account_id,
        transaction_type: 'transfer_out',
        amount,
        transaction_date: transferDate,
        title: transferTitle,
        description,
        created_by: userData?.user?.id || null,
      },
      {
        restaurant_id: restaurant.id,
        account_id: transferForm.to_account_id,
        related_account_id: transferForm.from_account_id,
        transaction_type: 'transfer_in',
        amount,
        transaction_date: transferDate,
        title: transferTitle,
        description,
        created_by: userData?.user?.id || null,
      },
    ])

    setSavingTransfer(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Transfer failed',
        message: error.message,
      })
      return
    }

    setTransferForm((current) => ({
      ...emptyTransferForm,
      from_account_id: current.from_account_id,
      to_account_id: current.to_account_id,
      transaction_date: getTodayInputDate(),
    }))
    await loadCashBank()

    showToast({
      type: 'success',
      title: 'Transfer saved',
      message: 'Internal account transfer completed.',
    })
  }

  const handleVoidTransaction = async (transaction) => {
    if (transaction?.is_voided) return

    const confirmed = await confirmAction({
      title: 'Void ledger entry?',
      message: 'This will reverse the balance effect of this entry. It will stay visible as voided for audit history.',
      confirmText: 'Void entry',
      cancelText: 'Keep entry',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_account_transactions')
      .update({ is_voided: true })
      .eq('id', transaction.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Void failed',
        message: error.message,
      })
      return
    }

    await loadCashBank()
    showToast({
      type: 'success',
      title: 'Entry voided',
      message: 'Balance has been reversed.',
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
    <section className="cash-bank-screen">
      <div className="cash-bank-hero">
        <div>
          <p className="pricing-label">Cash & Bank</p>
          <h2>Accounts and money ledger</h2>
          <span>
            Track cash drawer, bank, card machine, online gateway and internal transfers.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadCashBank}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="cash-bank-summary-grid">
        <CashBankMetric
          icon={<CircleDollarSign size={22} />}
          label="Total balance"
          value={formatMoney(restaurant.currency, summary.totalBalance)}
        />
        <CashBankMetric
          icon={<Banknote size={22} />}
          label="Cash balance"
          value={formatMoney(restaurant.currency, summary.cashBalance)}
        />
        <CashBankMetric
          icon={<Landmark size={22} />}
          label="Bank / card"
          value={formatMoney(restaurant.currency, summary.bankBalance)}
        />
        <CashBankMetric
          icon={<WalletCards size={22} />}
          label="Today in / out"
          value={`${formatMoney(restaurant.currency, summary.todayIn)} / ${formatMoney(
            restaurant.currency,
            summary.todayOut,
          )}`}
        />
      </div>

      <div className="cash-bank-main-grid">
        <form className="cash-bank-card" onSubmit={handleCreateAccount}>
          <div className="cash-bank-card-head">
            <div>
              <p className="pricing-label">Account Setup</p>
              <h3>Add money account</h3>
            </div>
            <Plus size={20} />
          </div>

          <div className="cash-bank-form-grid two">
            <label>
              Account name
              <input
                type="text"
                value={accountForm.account_name}
                onChange={(event) => updateAccountForm('account_name', event.target.value)}
                placeholder="Main cash drawer"
              />
            </label>

            <label>
              Account type
              <select
                value={accountForm.account_type}
                onChange={(event) => updateAccountForm('account_type', event.target.value)}
              >
                {accountTypes.map((type) => (
                  <option value={type.value} key={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Currency
              <select
                value={accountForm.currency}
                onChange={(event) => updateAccountForm('currency', event.target.value)}
              >
                {currencies.map((currency) => (
                  <option value={currency} key={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Opening balance
              <input
                type="number"
                min="0"
                step="0.01"
                value={accountForm.opening_balance}
                onChange={(event) => updateAccountForm('opening_balance', event.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          <label className="cash-bank-full-label">
            Notes
            <textarea
              rows="3"
              value={accountForm.notes}
              onChange={(event) => updateAccountForm('notes', event.target.value)}
              placeholder="Optional account notes"
            />
          </label>

          <button type="submit" className="primary-button" disabled={savingAccount}>
            {savingAccount ? 'Saving...' : 'Create Account'}
          </button>
        </form>

        <form className="cash-bank-card" onSubmit={handleCreateTransaction}>
          <div className="cash-bank-card-head">
            <div>
              <p className="pricing-label">Manual Entry</p>
              <h3>Cash / bank in-out</h3>
            </div>
            <WalletCards size={20} />
          </div>

          <div className="cash-bank-form-grid two">
            <label>
              Account
              <select
                value={transactionForm.account_id}
                onChange={(event) => updateTransactionForm('account_id', event.target.value)}
              >
                <option value="">Select account</option>
                {activeAccounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.account_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Entry type
              <select
                value={transactionForm.transaction_type}
                onChange={(event) => updateTransactionForm('transaction_type', event.target.value)}
              >
                {transactionTypes.map((type) => (
                  <option value={type.value} key={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={transactionForm.amount}
                onChange={(event) => updateTransactionForm('amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Date
              <input
                type="date"
                value={transactionForm.transaction_date}
                onChange={(event) => updateTransactionForm('transaction_date', event.target.value)}
              />
            </label>
          </div>

          <label className="cash-bank-full-label">
            Title
            <input
              type="text"
              value={transactionForm.title}
              onChange={(event) => updateTransactionForm('title', event.target.value)}
              placeholder="Cash deposit, owner withdrawal, bank charge..."
            />
          </label>

          <label className="cash-bank-full-label">
            Description
            <textarea
              rows="3"
              value={transactionForm.description}
              onChange={(event) => updateTransactionForm('description', event.target.value)}
              placeholder="Optional ledger note"
            />
          </label>

          <button type="submit" className="primary-button" disabled={savingTransaction}>
            {savingTransaction ? 'Saving...' : 'Save Entry'}
          </button>
        </form>
      </div>

      <form className="cash-bank-transfer-card" onSubmit={handleCreateTransfer}>
        <div className="cash-bank-card-head">
          <div>
            <p className="pricing-label">Internal Transfer</p>
            <h3>Move money between accounts</h3>
            <span>Example: cash drawer to bank deposit, online gateway settlement to bank.</span>
          </div>
          <ArrowLeftRight size={22} />
        </div>

        <div className="cash-bank-transfer-grid">
          <label>
            From account
            <select
              value={transferForm.from_account_id}
              onChange={(event) => updateTransferForm('from_account_id', event.target.value)}
            >
              <option value="">Select account</option>
              {activeAccounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.account_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            To account
            <select
              value={transferForm.to_account_id}
              onChange={(event) => updateTransferForm('to_account_id', event.target.value)}
            >
              <option value="">Select account</option>
              {activeAccounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.account_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={transferForm.amount}
              onChange={(event) => updateTransferForm('amount', event.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            Date
            <input
              type="date"
              value={transferForm.transaction_date}
              onChange={(event) => updateTransferForm('transaction_date', event.target.value)}
            />
          </label>

          <label>
            Title
            <input
              type="text"
              value={transferForm.title}
              onChange={(event) => updateTransferForm('title', event.target.value)}
              placeholder="Internal transfer"
            />
          </label>

          <label>
            Note
            <input
              type="text"
              value={transferForm.description}
              onChange={(event) => updateTransferForm('description', event.target.value)}
              placeholder="Optional transfer note"
            />
          </label>
        </div>

        <button type="submit" className="secondary-button transfer-submit" disabled={savingTransfer}>
          <ArrowLeftRight size={18} />
          {savingTransfer ? 'Transferring...' : 'Save Transfer'}
        </button>
      </form>

      <div className="cash-bank-account-grid">
        {loading ? (
          <div className="empty-state">Loading accounts...</div>
        ) : activeAccounts.length === 0 ? (
          <div className="empty-state">No cash or bank accounts yet. Create the first account above.</div>
        ) : (
          activeAccounts.map((account) => (
            <article className="cash-bank-account-card" key={account.id}>
              <div>
                <span>{formatAccountType(account.account_type)}</span>
                <h3>{account.account_name}</h3>
                {account.notes && <p>{account.notes}</p>}
              </div>
              <strong>{formatMoney(account.currency, account.current_balance)}</strong>
            </article>
          ))
        )}
      </div>

      <div className="cash-bank-ledger-card">
        <div className="cash-bank-ledger-head">
          <div>
            <p className="pricing-label">Ledger</p>
            <h3>Recent account movements</h3>
          </div>

          <div className="cash-bank-ledger-tools">
            <div className="cash-bank-search">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ledger..."
              />
            </div>

            <select
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
            >
              <option value="all">All accounts</option>
              {activeAccounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.account_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="cash-bank-ledger-list">
          {filteredTransactions.length === 0 ? (
            <div className="empty-state compact">No ledger entries found.</div>
          ) : (
            filteredTransactions.map((transaction) => (
              <article
                className={`cash-bank-ledger-row ${
                  isMoneyIn(transaction.transaction_type) ? 'money-in' : 'money-out'
                } ${transaction.is_voided ? 'voided' : ''}`}
                key={transaction.id}
              >
                <div className="cash-bank-ledger-main">
                  <div className="cash-bank-ledger-icon">
                    {isMoneyIn(transaction.transaction_type) ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <X size={18} />
                    )}
                  </div>

                  <div>
                    <strong>{transaction.title || formatTransactionType(transaction.transaction_type)}</strong>
                    <span>
                      {transaction.account?.account_name || 'Account'}
                      {transaction.related_account?.account_name
                        ? ` → ${transaction.related_account.account_name}`
                        : ''}
                    </span>
                    {transaction.description && <small>{transaction.description}</small>}
                    {transaction.source_type && (
                      <small>{formatLedgerSource(transaction.source_type)}</small>
                    )}
                  </div>
                </div>

                <div className="cash-bank-ledger-side">
                  <span>{formatSimpleDate(transaction.transaction_date)}</span>
                  <strong>
                    {isMoneyIn(transaction.transaction_type) ? '+' : '-'}
                    {formatMoney(transaction.account?.currency || restaurant.currency, transaction.amount)}
                  </strong>

                  {transaction.is_voided ? (
                    <em>Voided</em>
                  ) : (
                    <button
                      type="button"
                      className="cash-bank-void-button"
                      onClick={() => handleVoidTransaction(transaction)}
                    >
                      <Trash2 size={14} />
                      Void
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function CashBankMetric({ icon, label, value }) {
  return (
    <article className="cash-bank-metric">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatAccountType(type) {
  if (type === 'cash') return 'Cash drawer'
  if (type === 'petty_cash') return 'Petty cash'
  if (type === 'bank') return 'Bank account'
  if (type === 'card_machine') return 'Card machine / POS'
  if (type === 'online_gateway') return 'Online gateway'
  if (type === 'wallet') return 'Wallet'
  return 'Other account'
}

function formatLedgerSource(sourceType) {
  if (sourceType === 'day_closing_cash_bank_posting') return 'Posted from Day Closing'
  if (sourceType === 'day_closing') return 'Day Closing'
  if (sourceType === 'payment_reconciliation') return 'Payment Reconciliation'
  return String(sourceType || 'System source')
}

function formatTransactionType(type) {
  if (type === 'opening') return 'Opening balance'
  if (type === 'income') return 'Cash / bank in'
  if (type === 'expense') return 'Cash / bank out'
  if (type === 'transfer_in') return 'Transfer in'
  if (type === 'transfer_out') return 'Transfer out'
  if (type === 'adjustment_in') return 'Adjustment in'
  if (type === 'adjustment_out') return 'Adjustment out'
  return 'Ledger entry'
}

function isMoneyIn(type) {
  return ['opening', 'income', 'transfer_in', 'adjustment_in'].includes(type)
}

function formatSimpleDate(value) {
  if (!value) return 'Today'

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

export default CashBankManagement
