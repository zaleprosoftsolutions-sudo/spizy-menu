import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileText,
  Landmark,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './CashBankManagement.css'
import './CashBankPostingAudit.css'
import './CashBankBalanceIntegrity.css'
import './CashBankReconciliation.css'
import './CashBankDailyFinance.css'
import './CashBankDailyFinanceReport.css'
import './CashBankDailyFinanceHistory.css'
import './CashBankMonthlyFinance.css'
import './CashBankProfitLoss.css'
import './CashBankCashFlow.css'
import './CashBankBusinessHealth.css'
import './CashBankTabs.css'
import './CashBankCommandCenter.css'
import './CashBankSetupAssistant.css'
import './CashBankSetupGuide.css'
import './CashBankFinanceAlerts.css'
import './CashBankMonthClose.css'
import './CashBankYearlyFinance.css'
import './CashBankYearClose.css'
import './CashBankTaxReport.css'
import './CashBankInputTax.css'
import './CashBankVatClose.css'

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

const inputTaxCategories = [
  { value: 'food_purchase', label: 'Food / ingredient purchase' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'utility', label: 'Utility bill' },
  { value: 'rent', label: 'Rent / lease' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'delivery', label: 'Delivery / logistics' },
  { value: 'software', label: 'Software / subscription' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other purchase' },
]

const emptyInputTaxForm = {
  purchase_date: getTodayInputDate(),
  supplier_name: '',
  invoice_number: '',
  category: 'food_purchase',
  gross_amount: '',
  tax_amount: '',
  notes: '',
}

const cashBankTabs = [
  { id: 'overview', label: 'Overview', helper: 'Health and balances' },
  { id: 'accounts', label: 'Accounts', helper: 'Setup and transfers' },
  { id: 'ledger', label: 'Ledger', helper: 'Audit and statements' },
  { id: 'reconcile', label: 'Reconcile', helper: 'Statement checks' },
  { id: 'daily', label: 'Daily', helper: 'Daily finance' },
  { id: 'history', label: 'History', helper: 'Past summaries' },
  { id: 'monthly', label: 'Monthly', helper: 'Month report' },
  { id: 'yearly', label: 'Yearly', helper: 'Annual view' },
  { id: 'tax', label: 'Tax / VAT', helper: 'Tax estimate' },
  { id: 'profit_loss', label: 'P&L', helper: 'Profit view' },
  { id: 'cash_flow', label: 'Cash Flow', helper: 'Money movement' },
]

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

const recommendedFinanceAccounts = [
  {
    key: 'cash',
    account_type: 'cash',
    account_name: 'Main Cash Drawer',
    label: 'Main cash drawer',
    note: 'Used for cash sales, COD collections, cash shortages and surplus adjustments.',
    required: true,
  },
  {
    key: 'card_machine',
    account_type: 'card_machine',
    account_name: 'Card Machine Settlement',
    label: 'Card machine / POS',
    note: 'Used when card collections are posted from Day Closing.',
    required: true,
  },
  {
    key: 'online_gateway',
    account_type: 'online_gateway',
    account_name: 'Online Gateway Clearing',
    label: 'Online gateway clearing',
    note: 'Used for Ziina, Stripe, PayPal, Razorpay, Cashfree, PhonePe or Network collections owned by the restaurant.',
    required: true,
  },
  {
    key: 'bank',
    account_type: 'bank',
    account_name: 'Main Bank Account',
    label: 'Main bank account',
    note: 'Used for bank deposits, gateway settlements and owner-level reconciliation.',
    required: false,
  },
]

function CashBankManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingTransaction, setSavingTransaction] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [savingSetupAccounts, setSavingSetupAccounts] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [activeCashBankTab, setActiveCashBankTab] = useState('overview')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [movementFilter, setMovementFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [reconciliationFilter, setReconciliationFilter] = useState('all')
  const [balanceRecalculating, setBalanceRecalculating] = useState(false)
  const [lastBalanceAudit, setLastBalanceAudit] = useState(null)
  const [reconciliationSavingId, setReconciliationSavingId] = useState(null)
  const [financeDate, setFinanceDate] = useState(() => getTodayInputDate())
  const [dailyFinanceSummary, setDailyFinanceSummary] = useState(null)
  const [dailyFinanceLoading, setDailyFinanceLoading] = useState(false)
  const [dailyFinanceHistory, setDailyFinanceHistory] = useState([])
  const [dailyFinanceHistoryLoading, setDailyFinanceHistoryLoading] = useState(false)
  const [dailyFinanceHistoryRange, setDailyFinanceHistoryRange] = useState('last30')
  const [monthlyFinanceMonth, setMonthlyFinanceMonth] = useState(() => getCurrentMonthInput())
  const [monthlyFinanceSummaries, setMonthlyFinanceSummaries] = useState([])
  const [monthlyFinanceLoading, setMonthlyFinanceLoading] = useState(false)
  const [monthlyCloseRecord, setMonthlyCloseRecord] = useState(null)
  const [monthlyCloseSaving, setMonthlyCloseSaving] = useState(false)
  const [yearlyFinanceYear, setYearlyFinanceYear] = useState(() => getCurrentYearInput())
  const [yearlyFinanceSummaries, setYearlyFinanceSummaries] = useState([])
  const [yearlyFinanceLoading, setYearlyFinanceLoading] = useState(false)
  const [yearlyCloseRecord, setYearlyCloseRecord] = useState(null)
  const [yearlyCloseSaving, setYearlyCloseSaving] = useState(false)
  const [taxRate, setTaxRate] = useState('5')
  const [inputTaxRecords, setInputTaxRecords] = useState([])
  const [inputTaxLoading, setInputTaxLoading] = useState(false)
  const [inputTaxSaving, setInputTaxSaving] = useState(false)
  const [inputTaxForm, setInputTaxForm] = useState(emptyInputTaxForm)
  const [taxVatCloseRecord, setTaxVatCloseRecord] = useState(null)
  const [taxVatCloseSaving, setTaxVatCloseSaving] = useState(false)
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

    const { data: balanceAuditData, error: balanceAuditError } = await supabase
      .from('restaurant_cash_bank_balance_recalculations')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(1)

    const { data: dailyFinanceData, error: dailyFinanceError } = await supabase
      .from('restaurant_daily_finance_summaries')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('summary_date', financeDate)
      .maybeSingle()

    const { data: dailyFinanceHistoryData, error: dailyFinanceHistoryError } = await supabase
      .from('restaurant_daily_finance_summaries')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .gte('summary_date', getFinanceHistoryStartDate(dailyFinanceHistoryRange))
      .order('summary_date', { ascending: false })
      .limit(45)

    const { startDate: monthlyStartDate, endDate: monthlyEndDate } = getMonthDateRange(monthlyFinanceMonth)
    const { data: monthlyFinanceData, error: monthlyFinanceError } = await supabase
      .from('restaurant_daily_finance_summaries')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .gte('summary_date', monthlyStartDate)
      .lte('summary_date', monthlyEndDate)
      .order('summary_date', { ascending: true })

    const { data: monthlyCloseData, error: monthlyCloseError } = await supabase
      .from('restaurant_monthly_finance_closings')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('month_key', monthlyFinanceMonth)
      .maybeSingle()

    const { data: inputTaxData, error: inputTaxError } = await supabase
      .from('restaurant_tax_input_records')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('month_key', monthlyFinanceMonth)
      .eq('is_voided', false)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })

    const { data: taxVatCloseData, error: taxVatCloseError } = await supabase
      .from('restaurant_tax_vat_period_closings')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('month_key', monthlyFinanceMonth)
      .maybeSingle()

    const { startDate: yearlyStartDate, endDate: yearlyEndDate } = getYearDateRange(yearlyFinanceYear)
    const { data: yearlyFinanceData, error: yearlyFinanceError } = await supabase
      .from('restaurant_daily_finance_summaries')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .gte('summary_date', yearlyStartDate)
      .lte('summary_date', yearlyEndDate)
      .order('summary_date', { ascending: true })

    const { data: yearlyCloseData, error: yearlyCloseError } = await supabase
      .from('restaurant_yearly_finance_closings')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('year_key', yearlyFinanceYear)
      .maybeSingle()

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

    if (balanceAuditError && balanceAuditError.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Balance audit loading failed',
        message: balanceAuditError.message,
      })
    }

    if (dailyFinanceError && !['42P01', 'PGRST116'].includes(dailyFinanceError.code)) {
      showToast({
        type: 'error',
        title: 'Daily finance summary loading failed',
        message: dailyFinanceError.message,
      })
    }


    if (dailyFinanceHistoryError && dailyFinanceHistoryError.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Daily finance history loading failed',
        message: dailyFinanceHistoryError.message,
      })
    }

    if (monthlyFinanceError && monthlyFinanceError.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Monthly finance loading failed',
        message: monthlyFinanceError.message,
      })
    }

    if (monthlyCloseError && !['42P01', 'PGRST116'].includes(monthlyCloseError.code)) {
      showToast({
        type: 'error',
        title: 'Month close loading failed',
        message: monthlyCloseError.message,
      })
    }

    if (inputTaxError && inputTaxError.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Input tax loading failed',
        message: inputTaxError.message,
      })
    }

    if (taxVatCloseError && !['42P01', 'PGRST116'].includes(taxVatCloseError.code)) {
      showToast({
        type: 'error',
        title: 'VAT period close loading failed',
        message: taxVatCloseError.message,
      })
    }

    if (yearlyFinanceError && yearlyFinanceError.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Yearly finance loading failed',
        message: yearlyFinanceError.message,
      })
    }

    if (yearlyCloseError && !['42P01', 'PGRST116'].includes(yearlyCloseError.code)) {
      showToast({
        type: 'error',
        title: 'Year close loading failed',
        message: yearlyCloseError.message,
      })
    }

    const normalizedAccounts = accountData || []

    setAccounts(normalizedAccounts)
    setTransactions(transactionData || [])
    setLastBalanceAudit(balanceAuditData?.[0] || null)
    setDailyFinanceSummary(dailyFinanceData || null)
    setDailyFinanceHistory(dailyFinanceHistoryData || [])
    setMonthlyFinanceSummaries(monthlyFinanceData || [])
    setMonthlyCloseRecord(monthlyCloseData || null)
    setInputTaxRecords(inputTaxData || [])
    setTaxVatCloseRecord(taxVatCloseData || null)
    setYearlyFinanceSummaries(yearlyFinanceData || [])
    setYearlyCloseRecord(yearlyCloseData || null)

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
  }, [dailyFinanceHistoryRange, financeDate, monthlyFinanceMonth, yearlyFinanceYear, restaurant?.id, showToast])

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

  const financeSetupAssistant = useMemo(
    () =>
      buildFinanceSetupAssistant({
        accounts: activeAccounts,
        transactions,
        dailyFinanceSummary,
        monthlyFinanceSummaries,
      }),
    [activeAccounts, dailyFinanceSummary, monthlyFinanceSummaries, transactions],
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

      if (!matchesLedgerSourceFilter(transaction, sourceFilter)) {
        return false
      }

      if (!matchesLedgerMovementFilter(transaction, movementFilter)) {
        return false
      }

      if (!matchesLedgerDateFilter(transaction, dateFilter)) {
        return false
      }

      if (!matchesReconciliationFilter(transaction, reconciliationFilter)) {
        return false
      }

      if (!keyword) return true

      return [
        transaction.title,
        transaction.description,
        transaction.account?.account_name,
        transaction.related_account?.account_name,
        transaction.transaction_type,
        transaction.source_type,
        transaction.external_reference,
        transaction.reference_type,
        formatLedgerSource(transaction.source_type, transaction.metadata),
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [accountFilter, dateFilter, movementFilter, reconciliationFilter, search, sourceFilter, transactions])

  const auditSummary = useMemo(
    () => buildCashBankAuditSummary(filteredTransactions),
    [filteredTransactions],
  )

  const reconciliationSummary = useMemo(
    () => buildCashBankReconciliationSummary(transactions),
    [transactions],
  )

  const financeSetupGuide = useMemo(
    () =>
      buildFinanceSetupGuide({
        assistant: financeSetupAssistant,
        accounts: activeAccounts,
        transactions,
        dailyFinanceSummary,
        monthlyFinanceSummaries,
        reconciliationSummary,
      }),
    [activeAccounts, dailyFinanceSummary, financeSetupAssistant, monthlyFinanceSummaries, reconciliationSummary, transactions],
  )


  const dailyFinanceHistorySummary = useMemo(
    () => buildDailyFinanceHistorySummary(dailyFinanceHistory),
    [dailyFinanceHistory],
  )

  const monthlyFinanceSummary = useMemo(
    () => buildMonthlyFinanceSummary(monthlyFinanceSummaries),
    [monthlyFinanceSummaries],
  )

  const taxVatSummary = useMemo(
    () => buildTaxVatSummary({ monthlySummary: monthlyFinanceSummary, taxRate }),
    [monthlyFinanceSummary, taxRate],
  )

  const inputTaxSummary = useMemo(
    () => buildInputTaxSummary({ inputTaxRecords, outputTax: taxVatSummary.outputTax }),
    [inputTaxRecords, taxVatSummary.outputTax],
  )

  const yearlyFinanceSummary = useMemo(
    () => buildYearlyFinanceSummary(yearlyFinanceSummaries),
    [yearlyFinanceSummaries],
  )

  const yearlyMonthRows = useMemo(
    () => buildYearlyMonthRows(yearlyFinanceSummaries),
    [yearlyFinanceSummaries],
  )

  const profitLossSummary = useMemo(
    () => buildProfitLossSummary(monthlyFinanceSummary),
    [monthlyFinanceSummary],
  )

  const cashFlowSummary = useMemo(
    () => buildCashFlowSummary({
      monthlySummary: monthlyFinanceSummary,
      transactions,
      accounts: activeAccounts,
      month: monthlyFinanceMonth,
    }),
    [activeAccounts, monthlyFinanceMonth, monthlyFinanceSummary, transactions],
  )

  const businessHealthSummary = useMemo(
    () => buildBusinessHealthSummary({
      accountSummary: summary,
      monthlySummary: monthlyFinanceSummary,
      profitLoss: profitLossSummary,
      cashFlow: cashFlowSummary,
      reconciliation: reconciliationSummary,
      historySummary: dailyFinanceHistorySummary,
    }),
    [cashFlowSummary, dailyFinanceHistorySummary, monthlyFinanceSummary, profitLossSummary, reconciliationSummary, summary],
  )

  const financeAlerts = useMemo(
    () =>
      buildFinanceAlerts({
        financeSetupAssistant,
        dailyFinanceSummary,
        monthlyFinanceSummary,
        profitLossSummary,
        cashFlowSummary,
        reconciliationSummary,
        businessHealthSummary,
        dailyFinanceHistorySummary,
        lastBalanceAudit,
      }),
    [
      businessHealthSummary,
      cashFlowSummary,
      dailyFinanceHistorySummary,
      dailyFinanceSummary,
      financeSetupAssistant,
      lastBalanceAudit,
      monthlyFinanceSummary,
      profitLossSummary,
      reconciliationSummary,
    ],
  )

  const updateAccountForm = (key, value) => {
    setAccountForm((current) => ({ ...current, [key]: value }))
  }

  const updateTransactionForm = (key, value) => {
    setTransactionForm((current) => ({ ...current, [key]: value }))
  }

  const updateTransferForm = (key, value) => {
    setTransferForm((current) => ({ ...current, [key]: value }))
  }

  const handleCreateRecommendedAccounts = async () => {
    if (!restaurant?.id) return

    const existingTypes = new Set(activeAccounts.map((account) => account.account_type))
    const missingAccounts = recommendedFinanceAccounts.filter(
      (account) => account.required && !existingTypes.has(account.account_type),
    )

    if (missingAccounts.length === 0) {
      showToast({
        type: 'success',
        title: 'Finance accounts ready',
        message: 'Required Cash & Bank accounts are already available.',
      })
      setActiveCashBankTab('accounts')
      return
    }

    setSavingSetupAccounts(true)

    const { data: userData } = await supabase.auth.getUser()
    const currency = restaurant.currency || 'AED'

    const { error } = await supabase.from('restaurant_finance_accounts').insert(
      missingAccounts.map((account) => ({
        restaurant_id: restaurant.id,
        account_name: account.account_name,
        account_type: account.account_type,
        currency,
        opening_balance: 0,
        current_balance: 0,
        notes: `Auto-created by Spizy Finance Setup Assistant. ${account.note}`,
        created_by: userData?.user?.id || null,
      })),
    )

    setSavingSetupAccounts(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Setup failed',
        message: error.message,
      })
      return
    }

    await loadCashBank()
    setActiveCashBankTab('accounts')

    showToast({
      type: 'success',
      title: 'Finance setup updated',
      message: `${missingAccounts.length} recommended account${missingAccounts.length === 1 ? '' : 's'} created successfully.`,
    })
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


  const printLedgerStatement = () => {
    const statementWindow = window.open('', '_blank', 'width=880,height=920')

    if (!statementWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the Cash & Bank statement again.',
      })
      return
    }

    statementWindow.document.write(
      buildCashBankStatementHtml({
        restaurant,
        accounts: activeAccounts,
        transactions: filteredTransactions,
        auditSummary,
        accountFilter,
        sourceFilter,
        movementFilter,
        dateFilter,
        reconciliationFilter,
      }),
    )
    statementWindow.document.close()
    statementWindow.focus()
  }

  const exportLedgerCsv = () => {
    const lines = [
      [
        'Date',
        'Account',
        'Related Account',
        'Type',
        'Direction',
        'Amount',
        'Source',
        'Source ID',
        'External Reference',
        'Status',
        'Reconciled',
        'Reconciled At',
        'Reconciliation Reference',
        'Title',
        'Description',
      ],
      ...filteredTransactions.map((transaction) => [
        transaction.transaction_date || '',
        transaction.account?.account_name || '',
        transaction.related_account?.account_name || '',
        formatTransactionType(transaction.transaction_type),
        isMoneyIn(transaction.transaction_type) ? 'Money in' : 'Money out',
        Number(transaction.amount || 0).toFixed(2),
        formatLedgerSource(transaction.source_type, transaction.metadata),
        transaction.source_id || '',
        transaction.external_reference || '',
        transaction.is_voided ? 'Voided / reversed' : 'Active',
        transaction.is_reconciled ? 'Yes' : 'No',
        transaction.reconciled_at || '',
        transaction.reconciliation_reference || '',
        transaction.title || '',
        transaction.description || '',
      ]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-cash-bank-ledger-${getTodayInputDate()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }


  const createDailyFinanceSummary = async () => {
    if (!restaurant?.id) return

    setDailyFinanceLoading(true)

    const { data, error } = await supabase.functions.invoke('create-daily-finance-summary', {
      body: {
        restaurant_id: restaurant.id,
        summary_date: financeDate,
      },
    })

    setDailyFinanceLoading(false)

    if (error || data?.error) {
      showToast({
        type: 'error',
        title: 'Finance summary failed',
        message:
          data?.error ||
          error?.message ||
          'Unable to create the daily finance summary right now.',
      })
      return
    }

    setDailyFinanceSummary(data?.summary || null)
    await loadCashBank()

    showToast({
      type: 'success',
      title: 'Finance summary updated',
      message:
        data?.message ||
        'Sales, collections, expenses, refunds and Cash & Bank movement were summarized for this date.',
    })
  }

  const exportDailyFinanceSummaryCsv = () => {
    if (!dailyFinanceSummary) {
      showToast({
        type: 'warning',
        title: 'Create summary first',
        message: 'Create the daily finance summary before exporting the report.',
      })
      return
    }

    const breakdown = dailyFinanceSummary.summary_breakdown || {}
    const generatedFrom = breakdown.generated_from || {}
    const gatewayRows = getDailyBreakdownEntries(breakdown.gateway_breakdown)
    const issueRows = getDailyBreakdownEntries(breakdown.issue_breakdown)
    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Summary date', dailyFinanceSummary.summary_date || financeDate],
      ['Currency', dailyFinanceSummary.currency || restaurant?.currency || 'AED'],
      ['Day closing status', dailyFinanceSummary.day_closing_status || 'open'],
      ['Total sales', Number(dailyFinanceSummary.total_sales || 0).toFixed(2)],
      ['Collected total', Number(dailyFinanceSummary.collected_total || 0).toFixed(2)],
      ['Pending total', Number(dailyFinanceSummary.pending_total || 0).toFixed(2)],
      ['COD pending', Number(dailyFinanceSummary.cod_pending || 0).toFixed(2)],
      ['Online pending', Number(dailyFinanceSummary.online_pending || 0).toFixed(2)],
      ['Refund total', Number(dailyFinanceSummary.refund_total || 0).toFixed(2)],
      ['Expense total', Number(dailyFinanceSummary.expense_total || 0).toFixed(2)],
      ['Cash & Bank money in', Number(dailyFinanceSummary.cash_bank_money_in || 0).toFixed(2)],
      ['Cash & Bank money out', Number(dailyFinanceSummary.cash_bank_money_out || 0).toFixed(2)],
      ['Net collection', Number(dailyFinanceSummary.net_collection || 0).toFixed(2)],
      ['Net after expenses', Number(dailyFinanceSummary.net_after_expenses || 0).toFixed(2)],
      ['Cash difference', Number(dailyFinanceSummary.cash_difference || 0).toFixed(2)],
      ['Order count', Number(breakdown.order_count || 0)],
      ['Paid order collection', Number(breakdown.paid_order_collection || 0).toFixed(2)],
      ['Pending from orders', Number(breakdown.pending_from_orders || 0).toFixed(2)],
      ['Ledger entry count', Number(breakdown.ledger_entry_count || 0)],
      ['Generated from orders', generatedFrom.orders ? 'Yes' : 'No'],
      ['Generated from expenses', generatedFrom.expenses ? 'Yes' : 'No'],
      ['Generated from day closing', generatedFrom.day_closing ? 'Yes' : 'No'],
      ['Generated from payment snapshot', generatedFrom.payment_snapshot ? 'Yes' : 'No'],
      ['Generated from refunds', generatedFrom.refunds ? 'Yes' : 'No'],
      ['Generated from Cash & Bank ledger', generatedFrom.cash_bank_ledger ? 'Yes' : 'No'],
      ['Updated at', dailyFinanceSummary.updated_at || dailyFinanceSummary.created_at || ''],
      [],
      ['Gateway / Method', 'Count', 'Amount'],
      ...gatewayRows.map((row) => [formatReportKey(row.key), row.count, row.amount.toFixed(2)]),
      [],
      ['Issue', 'Count', 'Amount'],
      ...issueRows.map((row) => [formatReportKey(row.key), row.count, row.amount.toFixed(2)]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-daily-finance-summary-${dailyFinanceSummary.summary_date || financeDate}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printDailyFinanceSummary = () => {
    if (!dailyFinanceSummary) {
      showToast({
        type: 'warning',
        title: 'Create summary first',
        message: 'Create the daily finance summary before printing the report.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=900,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the Daily Finance Summary again.',
      })
      return
    }

    reportWindow.document.write(
      buildDailyFinanceSummaryReportHtml({
        restaurant,
        summary: dailyFinanceSummary,
        currency: dailyFinanceSummary.currency || restaurant?.currency || 'AED',
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }


  const loadDailyFinanceHistory = async () => {
    if (!restaurant?.id) return

    setDailyFinanceHistoryLoading(true)

    const { data, error } = await supabase
      .from('restaurant_daily_finance_summaries')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .gte('summary_date', getFinanceHistoryStartDate(dailyFinanceHistoryRange))
      .order('summary_date', { ascending: false })
      .limit(45)

    setDailyFinanceHistoryLoading(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'History loading failed',
        message: error.message,
      })
      return
    }

    setDailyFinanceHistory(data || [])

    showToast({
      type: 'success',
      title: 'Finance history refreshed',
      message: 'Daily finance summary history is updated.',
    })
  }

  const exportDailyFinanceHistoryCsv = () => {
    if (dailyFinanceHistory.length === 0) {
      showToast({
        type: 'warning',
        title: 'No history to export',
        message: 'Create daily finance summaries first, then export the history.',
      })
      return
    }

    const lines = [
      [
        'Date',
        'Closing Status',
        'Sales',
        'Collected',
        'Pending',
        'COD Pending',
        'Online Pending',
        'Refunds',
        'Expenses',
        'Net Collection',
        'Net After Expenses',
        'Cash Difference',
        'Health',
        'Updated At',
      ],
      ...dailyFinanceHistory.map((summary) => [
        summary.summary_date || '',
        summary.day_closing_status || 'open',
        Number(summary.total_sales || 0).toFixed(2),
        Number(summary.collected_total || 0).toFixed(2),
        Number(summary.pending_total || 0).toFixed(2),
        Number(summary.cod_pending || 0).toFixed(2),
        Number(summary.online_pending || 0).toFixed(2),
        Number(summary.refund_total || 0).toFixed(2),
        Number(summary.expense_total || 0).toFixed(2),
        Number(summary.net_collection || 0).toFixed(2),
        Number(summary.net_after_expenses || 0).toFixed(2),
        Number(summary.cash_difference || 0).toFixed(2),
        getDailyFinanceHealthLabel(summary),
        summary.updated_at || summary.created_at || '',
      ]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-daily-finance-history-${dailyFinanceHistoryRange}-${getTodayInputDate()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printDailyFinanceHistory = () => {
    if (dailyFinanceHistory.length === 0) {
      showToast({
        type: 'warning',
        title: 'No history to print',
        message: 'Create daily finance summaries first, then print the history report.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=980,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the finance history report again.',
      })
      return
    }

    reportWindow.document.write(
      buildDailyFinanceHistoryReportHtml({
        restaurant,
        summaries: dailyFinanceHistory,
        range: dailyFinanceHistoryRange,
        totals: dailyFinanceHistorySummary,
        currency: restaurant?.currency || 'AED',
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }


  const loadMonthlyFinanceSummary = async () => {
    if (!restaurant?.id) return

    setMonthlyFinanceLoading(true)

    const { startDate, endDate } = getMonthDateRange(monthlyFinanceMonth)
    const [
      { data, error },
      { data: closeData, error: closeError },
      { data: inputTaxData, error: inputTaxError },
      { data: taxVatCloseData, error: taxVatCloseError },
    ] = await Promise.all([
      supabase
        .from('restaurant_daily_finance_summaries')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('summary_date', startDate)
        .lte('summary_date', endDate)
        .order('summary_date', { ascending: true }),
      supabase
        .from('restaurant_monthly_finance_closings')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('month_key', monthlyFinanceMonth)
        .maybeSingle(),
      supabase
        .from('restaurant_tax_input_records')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('month_key', monthlyFinanceMonth)
        .eq('is_voided', false)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_tax_vat_period_closings')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('month_key', monthlyFinanceMonth)
        .maybeSingle(),
    ])

    setMonthlyFinanceLoading(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Monthly summary loading failed',
        message: error.message,
      })
      return
    }

    if (closeError && !['42P01', 'PGRST116'].includes(closeError.code)) {
      showToast({
        type: 'error',
        title: 'Month close loading failed',
        message: closeError.message,
      })
    }

    if (inputTaxError && inputTaxError.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Input tax loading failed',
        message: inputTaxError.message,
      })
    }

    if (taxVatCloseError && !['42P01', 'PGRST116'].includes(taxVatCloseError.code)) {
      showToast({
        type: 'error',
        title: 'VAT period close loading failed',
        message: taxVatCloseError.message,
      })
    }

    setMonthlyFinanceSummaries(data || [])
    setMonthlyCloseRecord(closeData || null)
    setInputTaxRecords(inputTaxData || [])
    setTaxVatCloseRecord(taxVatCloseData || null)

    showToast({
      type: 'success',
      title: 'Monthly finance refreshed',
      message: 'Monthly finance summary is updated from saved daily summaries.',
    })
  }

  const loadInputTaxRecords = async ({ silent = false } = {}) => {
    if (!restaurant?.id) return

    setInputTaxLoading(true)

    const { data, error } = await supabase
      .from('restaurant_tax_input_records')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('month_key', monthlyFinanceMonth)
      .eq('is_voided', false)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })

    setInputTaxLoading(false)

    if (error) {
      if (error.code !== '42P01') {
        showToast({
          type: 'error',
          title: 'Input tax loading failed',
          message: error.message,
        })
      }
      return
    }

    setInputTaxRecords(data || [])

    if (!silent) {
      showToast({
        type: 'success',
        title: 'Input tax refreshed',
        message: 'Purchase VAT records are updated for the selected month.',
      })
    }
  }

  const updateInputTaxForm = (key, value) => {
    setInputTaxForm((current) => ({ ...current, [key]: value }))
  }

  const handleSaveInputTaxRecord = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const supplierName = inputTaxForm.supplier_name.trim()
    const grossAmount = Number(inputTaxForm.gross_amount || 0)
    const manualTaxAmount = inputTaxForm.tax_amount === '' ? null : Number(inputTaxForm.tax_amount || 0)

    if (!supplierName) {
      showToast({
        type: 'warning',
        title: 'Supplier required',
        message: 'Enter the supplier or bill name for this purchase VAT record.',
      })
      return
    }

    if (grossAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Amount required',
        message: 'Enter purchase gross amount greater than zero.',
      })
      return
    }

    const calculatedTaxAmount = manualTaxAmount === null
      ? calculateTaxIncludedAmount(grossAmount, taxRate)
      : Math.max(manualTaxAmount, 0)
    const taxAmount = Math.min(calculatedTaxAmount, grossAmount)
    const netAmount = Math.max(grossAmount - taxAmount, 0)
    const purchaseDate = inputTaxForm.purchase_date || getTodayInputDate()
    const monthKey = purchaseDate.slice(0, 7)

    setInputTaxSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase.from('restaurant_tax_input_records').insert({
      restaurant_id: restaurant.id,
      month_key: monthKey,
      purchase_date: purchaseDate,
      supplier_name: supplierName,
      invoice_number: inputTaxForm.invoice_number.trim() || null,
      category: inputTaxForm.category || 'other',
      currency: restaurant?.currency || 'AED',
      gross_amount: grossAmount,
      net_amount: netAmount,
      input_tax_amount: taxAmount,
      tax_rate: Number(taxRate || 0),
      notes: inputTaxForm.notes.trim() || null,
      created_by: userData?.user?.id || null,
    })

    setInputTaxSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Input tax save failed',
        message: error.message,
      })
      return
    }

    setInputTaxForm({ ...emptyInputTaxForm, purchase_date: purchaseDate })
    await loadInputTaxRecords({ silent: true })

    showToast({
      type: 'success',
      title: 'Input tax recorded',
      message: 'Purchase VAT/input tax record saved for accountant review.',
    })
  }

  const handleVoidInputTaxRecord = async (record) => {
    if (!record?.id) return

    const confirmed = await confirmAction({
      title: 'Remove input tax record?',
      message: "This will void the purchase VAT record from this month's input tax estimate. It will remain available for audit history in the database.",
      confirmText: 'Remove record',
      cancelText: 'Keep record',
      danger: true,
    })

    if (!confirmed) return

    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('restaurant_tax_input_records')
      .update({
        is_voided: true,
        voided_at: new Date().toISOString(),
        voided_by: userData?.user?.id || null,
      })
      .eq('id', record.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Input tax remove failed',
        message: error.message,
      })
      return
    }

    await loadInputTaxRecords({ silent: true })

    showToast({
      type: 'success',
      title: 'Input tax removed',
      message: 'Purchase VAT record removed from the current estimate.',
    })
  }



const saveTaxVatPeriodClose = async (status = 'reviewed') => {
  if (!restaurant?.id) return

  if (monthlyFinanceSummaries.length === 0) {
    showToast({
      type: 'warning',
      title: 'Daily summaries required',
      message: 'Create daily finance summaries for this month before reviewing or closing the VAT period.',
    })
    return
  }

  const isClosing = status === 'closed'
  const isReopening = status === 'reopened'

  if (isClosing) {
    const confirmed = await confirmAction({
      title: 'Close VAT period?',
      message: inputTaxSummary.recordCount > 0
        ? 'This will lock the current VAT estimate snapshot for owner/accountant review. You can reopen it later if a correction is required.'
        : 'No purchase input tax records are added yet. Close this VAT period anyway?',
      confirmText: 'Close period',
      cancelText: 'Review again',
      danger: false,
    })

    if (!confirmed) return
  }

  if (isReopening) {
    const confirmed = await confirmAction({
      title: 'Reopen VAT period?',
      message: 'This will mark the VAT period as reopened so you can add corrections before closing again.',
      confirmText: 'Reopen period',
      cancelText: 'Keep closed',
      danger: true,
    })

    if (!confirmed) return
  }

  setTaxVatCloseSaving(true)

  const { data: userData } = await supabase.auth.getUser()
  const nowIso = new Date().toISOString()
  const userId = userData?.user?.id || null
  const nextStatus = isReopening ? 'reopened' : status

  const payload = {
    restaurant_id: restaurant.id,
    month_key: monthlyFinanceMonth,
    status: nextStatus,
    currency: restaurant?.currency || 'AED',
    tax_rate: taxVatSummary.rate,
    gross_sales: taxVatSummary.grossSales,
    refunds_amount: taxVatSummary.refunds,
    taxable_sales: taxVatSummary.taxableSales,
    sales_excluding_tax: taxVatSummary.salesExcludingTax,
    output_tax: taxVatSummary.outputTax,
    input_tax: inputTaxSummary.inputTax,
    vat_payable: inputTaxSummary.vatPayable,
    pending_collections: taxVatSummary.pendingCollections,
    daily_summary_count: taxVatSummary.daysLoaded,
    input_record_count: inputTaxSummary.recordCount,
    health_label: getTaxVatHealthLabel(taxVatSummary, inputTaxSummary),
    reviewed_by: nextStatus === 'reviewed' || isClosing ? userId : taxVatCloseRecord?.reviewed_by || null,
    reviewed_at: nextStatus === 'reviewed' || isClosing ? nowIso : taxVatCloseRecord?.reviewed_at || null,
    closed_by: isClosing ? userId : nextStatus === 'reopened' ? null : taxVatCloseRecord?.closed_by || null,
    closed_at: isClosing ? nowIso : nextStatus === 'reopened' ? null : taxVatCloseRecord?.closed_at || null,
    reopened_by: isReopening ? userId : taxVatCloseRecord?.reopened_by || null,
    reopened_at: isReopening ? nowIso : taxVatCloseRecord?.reopened_at || null,
    updated_by: userId,
  }

  const { data, error } = await supabase
    .from('restaurant_tax_vat_period_closings')
    .upsert(payload, { onConflict: 'restaurant_id,month_key' })
    .select('*')
    .single()

  setTaxVatCloseSaving(false)

  if (error) {
    showToast({
      type: 'error',
      title: 'VAT period save failed',
      message: error.message,
    })
    return
  }

  setTaxVatCloseRecord(data || null)

  showToast({
    type: 'success',
    title: isClosing ? 'VAT period closed' : isReopening ? 'VAT period reopened' : 'VAT period reviewed',
    message: isClosing
      ? 'VAT estimate snapshot saved for owner/accountant review.'
      : isReopening
        ? 'You can now update input tax or daily summaries and close again.'
        : 'VAT period marked as reviewed.',
  })
}

  const exportMonthlyFinanceCsv = () => {
    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No monthly data',
        message: 'Create daily finance summaries for this month before exporting.',
      })
      return
    }

    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Month', monthlyFinanceMonth],
      ['Month close status', getMonthlyCloseStatusLabel(monthlyCloseRecord)],
      ['Reviewed at', monthlyCloseRecord?.reviewed_at || ''],
      ['Closed at', monthlyCloseRecord?.closed_at || ''],
      ['Days loaded', monthlyFinanceSummary.count],
      ['Healthy days', monthlyFinanceSummary.healthyDays],
      ['Warning days', monthlyFinanceSummary.warningDays],
      ['Total sales', monthlyFinanceSummary.totalSales.toFixed(2)],
      ['Collected', monthlyFinanceSummary.collectedTotal.toFixed(2)],
      ['Pending', monthlyFinanceSummary.pendingTotal.toFixed(2)],
      ['COD pending', monthlyFinanceSummary.codPending.toFixed(2)],
      ['Online pending', monthlyFinanceSummary.onlinePending.toFixed(2)],
      ['Refunds', monthlyFinanceSummary.refundTotal.toFixed(2)],
      ['Expenses', monthlyFinanceSummary.expenseTotal.toFixed(2)],
      ['Net collection', monthlyFinanceSummary.netCollection.toFixed(2)],
      ['Net after expenses', monthlyFinanceSummary.netAfterExpenses.toFixed(2)],
      ['Cash difference total', monthlyFinanceSummary.cashDifferenceTotal.toFixed(2)],
      [],
      ['Date', 'Status', 'Health', 'Sales', 'Collected', 'Pending', 'Refunds', 'Expenses', 'Net After Expenses'],
      ...monthlyFinanceSummaries.map((summary) => [
        summary.summary_date || '',
        summary.day_closing_status || 'open',
        getDailyFinanceHealthLabel(summary),
        Number(summary.total_sales || 0).toFixed(2),
        Number(summary.collected_total || 0).toFixed(2),
        Number(summary.pending_total || 0).toFixed(2),
        Number(summary.refund_total || 0).toFixed(2),
        Number(summary.expense_total || 0).toFixed(2),
        Number(summary.net_after_expenses || 0).toFixed(2),
      ]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-monthly-finance-${monthlyFinanceMonth}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printMonthlyFinanceSummary = () => {
    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No monthly data',
        message: 'Create daily finance summaries for this month before printing.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=1080,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the monthly finance report again.',
      })
      return
    }

    reportWindow.document.write(
      buildMonthlyFinanceReportHtml({
        restaurant,
        summaries: monthlyFinanceSummaries,
        month: monthlyFinanceMonth,
        totals: monthlyFinanceSummary,
        currency: restaurant?.currency || 'AED',
        monthCloseRecord: monthlyCloseRecord,
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }



  const loadYearlyFinanceSummary = async () => {
    if (!restaurant?.id) return

    setYearlyFinanceLoading(true)

    const { startDate, endDate } = getYearDateRange(yearlyFinanceYear)
    const { data, error } = await supabase
      .from('restaurant_daily_finance_summaries')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .gte('summary_date', startDate)
      .lte('summary_date', endDate)
      .order('summary_date', { ascending: true })

    setYearlyFinanceLoading(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Yearly summary loading failed',
        message: error.message,
      })
      return
    }

    setYearlyFinanceSummaries(data || [])

    showToast({
      type: 'success',
      title: 'Yearly finance refreshed',
      message: 'Annual finance view is updated from saved daily summaries.',
    })
  }

  const exportYearlyFinanceCsv = () => {
    if (yearlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No yearly data',
        message: 'Create daily finance summaries before exporting the yearly finance report.',
      })
      return
    }

    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Year', yearlyFinanceYear],
      ['Days loaded', yearlyFinanceSummary.count],
      ['Months loaded', yearlyMonthRows.length],
      ['Year close status', formatCloseStatus(yearlyCloseRecord?.status || 'open')],
      ['Year reviewed at', yearlyCloseRecord?.reviewed_at ? formatDateTime(yearlyCloseRecord.reviewed_at) : 'Not reviewed'],
      ['Year closed at', yearlyCloseRecord?.closed_at ? formatDateTime(yearlyCloseRecord.closed_at) : 'Not closed'],
      ['Healthy days', yearlyFinanceSummary.healthyDays],
      ['Warning days', yearlyFinanceSummary.warningDays],
      ['Total sales', yearlyFinanceSummary.totalSales.toFixed(2)],
      ['Collected', yearlyFinanceSummary.collectedTotal.toFixed(2)],
      ['Pending', yearlyFinanceSummary.pendingTotal.toFixed(2)],
      ['COD pending', yearlyFinanceSummary.codPending.toFixed(2)],
      ['Online pending', yearlyFinanceSummary.onlinePending.toFixed(2)],
      ['Refunds', yearlyFinanceSummary.refundTotal.toFixed(2)],
      ['Expenses', yearlyFinanceSummary.expenseTotal.toFixed(2)],
      ['Net collection', yearlyFinanceSummary.netCollection.toFixed(2)],
      ['Net after expenses', yearlyFinanceSummary.netAfterExpenses.toFixed(2)],
      ['Cash difference total', yearlyFinanceSummary.cashDifferenceTotal.toFixed(2)],
      [],
      ['Month', 'Days', 'Health', 'Sales', 'Collected', 'Pending', 'Refunds', 'Expenses', 'Net After Expenses'],
      ...yearlyMonthRows.map((row) => [
        row.monthLabel,
        row.count,
        getYearlyMonthHealthLabel(row),
        row.totalSales.toFixed(2),
        row.collectedTotal.toFixed(2),
        row.pendingTotal.toFixed(2),
        row.refundTotal.toFixed(2),
        row.expenseTotal.toFixed(2),
        row.netAfterExpenses.toFixed(2),
      ]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-yearly-finance-${yearlyFinanceYear}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printYearlyFinanceSummary = () => {
    if (yearlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No yearly data',
        message: 'Create daily finance summaries before printing the yearly finance report.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=1120,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the yearly finance report again.',
      })
      return
    }

    reportWindow.document.write(
      buildYearlyFinanceReportHtml({
        restaurant,
        summaries: yearlyFinanceSummaries,
        monthRows: yearlyMonthRows,
        year: yearlyFinanceYear,
        totals: yearlyFinanceSummary,
        currency: restaurant?.currency || 'AED',
        yearCloseRecord: yearlyCloseRecord || null,
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }


  const saveYearlyFinanceClose = async (status = 'reviewed') => {
    if (!restaurant?.id) return

    if (yearlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No year data',
        message: 'Create daily finance summaries for this year before marking year review or close.',
      })
      return
    }

    setYearlyCloseSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()

    const payload = {
      restaurant_id: restaurant.id,
      year_key: String(yearlyFinanceYear),
      currency: restaurant?.currency || 'AED',
      status,
      months_loaded: yearlyMonthRows.length,
      days_loaded: yearlyFinanceSummary.count,
      healthy_days: yearlyFinanceSummary.healthyDays,
      warning_days: yearlyFinanceSummary.warningDays,
      total_sales: yearlyFinanceSummary.totalSales,
      collected_total: yearlyFinanceSummary.collectedTotal,
      pending_total: yearlyFinanceSummary.pendingTotal,
      cod_pending: yearlyFinanceSummary.codPending,
      online_pending: yearlyFinanceSummary.onlinePending,
      refund_total: yearlyFinanceSummary.refundTotal,
      expense_total: yearlyFinanceSummary.expenseTotal,
      net_collection: yearlyFinanceSummary.netCollection,
      net_after_expenses: yearlyFinanceSummary.netAfterExpenses,
      cash_difference_total: yearlyFinanceSummary.cashDifferenceTotal,
      closed_by: status === 'closed' ? userData?.user?.id || null : yearlyCloseRecord?.closed_by || null,
      closed_at: status === 'closed' ? nowIso : yearlyCloseRecord?.closed_at || null,
      reviewed_by: userData?.user?.id || null,
      reviewed_at: nowIso,
      reopened_by: status === 'reopened' ? userData?.user?.id || null : null,
      reopened_at: status === 'reopened' ? nowIso : null,
      snapshot: {
        generated_at: nowIso,
        year_label: String(yearlyFinanceYear),
        health_label: getYearlyFinanceHealthLabel(yearlyFinanceSummary),
        month_count: yearlyMonthRows.length,
        daily_summary_count: yearlyFinanceSummaries.length,
      },
    }

    const { data, error } = await supabase
      .from('restaurant_yearly_finance_closings')
      .upsert(payload, { onConflict: 'restaurant_id,year_key' })
      .select('*')
      .single()

    setYearlyCloseSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Year close save failed',
        message: error.message,
      })
      return
    }

    setYearlyCloseRecord(data)

    showToast({
      type: 'success',
      title: status === 'closed' ? 'Year closed' : status === 'reopened' ? 'Year reopened' : 'Year reviewed',
      message:
        status === 'closed'
          ? 'Yearly finance snapshot is locked for owner review history.'
          : status === 'reopened'
            ? 'Year is reopened. Make corrections and close it again when ready.'
            : 'Yearly finance review snapshot saved.',
    })
  }

  const saveMonthlyFinanceClose = async (status = 'reviewed') => {
    if (!restaurant?.id) return

    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No month data',
        message: 'Create daily finance summaries for this month before marking month review or close.',
      })
      return
    }

    setMonthlyCloseSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()

    const payload = {
      restaurant_id: restaurant.id,
      month_key: monthlyFinanceMonth,
      currency: restaurant?.currency || 'AED',
      status,
      days_loaded: monthlyFinanceSummary.count,
      healthy_days: monthlyFinanceSummary.healthyDays,
      warning_days: monthlyFinanceSummary.warningDays,
      total_sales: monthlyFinanceSummary.totalSales,
      collected_total: monthlyFinanceSummary.collectedTotal,
      pending_total: monthlyFinanceSummary.pendingTotal,
      cod_pending: monthlyFinanceSummary.codPending,
      online_pending: monthlyFinanceSummary.onlinePending,
      refund_total: monthlyFinanceSummary.refundTotal,
      expense_total: monthlyFinanceSummary.expenseTotal,
      net_collection: monthlyFinanceSummary.netCollection,
      net_after_expenses: monthlyFinanceSummary.netAfterExpenses,
      cash_difference_total: monthlyFinanceSummary.cashDifferenceTotal,
      closed_by: status === 'closed' ? userData?.user?.id || null : monthlyCloseRecord?.closed_by || null,
      closed_at: status === 'closed' ? nowIso : monthlyCloseRecord?.closed_at || null,
      reviewed_by: userData?.user?.id || null,
      reviewed_at: nowIso,
      reopened_by: status === 'reopened' ? userData?.user?.id || null : null,
      reopened_at: status === 'reopened' ? nowIso : null,
      snapshot: {
        generated_at: nowIso,
        month_label: formatMonthLabel(monthlyFinanceMonth),
        health_label: getMonthlyFinanceHealthLabel(monthlyFinanceSummary),
        daily_summary_count: monthlyFinanceSummaries.length,
      },
    }

    const { data, error } = await supabase
      .from('restaurant_monthly_finance_closings')
      .upsert(payload, { onConflict: 'restaurant_id,month_key' })
      .select('*')
      .single()

    setMonthlyCloseSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Month close save failed',
        message: error.message,
      })
      return
    }

    setMonthlyCloseRecord(data)

    showToast({
      type: 'success',
      title: status === 'closed' ? 'Month closed' : status === 'reopened' ? 'Month reopened' : 'Month reviewed',
      message:
        status === 'closed'
          ? 'Monthly finance snapshot is locked for owner review history.'
          : status === 'reopened'
            ? 'Month is reopened. Make corrections and close it again when ready.'
            : 'Monthly finance review snapshot saved.',
    })
  }


  const exportTaxVatReportCsv = () => {
    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No tax data',
        message: 'Create daily finance summaries for this month before exporting the tax report.',
      })
      return
    }

    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Month', monthlyFinanceMonth],
      ['Currency', restaurant?.currency || 'AED'],
      ['Tax rate %', taxVatSummary.rate.toFixed(2)],
      ['Days loaded', taxVatSummary.daysLoaded],
      ['Gross sales', taxVatSummary.grossSales.toFixed(2)],
      ['Refunds / adjustments', taxVatSummary.refunds.toFixed(2)],
      ['Taxable sales after refunds', taxVatSummary.taxableSales.toFixed(2)],
      ['Estimated sales excluding tax', taxVatSummary.salesExcludingTax.toFixed(2)],
      ['Estimated output tax', taxVatSummary.outputTax.toFixed(2)],
      ['Input tax records', inputTaxSummary.recordCount],
      ['Estimated input tax', inputTaxSummary.inputTax.toFixed(2)],
      ['Estimated VAT payable', inputTaxSummary.vatPayable.toFixed(2)],
      ['Pending collection risk', taxVatSummary.pendingCollections.toFixed(2)],
      ['Tax status', getTaxVatHealthLabel(taxVatSummary, inputTaxSummary)],
      ['VAT period close status', getTaxVatPeriodCloseStatusLabel(taxVatCloseRecord)],
      ['VAT period reviewed at', taxVatCloseRecord?.reviewed_at || ''],
      ['VAT period closed at', taxVatCloseRecord?.closed_at || ''],
      [],
      ['Input tax / purchase VAT records'],
      ['Date', 'Supplier', 'Invoice', 'Category', 'Gross', 'Net', 'Input tax', 'Notes'],
      ...inputTaxRecords.map((record) => [
        record.purchase_date || '',
        record.supplier_name || '',
        record.invoice_number || '',
        formatInputTaxCategory(record.category),
        Number(record.gross_amount || 0).toFixed(2),
        Number(record.net_amount || 0).toFixed(2),
        Number(record.input_tax_amount || 0).toFixed(2),
        record.notes || '',
      ]),
      [],
      ['Daily output tax estimate'],
      ['Date', 'Gross sales', 'Refunds', 'Taxable sales', 'Estimated tax', 'Pending', 'Health'],
      ...monthlyFinanceSummaries.map((summary) => {
        const rowTax = buildTaxVatSummary({
          monthlySummary: buildMonthlyFinanceSummary([summary]),
          taxRate,
        })

        return [
          summary.summary_date || '',
          Number(summary.total_sales || 0).toFixed(2),
          Number(summary.refund_total || 0).toFixed(2),
          rowTax.taxableSales.toFixed(2),
          rowTax.outputTax.toFixed(2),
          Number(summary.pending_total || 0).toFixed(2),
          getDailyFinanceHealthLabel(summary),
        ]
      }),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-tax-vat-report-${monthlyFinanceMonth}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printTaxVatReport = () => {
    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No tax data',
        message: 'Create daily finance summaries for this month before printing the tax report.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=1080,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the tax report again.',
      })
      return
    }

    reportWindow.document.write(
      buildTaxVatReportHtml({
        restaurant,
        month: monthlyFinanceMonth,
        currency: restaurant?.currency || 'AED',
        taxSummary: taxVatSummary,
        inputTaxSummary,
        inputTaxRecords,
        summaries: monthlyFinanceSummaries,
        taxRate,
        taxVatCloseRecord,
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }

  const exportProfitLossCsv = () => {
    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No P&L data',
        message: 'Create daily finance summaries for this month before exporting Profit & Loss.',
      })
      return
    }

    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Month', monthlyFinanceMonth],
      ['Currency', restaurant?.currency || 'AED'],
      ['Days loaded', profitLossSummary.daysLoaded],
      ['Gross sales', profitLossSummary.grossSales.toFixed(2)],
      ['Refunds / adjustments', profitLossSummary.refunds.toFixed(2)],
      ['Net sales', profitLossSummary.netSales.toFixed(2)],
      ['Operating expenses', profitLossSummary.operatingExpenses.toFixed(2)],
      ['Estimated profit / loss', profitLossSummary.estimatedProfit.toFixed(2)],
      ['Cash collected', profitLossSummary.cashCollected.toFixed(2)],
      ['Pending collections', profitLossSummary.pendingCollections.toFixed(2)],
      ['Cash basis result', profitLossSummary.cashBasisResult.toFixed(2)],
      ['Profit margin %', profitLossSummary.profitMargin.toFixed(2)],
      ['Healthy days', profitLossSummary.healthyDays],
      ['Warning days', profitLossSummary.warningDays],
      ['Best day', profitLossSummary.bestDay?.summary_date || ''],
      ['Best day net', Number(profitLossSummary.bestDay?.net_after_expenses || 0).toFixed(2)],
      ['Weak day', profitLossSummary.weakDay?.summary_date || ''],
      ['Weak day net', Number(profitLossSummary.weakDay?.net_after_expenses || 0).toFixed(2)],
      ['Health', getProfitLossHealthLabel(profitLossSummary)],
      [],
      ['Date', 'Sales', 'Refunds', 'Expenses', 'Net Result', 'Pending', 'Health'],
      ...monthlyFinanceSummaries.map((summary) => [
        summary.summary_date || '',
        Number(summary.total_sales || 0).toFixed(2),
        Number(summary.refund_total || 0).toFixed(2),
        Number(summary.expense_total || 0).toFixed(2),
        Number(summary.net_after_expenses || 0).toFixed(2),
        Number(summary.pending_total || 0).toFixed(2),
        getDailyFinanceHealthLabel(summary),
      ]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-profit-loss-${monthlyFinanceMonth}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printProfitLossReport = () => {
    if (monthlyFinanceSummaries.length === 0) {
      showToast({
        type: 'warning',
        title: 'No P&L data',
        message: 'Create daily finance summaries for this month before printing Profit & Loss.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=1080,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the Profit & Loss report again.',
      })
      return
    }

    reportWindow.document.write(
      buildProfitLossReportHtml({
        restaurant,
        summaries: monthlyFinanceSummaries,
        month: monthlyFinanceMonth,
        profitLoss: profitLossSummary,
        currency: restaurant?.currency || 'AED',
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }


  const exportCashFlowCsv = () => {
    if (monthlyFinanceSummaries.length === 0 && cashFlowSummary.ledgerEntryCount === 0) {
      showToast({
        type: 'warning',
        title: 'No cash flow data',
        message: 'Create daily finance summaries or ledger entries for this month before exporting Cash Flow.',
      })
      return
    }

    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Month', monthlyFinanceMonth],
      ['Currency', restaurant?.currency || 'AED'],
      ['Days loaded', cashFlowSummary.daysLoaded],
      ['Ledger entries loaded', cashFlowSummary.ledgerEntryCount],
      ['Opening balance estimate', cashFlowSummary.openingBalanceEstimate.toFixed(2)],
      ['Money in', cashFlowSummary.moneyIn.toFixed(2)],
      ['Money out', cashFlowSummary.moneyOut.toFixed(2)],
      ['Net cash flow', cashFlowSummary.netCashFlow.toFixed(2)],
      ['Current closing balance', cashFlowSummary.currentClosingBalance.toFixed(2)],
      ['Cash collected from summaries', cashFlowSummary.summaryCollected.toFixed(2)],
      ['Refunds from summaries', cashFlowSummary.summaryRefunds.toFixed(2)],
      ['Expenses from summaries', cashFlowSummary.summaryExpenses.toFixed(2)],
      ['Cash basis result', cashFlowSummary.cashBasisResult.toFixed(2)],
      ['Pending collection risk', cashFlowSummary.pendingRisk.toFixed(2)],
      ['Transfer in', cashFlowSummary.transferIn.toFixed(2)],
      ['Transfer out', cashFlowSummary.transferOut.toFixed(2)],
      ['Health', getCashFlowHealthLabel(cashFlowSummary)],
      [],
      ['Date', 'Account', 'Type', 'Title', 'Source', 'Amount', 'Status'],
      ...cashFlowSummary.ledgerRows.map((transaction) => [
        transaction.transaction_date || '',
        transaction.account?.account_name || 'Account',
        formatTransactionType(transaction.transaction_type),
        transaction.title || '',
        formatLedgerSource(transaction.source_type, transaction.metadata),
        Number(transaction.amount || 0).toFixed(2),
        transaction.is_voided ? 'Voided' : 'Active',
      ]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-cash-flow-${monthlyFinanceMonth}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printCashFlowReport = () => {
    if (monthlyFinanceSummaries.length === 0 && cashFlowSummary.ledgerEntryCount === 0) {
      showToast({
        type: 'warning',
        title: 'No cash flow data',
        message: 'Create daily finance summaries or ledger entries for this month before printing Cash Flow.',
      })
      return
    }

    const reportWindow = window.open('', '_blank', 'width=1080,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the Cash Flow report again.',
      })
      return
    }

    reportWindow.document.write(
      buildCashFlowReportHtml({
        restaurant,
        month: monthlyFinanceMonth,
        cashFlow: cashFlowSummary,
        currency: restaurant?.currency || 'AED',
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }

  const exportBusinessHealthCsv = () => {
    const lines = [
      ['Metric', 'Value'],
      ['Restaurant', restaurant?.name || 'Restaurant'],
      ['Month', monthlyFinanceMonth],
      ['Currency', restaurant?.currency || 'AED'],
      ['Health score', businessHealthSummary.score],
      ['Health label', getBusinessHealthLabel(businessHealthSummary)],
      ['Days loaded', businessHealthSummary.daysLoaded],
      ['Estimated profit', businessHealthSummary.estimatedProfit.toFixed(2)],
      ['Profit margin', `${businessHealthSummary.profitMargin.toFixed(1)}%`],
      ['Cash flow', businessHealthSummary.netCashFlow.toFixed(2)],
      ['Closing balance', businessHealthSummary.currentBalance.toFixed(2)],
      ['Pending collection risk', businessHealthSummary.pendingRisk.toFixed(2)],
      ['Pending risk percent', `${businessHealthSummary.pendingRiskPercent.toFixed(1)}%`],
      ['Unreconciled amount', businessHealthSummary.unreconciledAmount.toFixed(2)],
      ['Unreconciled count', businessHealthSummary.unreconciledCount],
      ['Warning days', businessHealthSummary.warningDays],
      ['Healthy days', businessHealthSummary.healthyDays],
      [],
      ['Action', 'Tone', 'Detail'],
      ...businessHealthSummary.actions.map((item) => [item.title, item.tone, item.detail]),
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-business-health-${monthlyFinanceMonth}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printBusinessHealthReport = () => {
    const reportWindow = window.open('', '_blank', 'width=1080,height=920')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the Business Health report again.',
      })
      return
    }

    reportWindow.document.write(
      buildBusinessHealthReportHtml({
        restaurant,
        month: monthlyFinanceMonth,
        health: businessHealthSummary,
        currency: restaurant?.currency || 'AED',
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }

  const handleRecalculateBalances = async () => {
    if (!restaurant?.id) return

    const confirmed = await confirmAction({
      title: 'Recalculate Cash & Bank balances?',
      message:
        'Spizy will rebuild account balances from non-voided ledger entries. This is safe and creates an audit record.',
      confirmText: 'Recalculate balances',
      cancelText: 'Cancel',
    })

    if (!confirmed) return

    setBalanceRecalculating(true)

    const { data, error } = await supabase.functions.invoke('recalculate-cash-bank-balances', {
      body: {
        restaurant_id: restaurant.id,
      },
    })

    setBalanceRecalculating(false)

    if (error || data?.error) {
      showToast({
        type: 'error',
        title: 'Balance recalculation failed',
        message:
          data?.error ||
          error?.message ||
          'Unable to rebuild Cash & Bank balances right now.',
      })
      return
    }

    setLastBalanceAudit(data?.audit || null)
    await loadCashBank()

    showToast({
      type: 'success',
      title: 'Balances recalculated',
      message:
        data?.message ||
        'Cash & Bank balances were rebuilt from the ledger successfully.',
    })
  }


  const handleMarkReconciled = async (transaction) => {
    if (!restaurant?.id || !transaction?.id || transaction?.is_voided || transaction?.is_reconciled) {
      return
    }

    setReconciliationSavingId(transaction.id)

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('restaurant_account_transactions')
      .update({
        is_reconciled: true,
        reconciled_at: new Date().toISOString(),
        reconciled_by: userData?.user?.id || null,
        reconciliation_reference: buildReconciliationReference(transaction),
        reconciliation_note: 'Marked reconciled from Cash & Bank ledger.',
      })
      .eq('id', transaction.id)
      .eq('restaurant_id', restaurant.id)

    setReconciliationSavingId(null)

    if (error) {
      showToast({
        type: 'error',
        title: 'Reconciliation failed',
        message: error.message,
      })
      return
    }

    await loadCashBank()
    showToast({
      type: 'success',
      title: 'Entry reconciled',
      message: 'This ledger entry is now marked as checked against cash, card or bank statement.',
    })
  }

  const handleUndoReconciliation = async (transaction) => {
    if (!restaurant?.id || !transaction?.id || transaction?.is_voided || !transaction?.is_reconciled) {
      return
    }

    const confirmed = await confirmAction({
      title: 'Undo reconciliation?',
      message:
        'This will move the entry back to unreconciled so it can be checked again against the actual cash, card or bank statement.',
      confirmText: 'Undo reconciliation',
      cancelText: 'Keep reconciled',
    })

    if (!confirmed) return

    setReconciliationSavingId(transaction.id)

    const { error } = await supabase
      .from('restaurant_account_transactions')
      .update({
        is_reconciled: false,
        reconciled_at: null,
        reconciled_by: null,
        reconciliation_reference: null,
        reconciliation_note: null,
      })
      .eq('id', transaction.id)
      .eq('restaurant_id', restaurant.id)

    setReconciliationSavingId(null)

    if (error) {
      showToast({
        type: 'error',
        title: 'Undo failed',
        message: error.message,
      })
      return
    }

    await loadCashBank()
    showToast({
      type: 'success',
      title: 'Reconciliation removed',
      message: 'This ledger entry is now back in the unreconciled list.',
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
    <section className="cash-bank-screen" data-cash-bank-tab={activeCashBankTab}>
      <div className="cash-bank-hero">
        <div>
          <p className="pricing-label">Cash & Bank</p>
          <h2>Accounts and money ledger</h2>
          <span>
            Track cash drawer, bank, card machine, online gateway and internal transfers.
          </span>
        </div>

        <div className="cash-bank-hero-actions">
          <button
            type="button"
            className="secondary-button cash-bank-balance-button"
            onClick={handleRecalculateBalances}
            disabled={loading || balanceRecalculating}
          >
            <ShieldCheck size={18} />
            {balanceRecalculating ? 'Checking...' : 'Recalculate Balances'}
          </button>

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

      <div className="cash-bank-tab-shell">
        <div className="cash-bank-tab-nav" role="tablist" aria-label="Cash and Bank sections">
          {cashBankTabs.map((tab) => (
            <button
              type="button"
              className={`cash-bank-tab-button ${activeCashBankTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveCashBankTab(tab.id)}
              role="tab"
              aria-selected={activeCashBankTab === tab.id}
              key={tab.id}
            >
              <strong>{tab.label}</strong>
              <span>{tab.helper}</span>
            </button>
          ))}
        </div>

        <div className="cash-bank-tab-current">
          <span>Current section</span>
          <strong>{cashBankTabs.find((tab) => tab.id === activeCashBankTab)?.label || 'Overview'}</strong>
        </div>
      </div>

      <div className={`cash-bank-tab-panel cash-bank-tab-overview cash-bank-finance-alerts-panel ${financeAlerts.tone}`}>
        <div className="cash-bank-finance-alerts-head">
          <div>
            <p className="pricing-label">Finance Alerts</p>
            <h3>{financeAlerts.title}</h3>
            <span>{financeAlerts.message}</span>
          </div>

          <div className="cash-bank-finance-alerts-score">
            <strong>{financeAlerts.scoreLabel}</strong>
            <span>{financeAlerts.summaryLabel}</span>
          </div>
        </div>

        <div className="cash-bank-finance-alerts-grid">
          {financeAlerts.items.map((item) => (
            <article className={`cash-bank-finance-alert-card ${item.tone}`} key={item.key}>
              <div className="cash-bank-finance-alert-icon">
                {item.tone === 'good' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>

              <div className="cash-bank-finance-alert-body">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>

                <button
                  type="button"
                  className={item.primary ? 'primary-button' : 'secondary-button'}
                  onClick={() => setActiveCashBankTab(item.tab || 'overview')}
                >
                  {item.actionLabel}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-overview cash-bank-command-panel">
        <div className="cash-bank-command-head">
          <div>
            <p className="pricing-label">Finance Command Center</p>
            <h3>What should I check next?</h3>
            <span>
              Use these shortcuts to move through the recommended finance workflow without scrolling through the full page.
            </span>
          </div>
        </div>

        <div className="cash-bank-command-grid">
          <button type="button" onClick={() => setActiveCashBankTab('daily')}>
            <ClipboardCheck size={19} />
            <strong>Create daily summary</strong>
            <span>After Day Closing and payment snapshot, create the daily finance record.</span>
          </button>

          <button type="button" onClick={() => setActiveCashBankTab('reconcile')}>
            <ShieldCheck size={19} />
            <strong>Reconcile statement</strong>
            <span>Check unreconciled cash, bank, card and gateway movements.</span>
          </button>

          <button type="button" onClick={() => setActiveCashBankTab('ledger')}>
            <FileText size={19} />
            <strong>Review ledger</strong>
            <span>Audit manual entries, day-closing postings, reversals and references.</span>
          </button>

          <button type="button" onClick={() => setActiveCashBankTab('monthly')}>
            <WalletCards size={19} />
            <strong>Monthly finance</strong>
            <span>View month totals, warning days, collected amount and expenses.</span>
          </button>

          <button type="button" onClick={() => setActiveCashBankTab('yearly')}>
            <FileText size={19} />
            <strong>Yearly finance</strong>
            <span>Compare annual sales, collections, expenses, profit trend and warning months.</span>
          </button>

          <button type="button" onClick={() => setActiveCashBankTab('profit_loss')}>
            <CircleDollarSign size={19} />
            <strong>Profit &amp; Loss</strong>
            <span>Check estimated profit, margin and pending collection risk.</span>
          </button>

          <button type="button" onClick={() => setActiveCashBankTab('cash_flow')}>
            <ArrowLeftRight size={19} />
            <strong>Cash flow</strong>
            <span>Compare money in, money out, net cash flow and closing balance.</span>
          </button>
        </div>

        <div className="cash-bank-command-flow">
          <span>Recommended flow</span>
          <strong>Day Closing</strong>
          <em>→</em>
          <strong>Post to Cash &amp; Bank</strong>
          <em>→</em>
          <strong>Daily Summary</strong>
          <em>→</em>
          <strong>Reconcile</strong>
          <em>→</em>
          <strong>Monthly / P&amp;L / Cash Flow</strong>
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-overview cash-bank-setup-panel">
        <div className="cash-bank-setup-head">
          <div>
            <p className="pricing-label">Finance Setup Assistant</p>
            <h3>{financeSetupAssistant.title}</h3>
            <span>{financeSetupAssistant.message}</span>
          </div>

          <div className="cash-bank-setup-score">
            <strong>{financeSetupAssistant.completedSteps}/{financeSetupAssistant.totalSteps}</strong>
            <span>{financeSetupAssistant.statusLabel}</span>
          </div>
        </div>

        <div className="cash-bank-setup-progress" aria-label="Finance setup progress">
          <span style={{ width: `${financeSetupAssistant.progress}%` }} />
        </div>

        <div className="cash-bank-setup-grid">
          {financeSetupAssistant.steps.map((step) => (
            <article className={`cash-bank-setup-step ${step.done ? 'done' : ''} ${step.warning ? 'warning' : ''}`} key={step.key}>
              <div className="cash-bank-setup-step-icon">
                {step.done ? <CheckCircle2 size={18} /> : <ClipboardCheck size={18} />}
              </div>
              <div>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="cash-bank-setup-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleCreateRecommendedAccounts}
            disabled={savingSetupAccounts || loading}
          >
            <Plus size={17} />
            {savingSetupAccounts ? 'Creating accounts...' : 'Create required accounts'}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setActiveCashBankTab('accounts')}
          >
            <WalletCards size={17} />
            Open Accounts
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setActiveCashBankTab('daily')}
          >
            <ClipboardCheck size={17} />
            Daily Summary
          </button>
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-overview cash-bank-setup-guide-panel">
        <div className="cash-bank-setup-guide-head">
          <div>
            <p className="pricing-label">Guided Finance Flow</p>
            <h3>{financeSetupGuide.title}</h3>
            <span>{financeSetupGuide.message}</span>
          </div>

          <div className={`cash-bank-setup-guide-badge ${financeSetupGuide.tone}`}>
            <strong>{financeSetupGuide.nextActionLabel}</strong>
            <span>{financeSetupGuide.readyCount}/{financeSetupGuide.totalCount} ready</span>
          </div>
        </div>

        <div className="cash-bank-setup-guide-list">
          {financeSetupGuide.steps.map((step, index) => (
            <article className={`cash-bank-setup-guide-step ${step.status}`} key={step.key}>
              <div className="cash-bank-setup-guide-number">
                {step.done ? <CheckCircle2 size={18} /> : index + 1}
              </div>

              <div className="cash-bank-setup-guide-body">
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </div>

                <button
                  type="button"
                  className={step.primary ? 'primary-button' : 'secondary-button'}
                  onClick={() => {
                    if (step.action === 'create_accounts') {
                      handleCreateRecommendedAccounts()
                      return
                    }

                    if (step.tab) {
                      setActiveCashBankTab(step.tab)
                    }
                  }}
                  disabled={step.action === 'create_accounts' && (savingSetupAccounts || loading)}
                >
                  {step.icon}
                  {step.actionLabel}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="cash-bank-setup-guide-note">
          <FileText size={18} />
          <span>
            Use this as the owner checklist: setup accounts, post Day Closing, create Daily Summary, reconcile ledger, then review Monthly, P&amp;L, Cash Flow and Business Health.
          </span>
        </div>
      </div>

      <div className={`cash-bank-tab-panel cash-bank-tab-overview cash-bank-business-health-panel ${getBusinessHealthTone(businessHealthSummary)}`}>
        <div className="cash-bank-business-health-head">
          <div>
            <p className="pricing-label">Business Health</p>
            <h3>Owner finance command view</h3>
            <span>
              One quick view combining monthly finance, Profit &amp; Loss, Cash Flow, reconciliation and pending collection risk.
            </span>
          </div>

          <div className="cash-bank-business-health-actions">
            <div className="cash-bank-business-score">
              <strong>{businessHealthSummary.score}</strong>
              <span>{getBusinessHealthLabel(businessHealthSummary)}</span>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={printBusinessHealthReport}
            >
              <Printer size={18} />
              Print Health
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportBusinessHealthCsv}
            >
              <Download size={18} />
              Export Health
            </button>
          </div>
        </div>

        <div className="cash-bank-business-health-grid">
          <CashBankBusinessHealthMetric
            label="Estimated profit"
            value={formatMoney(restaurant.currency, businessHealthSummary.estimatedProfit)}
            note={`${businessHealthSummary.profitMargin.toFixed(1)}% margin`}
            positive={businessHealthSummary.estimatedProfit >= 0}
            warning={businessHealthSummary.estimatedProfit < 0}
          />
          <CashBankBusinessHealthMetric
            label="Net cash flow"
            value={formatMoney(restaurant.currency, businessHealthSummary.netCashFlow)}
            note="Money movement this month"
            positive={businessHealthSummary.netCashFlow >= 0}
            warning={businessHealthSummary.netCashFlow < 0}
          />
          <CashBankBusinessHealthMetric
            label="Pending risk"
            value={formatMoney(restaurant.currency, businessHealthSummary.pendingRisk)}
            note={`${businessHealthSummary.pendingRiskPercent.toFixed(1)}% of sales`}
            warning={businessHealthSummary.pendingRisk > 0}
          />
          <CashBankBusinessHealthMetric
            label="Reconciliation"
            value={`${businessHealthSummary.unreconciledCount} open`}
            note={formatMoney(restaurant.currency, businessHealthSummary.unreconciledAmount)}
            warning={businessHealthSummary.unreconciledCount > 0}
            positive={businessHealthSummary.unreconciledCount === 0}
          />
          <CashBankBusinessHealthMetric
            label="Closing balance"
            value={formatMoney(restaurant.currency, businessHealthSummary.currentBalance)}
            note="Current active accounts"
            positive={businessHealthSummary.currentBalance >= 0}
            warning={businessHealthSummary.currentBalance < 0}
          />
          <CashBankBusinessHealthMetric
            label="Days loaded"
            value={`${businessHealthSummary.daysLoaded} day${businessHealthSummary.daysLoaded === 1 ? '' : 's'}`}
            note={`${businessHealthSummary.warningDays} warning day${businessHealthSummary.warningDays === 1 ? '' : 's'}`}
            warning={businessHealthSummary.warningDays > 0}
          />
        </div>

        <div className="cash-bank-business-health-insights">
          {businessHealthSummary.actions.map((item) => (
            <article className={`cash-bank-business-health-insight ${item.tone}`} key={item.title}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <small>{item.badge}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-daily cash-bank-daily-finance-panel">
        <div className="cash-bank-daily-finance-head">
          <div>
            <p className="pricing-label">Daily Finance Summary</p>
            <h3>Sales, collections, expenses & closing health</h3>
            <span>
              Create one finance snapshot from Orders, Day Closing, Payment Snapshot and Cash & Bank ledger for the selected date.
            </span>
          </div>

          <div className="cash-bank-daily-finance-actions">
            <label>
              Summary date
              <input
                type="date"
                value={financeDate}
                onChange={(event) => setFinanceDate(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={createDailyFinanceSummary}
              disabled={loading || dailyFinanceLoading}
            >
              <ClipboardCheck size={18} />
              {dailyFinanceLoading ? 'Creating...' : 'Create Summary'}
            </button>


            <button
              type="button"
              className="secondary-button cash-bank-daily-report-button"
              onClick={printDailyFinanceSummary}
              disabled={loading || !dailyFinanceSummary}
            >
              <Printer size={18} />
              Print Report
            </button>

            <button
              type="button"
              className="secondary-button cash-bank-daily-report-button"
              onClick={exportDailyFinanceSummaryCsv}
              disabled={loading || !dailyFinanceSummary}
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>

        {dailyFinanceSummary ? (
          <>
            <div className="cash-bank-daily-finance-grid">
              <CashBankDailyFinanceMetric
                label="Total sales"
                value={formatMoney(restaurant.currency, dailyFinanceSummary.total_sales)}
                note={`${Number(dailyFinanceSummary.summary_breakdown?.order_count || 0)} order${Number(dailyFinanceSummary.summary_breakdown?.order_count || 0) === 1 ? '' : 's'}`}
              />
              <CashBankDailyFinanceMetric
                label="Collected"
                value={formatMoney(restaurant.currency, dailyFinanceSummary.collected_total)}
                note="Paid order and customer collections"
                positive
              />
              <CashBankDailyFinanceMetric
                label="Pending"
                value={formatMoney(restaurant.currency, dailyFinanceSummary.pending_total)}
                note="COD + online pending collections"
                warning={Number(dailyFinanceSummary.pending_total || 0) > 0}
              />
              <CashBankDailyFinanceMetric
                label="Refunds"
                value={formatMoney(restaurant.currency, dailyFinanceSummary.refund_total)}
                note="Recorded refund / adjustment total"
                warning={Number(dailyFinanceSummary.refund_total || 0) > 0}
              />
              <CashBankDailyFinanceMetric
                label="Expenses"
                value={formatMoney(restaurant.currency, dailyFinanceSummary.expense_total)}
                note="Restaurant expenses for this date"
                warning={Number(dailyFinanceSummary.expense_total || 0) > 0}
              />
              <CashBankDailyFinanceMetric
                label="Net after expenses"
                value={formatMoney(restaurant.currency, dailyFinanceSummary.net_after_expenses)}
                note="Collected - refunds - expenses"
                positive={Number(dailyFinanceSummary.net_after_expenses || 0) >= 0}
                warning={Number(dailyFinanceSummary.net_after_expenses || 0) < 0}
              />
            </div>

            <div className="cash-bank-daily-finance-foot">
              <span>{getDailyFinanceSummaryStatus(dailyFinanceSummary)}</span>
              <strong>{getDailyFinanceUpdatedLabel(dailyFinanceSummary)}</strong>
            </div>


            <div className="cash-bank-daily-report-strip">
              <span>Report scope</span>
              <strong>{dailyFinanceSummary.day_closing_status || 'open'} closing</strong>
              <strong>{Number(dailyFinanceSummary.summary_breakdown?.ledger_entry_count || 0)} ledger entries</strong>
              <strong>{Number(dailyFinanceSummary.summary_breakdown?.order_count || 0)} orders</strong>
              <strong>{dailyFinanceSummary.payment_snapshot_id ? 'Payment snapshot linked' : 'No payment snapshot linked'}</strong>
            </div>
          </>
        ) : (
          <div className="cash-bank-daily-finance-empty">
            <ClipboardCheck size={20} />
            <div>
              <strong>No daily finance summary yet</strong>
              <span>
                Create a summary after Day Closing payment snapshot and Cash & Bank posting to see the full daily finance picture.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-history cash-bank-daily-history-panel">
        <div className="cash-bank-daily-history-head">
          <div>
            <p className="pricing-label">Finance History</p>
            <h3>Daily summary archive</h3>
            <span>
              Compare previous daily finance summaries, spot pending collection days, and export management history.
            </span>
          </div>

          <div className="cash-bank-daily-history-actions">
            <label>
              History range
              <select
                value={dailyFinanceHistoryRange}
                onChange={(event) => setDailyFinanceHistoryRange(event.target.value)}
              >
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
                <option value="last90">Last 90 days</option>
              </select>
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={loadDailyFinanceHistory}
              disabled={dailyFinanceHistoryLoading}
            >
              <RefreshCw size={18} />
              {dailyFinanceHistoryLoading ? 'Loading...' : 'Refresh History'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={printDailyFinanceHistory}
              disabled={dailyFinanceHistory.length === 0}
            >
              <Printer size={18} />
              Print History
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportDailyFinanceHistoryCsv}
              disabled={dailyFinanceHistory.length === 0}
            >
              <Download size={18} />
              Export History
            </button>
          </div>
        </div>

        <div className="cash-bank-daily-history-grid">
          <CashBankDailyHistoryMetric
            label="Summaries"
            value={String(dailyFinanceHistorySummary.count)}
            note={getFinanceHistoryRangeLabel(dailyFinanceHistoryRange)}
          />
          <CashBankDailyHistoryMetric
            label="Total sales"
            value={formatMoney(restaurant.currency, dailyFinanceHistorySummary.totalSales)}
            note="Across loaded summaries"
          />
          <CashBankDailyHistoryMetric
            label="Collected"
            value={formatMoney(restaurant.currency, dailyFinanceHistorySummary.collectedTotal)}
            note="Paid and collected total"
            positive
          />
          <CashBankDailyHistoryMetric
            label="Pending"
            value={formatMoney(restaurant.currency, dailyFinanceHistorySummary.pendingTotal)}
            note="COD + online pending"
            warning={dailyFinanceHistorySummary.pendingTotal > 0}
          />
          <CashBankDailyHistoryMetric
            label="Expenses"
            value={formatMoney(restaurant.currency, dailyFinanceHistorySummary.expenseTotal)}
            note="Total expenses"
            warning={dailyFinanceHistorySummary.expenseTotal > 0}
          />
          <CashBankDailyHistoryMetric
            label="Net after expenses"
            value={formatMoney(restaurant.currency, dailyFinanceHistorySummary.netAfterExpenses)}
            note="Management net view"
            positive={dailyFinanceHistorySummary.netAfterExpenses >= 0}
            warning={dailyFinanceHistorySummary.netAfterExpenses < 0}
          />
        </div>

        <div className="cash-bank-daily-history-list">
          {dailyFinanceHistory.length === 0 ? (
            <div className="cash-bank-daily-history-empty">
              <FileText size={20} />
              <div>
                <strong>No finance summary history yet</strong>
                <span>Create daily finance summaries for previous dates to build this archive.</span>
              </div>
            </div>
          ) : (
            dailyFinanceHistory.map((summary) => (
              <article className={`cash-bank-daily-history-row ${getDailyFinanceHealthTone(summary)}`} key={summary.id || summary.summary_date}>
                <div>
                  <strong>{formatSimpleDate(summary.summary_date)}</strong>
                  <span>{getDailyFinanceHealthLabel(summary)}</span>
                  <small>
                    {summary.day_closing_status || 'open'} closing • {getDailyFinanceUpdatedLabel(summary)}
                  </small>
                </div>

                <div className="cash-bank-daily-history-values">
                  <span>Sales <strong>{formatMoney(summary.currency || restaurant.currency, summary.total_sales)}</strong></span>
                  <span>Collected <strong>{formatMoney(summary.currency || restaurant.currency, summary.collected_total)}</strong></span>
                  <span>Pending <strong>{formatMoney(summary.currency || restaurant.currency, summary.pending_total)}</strong></span>
                  <span>Net <strong>{formatMoney(summary.currency || restaurant.currency, summary.net_after_expenses)}</strong></span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-monthly cash-bank-monthly-finance-panel">
        <div className="cash-bank-monthly-finance-head">
          <div>
            <p className="pricing-label">Monthly Finance</p>
            <h3>Month-level finance summary</h3>
            <span>
              Review sales, collections, pending amounts, refunds, expenses and day health for the selected month.
            </span>
          </div>

          <div className="cash-bank-monthly-finance-actions">
            <label>
              Select month
              <input
                type="month"
                value={monthlyFinanceMonth}
                onChange={(event) => setMonthlyFinanceMonth(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={loadMonthlyFinanceSummary}
              disabled={monthlyFinanceLoading}
            >
              <RefreshCw size={18} />
              {monthlyFinanceLoading ? 'Loading...' : 'Refresh Month'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={printMonthlyFinanceSummary}
              disabled={monthlyFinanceSummaries.length === 0}
            >
              <Printer size={18} />
              Print Month
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportMonthlyFinanceCsv}
              disabled={monthlyFinanceSummaries.length === 0}
            >
              <Download size={18} />
              Export Month
            </button>
          </div>
        </div>

        <div className="cash-bank-monthly-finance-grid">
          <CashBankMonthlyFinanceMetric
            label="Days loaded"
            value={String(monthlyFinanceSummary.count)}
            note={formatMonthLabel(monthlyFinanceMonth)}
          />
          <CashBankMonthlyFinanceMetric
            label="Total sales"
            value={formatMoney(restaurant.currency, monthlyFinanceSummary.totalSales)}
            note="From saved daily summaries"
          />
          <CashBankMonthlyFinanceMetric
            label="Collected"
            value={formatMoney(restaurant.currency, monthlyFinanceSummary.collectedTotal)}
            note="Paid and collected total"
            positive
          />
          <CashBankMonthlyFinanceMetric
            label="Pending"
            value={formatMoney(restaurant.currency, monthlyFinanceSummary.pendingTotal)}
            note="COD + online pending"
            warning={monthlyFinanceSummary.pendingTotal > 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Refunds"
            value={formatMoney(restaurant.currency, monthlyFinanceSummary.refundTotal)}
            note="Recorded refund / adjustment total"
            warning={monthlyFinanceSummary.refundTotal > 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Expenses"
            value={formatMoney(restaurant.currency, monthlyFinanceSummary.expenseTotal)}
            note="Total month expenses"
            warning={monthlyFinanceSummary.expenseTotal > 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Net after expenses"
            value={formatMoney(restaurant.currency, monthlyFinanceSummary.netAfterExpenses)}
            note="Collected - refunds - expenses"
            positive={monthlyFinanceSummary.netAfterExpenses >= 0}
            warning={monthlyFinanceSummary.netAfterExpenses < 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Warnings"
            value={`${monthlyFinanceSummary.warningDays} day${monthlyFinanceSummary.warningDays === 1 ? '' : 's'}`}
            note={`${monthlyFinanceSummary.healthyDays} healthy day${monthlyFinanceSummary.healthyDays === 1 ? '' : 's'}`}
            warning={monthlyFinanceSummary.warningDays > 0}
          />
        </div>

        <div className="cash-bank-monthly-finance-health">
          <strong>{getMonthlyFinanceHealthLabel(monthlyFinanceSummary)}</strong>
          <span>
            This monthly view is generated from saved daily finance summaries. Refresh or create missing daily summaries before using it for final accounting.
          </span>
        </div>

        <div className={`cash-bank-month-close-panel ${monthlyCloseRecord?.status || 'open'}`}>
          <div className="cash-bank-month-close-head">
            <div>
              <p className="pricing-label">Month Close</p>
              <h3>Owner review & monthly lock</h3>
              <span>
                Save a month-end finance snapshot after daily summaries, reconciliation, P&amp;L and cash flow are checked.
              </span>
            </div>

            <div className="cash-bank-month-close-status">
              <strong>{getMonthlyCloseStatusLabel(monthlyCloseRecord)}</strong>
              <span>{getMonthlyCloseMetaLabel(monthlyCloseRecord)}</span>
            </div>
          </div>

          <div className="cash-bank-month-close-grid">
            <CashBankMonthCloseMetric
              label="Days loaded"
              value={String(monthlyFinanceSummary.count)}
              note={`${monthlyFinanceSummary.healthyDays} healthy • ${monthlyFinanceSummary.warningDays} warning`}
            />
            <CashBankMonthCloseMetric
              label="Net after expenses"
              value={formatMoney(restaurant.currency, monthlyFinanceSummary.netAfterExpenses)}
              note="Month-end result foundation"
              warning={monthlyFinanceSummary.netAfterExpenses < 0}
            />
            <CashBankMonthCloseMetric
              label="Pending risk"
              value={formatMoney(restaurant.currency, monthlyFinanceSummary.pendingTotal)}
              note="COD + online pending"
              warning={monthlyFinanceSummary.pendingTotal > 0}
            />
            <CashBankMonthCloseMetric
              label="Cash difference"
              value={formatMoney(restaurant.currency, monthlyFinanceSummary.cashDifferenceTotal)}
              note="Total drawer variance"
              warning={monthlyFinanceSummary.cashDifferenceTotal !== 0}
            />
          </div>

          <div className="cash-bank-month-close-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => saveMonthlyFinanceClose('reviewed')}
              disabled={monthlyCloseSaving || monthlyFinanceSummaries.length === 0}
            >
              <CheckCircle2 size={18} />
              {monthlyCloseSaving ? 'Saving...' : 'Mark Reviewed'}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => saveMonthlyFinanceClose('closed')}
              disabled={monthlyCloseSaving || monthlyFinanceSummaries.length === 0 || monthlyCloseRecord?.status === 'closed'}
            >
              <ClipboardCheck size={18} />
              {monthlyCloseSaving ? 'Closing...' : 'Close Month'}
            </button>

            {monthlyCloseRecord?.status === 'closed' && (
              <button
                type="button"
                className="secondary-button danger-soft"
                onClick={() => saveMonthlyFinanceClose('reopened')}
                disabled={monthlyCloseSaving}
              >
                <RefreshCw size={18} />
                Reopen Month
              </button>
            )}
          </div>
        </div>

        <div className="cash-bank-monthly-finance-list">
          {monthlyFinanceSummaries.length === 0 ? (
            <div className="cash-bank-monthly-finance-empty">
              <FileText size={20} />
              <div>
                <strong>No monthly summaries found</strong>
                <span>Create daily finance summaries for this month to build the monthly report.</span>
              </div>
            </div>
          ) : (
            monthlyFinanceSummaries.map((summary) => (
              <article className={`cash-bank-monthly-finance-row ${getDailyFinanceHealthTone(summary)}`} key={summary.id || summary.summary_date}>
                <div>
                  <strong>{formatSimpleDate(summary.summary_date)}</strong>
                  <span>{getDailyFinanceHealthLabel(summary)}</span>
                </div>

                <div className="cash-bank-monthly-finance-values">
                  <span>Sales <strong>{formatMoney(summary.currency || restaurant.currency, summary.total_sales)}</strong></span>
                  <span>Collected <strong>{formatMoney(summary.currency || restaurant.currency, summary.collected_total)}</strong></span>
                  <span>Pending <strong>{formatMoney(summary.currency || restaurant.currency, summary.pending_total)}</strong></span>
                  <span>Net <strong>{formatMoney(summary.currency || restaurant.currency, summary.net_after_expenses)}</strong></span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>


      <div className="cash-bank-tab-panel cash-bank-tab-tax cash-bank-tax-panel">
        <div className="cash-bank-tax-head">
          <div>
            <p className="pricing-label">Tax / VAT Report</p>
            <h3>Monthly tax estimate foundation</h3>
            <span>
              Estimate taxable sales and output tax from saved daily finance summaries. Use this for management review before final accountant filing.
            </span>
          </div>

          <div className="cash-bank-tax-actions">
            <label>
              Tax rate %
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={loadMonthlyFinanceSummary}
              disabled={monthlyFinanceLoading}
            >
              <RefreshCw size={18} />
              {monthlyFinanceLoading ? 'Loading...' : 'Refresh Month'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={printTaxVatReport}
              disabled={monthlyFinanceSummaries.length === 0}
            >
              <Printer size={18} />
              Print Tax Report
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportTaxVatReportCsv}
              disabled={monthlyFinanceSummaries.length === 0}
            >
              <Download size={18} />
              Export Tax CSV
            </button>
          </div>
        </div>

        <div className="cash-bank-tax-context">
          <span>Report month</span>
          <strong>{formatMonthLabel(monthlyFinanceMonth)}</strong>
          <span>Tax method</span>
          <strong>Tax included estimate</strong>
          <span>Source</span>
          <strong>Daily finance summaries</strong>
        </div>

        <div className="cash-bank-tax-grid">
          <CashBankTaxMetric
            label="Gross sales"
            value={formatMoney(restaurant.currency, taxVatSummary.grossSales)}
            note="Before refunds / adjustments"
          />
          <CashBankTaxMetric
            label="Refunds / adjustments"
            value={formatMoney(restaurant.currency, taxVatSummary.refunds)}
            note="Deducted before tax estimate"
            warning={taxVatSummary.refunds > 0}
          />
          <CashBankTaxMetric
            label="Taxable sales"
            value={formatMoney(restaurant.currency, taxVatSummary.taxableSales)}
            note="Gross sales minus refunds"
            positive={taxVatSummary.taxableSales > 0}
          />
          <CashBankTaxMetric
            label="Sales excl. tax"
            value={formatMoney(restaurant.currency, taxVatSummary.salesExcludingTax)}
            note={`Assuming ${taxVatSummary.rate.toFixed(2)}% tax included`}
          />
          <CashBankTaxMetric
            label="Estimated output tax"
            value={formatMoney(restaurant.currency, taxVatSummary.outputTax)}
            note="Sales VAT estimate"
            warning={taxVatSummary.outputTax > 0}
          />
          <CashBankTaxMetric
            label="Estimated input tax"
            value={formatMoney(restaurant.currency, inputTaxSummary.inputTax)}
            note={`${inputTaxSummary.recordCount} purchase record${inputTaxSummary.recordCount === 1 ? '' : 's'}`}
            positive={inputTaxSummary.inputTax > 0}
          />
          <CashBankTaxMetric
            label="Est. VAT payable"
            value={formatMoney(restaurant.currency, inputTaxSummary.vatPayable)}
            note={inputTaxSummary.vatPayable <= 0 ? 'Possible credit / no payable estimate' : 'Output tax minus input tax'}
            warning={inputTaxSummary.vatPayable > 0}
          />
          <CashBankTaxMetric
            label="Pending risk"
            value={formatMoney(restaurant.currency, taxVatSummary.pendingCollections)}
            note="Uncollected COD / online amounts"
            warning={taxVatSummary.pendingCollections > 0}
          />
        </div>

        <div className={`cash-bank-tax-health ${taxVatSummary.pendingCollections > 0 ? 'warning' : 'good'}`}>
          <strong>{getTaxVatHealthLabel(taxVatSummary, inputTaxSummary)}</strong>
          <span>
            This is not a final statutory VAT return. It is a Spizy management foundation from sales summaries and purchase input tax records. Later we can connect item-level tax rates, purchase bill OCR, TRN, VAT return boxes and accountant approval.
          </span>
        </div>

<div className={`cash-bank-vat-close-panel ${getTaxVatPeriodCloseTone(taxVatCloseRecord)}`}>
  <div className="cash-bank-vat-close-head">
    <div>
      <p className="pricing-label">VAT Period Close</p>
      <h3>Review and lock this month’s VAT estimate</h3>
      <span>
        Save a month-end tax snapshot after checking output tax, input tax, pending collections and purchase bills. This is for owner/accountant workflow control.
      </span>
    </div>

    <div className="cash-bank-vat-close-status">
      <strong>{getTaxVatPeriodCloseStatusLabel(taxVatCloseRecord)}</strong>
      <span>{getTaxVatPeriodCloseTimeLabel(taxVatCloseRecord)}</span>
    </div>
  </div>

  <div className="cash-bank-vat-close-grid">
    <CashBankVatCloseMetric
      label="Output tax"
      value={formatMoney(restaurant.currency, taxVatSummary.outputTax)}
      note="From taxable sales estimate"
    />
    <CashBankVatCloseMetric
      label="Input tax"
      value={formatMoney(restaurant.currency, inputTaxSummary.inputTax)}
      note={`${inputTaxSummary.recordCount} purchase record${inputTaxSummary.recordCount === 1 ? '' : 's'}`}
    />
    <CashBankVatCloseMetric
      label="VAT payable"
      value={formatMoney(restaurant.currency, inputTaxSummary.vatPayable)}
      note="Output tax minus input tax"
      warning={inputTaxSummary.vatPayable > 0}
    />
    <CashBankVatCloseMetric
      label="Pending risk"
      value={formatMoney(restaurant.currency, taxVatSummary.pendingCollections)}
      note="Review before final filing"
      warning={taxVatSummary.pendingCollections > 0}
    />
  </div>

  <div className="cash-bank-vat-close-actions">
    <button
      type="button"
      className="secondary-button"
      onClick={() => saveTaxVatPeriodClose('reviewed')}
      disabled={taxVatCloseSaving || monthlyFinanceSummaries.length === 0}
    >
      <ClipboardCheck size={18} />
      {taxVatCloseSaving ? 'Saving...' : 'Mark Reviewed'}
    </button>

    <button
      type="button"
      className="primary-button"
      onClick={() => saveTaxVatPeriodClose('closed')}
      disabled={taxVatCloseSaving || monthlyFinanceSummaries.length === 0 || taxVatCloseRecord?.status === 'closed'}
    >
      <CheckCircle2 size={18} />
      Close VAT Period
    </button>

    {taxVatCloseRecord?.status === 'closed' && (
      <button
        type="button"
        className="secondary-button danger-soft"
        onClick={() => saveTaxVatPeriodClose('reopened')}
        disabled={taxVatCloseSaving}
      >
        <RefreshCw size={18} />
        Reopen Period
      </button>
    )}
  </div>
</div>

        <div className="cash-bank-input-tax-panel">
          <div className="cash-bank-input-tax-head">
            <div>
              <p className="pricing-label">Input Tax / Purchase VAT</p>
              <h3>Record purchase VAT for accountant review</h3>
              <span>
                Add supplier bills and purchase tax here to estimate output tax minus input tax before final filing.
              </span>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => loadInputTaxRecords()}
              disabled={inputTaxLoading}
            >
              <RefreshCw size={18} />
              {inputTaxLoading ? 'Loading...' : 'Refresh Input Tax'}
            </button>
          </div>

          <div className="cash-bank-input-tax-summary-grid">
            <CashBankInputTaxMetric
              label="Purchase gross"
              value={formatMoney(restaurant.currency, inputTaxSummary.grossAmount)}
              note="Bills recorded for month"
            />
            <CashBankInputTaxMetric
              label="Purchase net"
              value={formatMoney(restaurant.currency, inputTaxSummary.netAmount)}
              note="Gross minus input tax"
            />
            <CashBankInputTaxMetric
              label="Input tax"
              value={formatMoney(restaurant.currency, inputTaxSummary.inputTax)}
              note="Claimable estimate foundation"
              positive={inputTaxSummary.inputTax > 0}
            />
            <CashBankInputTaxMetric
              label="VAT payable estimate"
              value={formatMoney(restaurant.currency, inputTaxSummary.vatPayable)}
              note="Output tax - input tax"
              warning={inputTaxSummary.vatPayable > 0}
            />
          </div>

          <form className="cash-bank-input-tax-form" onSubmit={handleSaveInputTaxRecord}>
            <label>
              Purchase date
              <input
                type="date"
                value={inputTaxForm.purchase_date}
                onChange={(event) => updateInputTaxForm('purchase_date', event.target.value)}
              />
            </label>

            <label>
              Supplier / bill name
              <input
                type="text"
                value={inputTaxForm.supplier_name}
                onChange={(event) => updateInputTaxForm('supplier_name', event.target.value)}
                placeholder="Supplier name"
              />
            </label>

            <label>
              Invoice no.
              <input
                type="text"
                value={inputTaxForm.invoice_number}
                onChange={(event) => updateInputTaxForm('invoice_number', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label>
              Category
              <select
                value={inputTaxForm.category}
                onChange={(event) => updateInputTaxForm('category', event.target.value)}
              >
                {inputTaxCategories.map((category) => (
                  <option value={category.value} key={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Gross amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputTaxForm.gross_amount}
                onChange={(event) => updateInputTaxForm('gross_amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Input tax amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputTaxForm.tax_amount}
                onChange={(event) => updateInputTaxForm('tax_amount', event.target.value)}
                placeholder="Auto from rate if empty"
              />
            </label>

            <label className="cash-bank-input-tax-wide">
              Notes
              <input
                type="text"
                value={inputTaxForm.notes}
                onChange={(event) => updateInputTaxForm('notes', event.target.value)}
                placeholder="Optional note for accountant"
              />
            </label>

            <button type="submit" className="primary-button" disabled={inputTaxSaving}>
              <Plus size={18} />
              {inputTaxSaving ? 'Saving...' : 'Add Input Tax'}
            </button>
          </form>

          <div className="cash-bank-input-tax-list">
            {inputTaxRecords.length === 0 ? (
              <div className="cash-bank-input-tax-empty">
                <FileText size={20} />
                <div>
                  <strong>No input tax records yet</strong>
                  <span>Add purchase bills for this month to estimate input VAT and payable VAT.</span>
                </div>
              </div>
            ) : (
              inputTaxRecords.map((record) => (
                <article className="cash-bank-input-tax-row" key={record.id}>
                  <div>
                    <strong>{record.supplier_name || 'Purchase bill'}</strong>
                    <span>
                      {formatSimpleDate(record.purchase_date)} • {formatInputTaxCategory(record.category)}
                      {record.invoice_number ? ` • Inv ${record.invoice_number}` : ''}
                    </span>
                    {record.notes && <small>{record.notes}</small>}
                  </div>

                  <div className="cash-bank-input-tax-values">
                    <span>Gross <strong>{formatMoney(record.currency || restaurant.currency, record.gross_amount)}</strong></span>
                    <span>Input tax <strong>{formatMoney(record.currency || restaurant.currency, record.input_tax_amount)}</strong></span>
                    <button
                      type="button"
                      className="cash-bank-input-tax-remove"
                      onClick={() => handleVoidInputTaxRecord(record)}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="cash-bank-tax-list">
          {monthlyFinanceSummaries.length === 0 ? (
            <div className="cash-bank-tax-empty">
              <FileText size={20} />
              <div>
                <strong>No tax report data yet</strong>
                <span>Create daily finance summaries for this month to build the Tax / VAT report.</span>
              </div>
            </div>
          ) : (
            monthlyFinanceSummaries.map((summary) => {
              const rowTax = buildTaxVatSummary({
                monthlySummary: buildMonthlyFinanceSummary([summary]),
                taxRate,
              })

              return (
                <article className={`cash-bank-tax-row ${getDailyFinanceHealthTone(summary)}`} key={summary.id || summary.summary_date}>
                  <div>
                    <strong>{formatSimpleDate(summary.summary_date)}</strong>
                    <span>{getDailyFinanceHealthLabel(summary)}</span>
                  </div>

                  <div className="cash-bank-tax-row-values">
                    <span>Sales <strong>{formatMoney(summary.currency || restaurant.currency, summary.total_sales)}</strong></span>
                    <span>Taxable <strong>{formatMoney(summary.currency || restaurant.currency, rowTax.taxableSales)}</strong></span>
                    <span>Est. tax <strong>{formatMoney(summary.currency || restaurant.currency, rowTax.outputTax)}</strong></span>
                    <span>Pending <strong>{formatMoney(summary.currency || restaurant.currency, summary.pending_total)}</strong></span>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>






      <div className="cash-bank-tab-panel cash-bank-tab-yearly cash-bank-yearly-finance-panel">
        <div className="cash-bank-yearly-finance-head">
          <div>
            <p className="pricing-label">Yearly Finance</p>
            <h3>Annual owner report foundation</h3>
            <span>
              Review the full year across saved daily finance summaries: sales, collections, pending risk, refunds, expenses, net result and warning months.
            </span>
          </div>

          <div className="cash-bank-yearly-finance-actions">
            <label className="cash-bank-yearly-input">
              Year
              <input
                type="number"
                min="2020"
                max="2100"
                value={yearlyFinanceYear}
                onChange={(event) => setYearlyFinanceYear(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={loadYearlyFinanceSummary}
              disabled={yearlyFinanceLoading}
            >
              <RefreshCw size={18} />
              {yearlyFinanceLoading ? 'Loading...' : 'Refresh Year'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={printYearlyFinanceSummary}
              disabled={yearlyFinanceSummaries.length === 0}
            >
              <Printer size={18} />
              Print Year
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportYearlyFinanceCsv}
              disabled={yearlyFinanceSummaries.length === 0}
            >
              <Download size={18} />
              Export Year
            </button>
          </div>
        </div>

        <div className="cash-bank-yearly-finance-grid">
          <CashBankMonthlyFinanceMetric
            label="Days loaded"
            value={String(yearlyFinanceSummary.count)}
            note={`${yearlyMonthRows.length} month${yearlyMonthRows.length === 1 ? '' : 's'} with summaries`}
          />
          <CashBankMonthlyFinanceMetric
            label="Total sales"
            value={formatMoney(restaurant.currency, yearlyFinanceSummary.totalSales)}
            note="Annual saved daily sales"
          />
          <CashBankMonthlyFinanceMetric
            label="Collected"
            value={formatMoney(restaurant.currency, yearlyFinanceSummary.collectedTotal)}
            note="Total collected during the year"
            positive
          />
          <CashBankMonthlyFinanceMetric
            label="Pending risk"
            value={formatMoney(restaurant.currency, yearlyFinanceSummary.pendingTotal)}
            note="COD + online pending"
            warning={yearlyFinanceSummary.pendingTotal > 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Refunds"
            value={formatMoney(restaurant.currency, yearlyFinanceSummary.refundTotal)}
            note="Recorded refunds / adjustments"
            warning={yearlyFinanceSummary.refundTotal > 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Expenses"
            value={formatMoney(restaurant.currency, yearlyFinanceSummary.expenseTotal)}
            note="Annual operating expenses"
            warning={yearlyFinanceSummary.expenseTotal > 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Net after expenses"
            value={formatMoney(restaurant.currency, yearlyFinanceSummary.netAfterExpenses)}
            note="Collected - refunds - expenses"
            positive={yearlyFinanceSummary.netAfterExpenses >= 0}
            warning={yearlyFinanceSummary.netAfterExpenses < 0}
          />
          <CashBankMonthlyFinanceMetric
            label="Warning days"
            value={`${yearlyFinanceSummary.warningDays} day${yearlyFinanceSummary.warningDays === 1 ? '' : 's'}`}
            note={`${yearlyFinanceSummary.healthyDays} healthy day${yearlyFinanceSummary.healthyDays === 1 ? '' : 's'}`}
            warning={yearlyFinanceSummary.warningDays > 0}
          />
        </div>

        <div className="cash-bank-yearly-finance-health">
          <strong>{getYearlyFinanceHealthLabel(yearlyFinanceSummary)}</strong>
          <span>
            This is a management report built from saved daily finance summaries. Missing daily summaries will reduce annual accuracy.
          </span>
        </div>

        <div className={`cash-bank-year-close-card ${yearlyCloseRecord?.status || 'open'}`}>
          <div className="cash-bank-year-close-head">
            <div>
              <p className="pricing-label">Year Close</p>
              <h3>{formatCloseStatus(yearlyCloseRecord?.status || 'open')}</h3>
              <span>
                Review and lock the annual finance snapshot after all monthly summaries are checked.
              </span>
            </div>
            <ShieldCheck size={22} />
          </div>

          <div className="cash-bank-year-close-grid">
            <CashBankMonthlyFinanceMetric
              label="Months loaded"
              value={String(yearlyMonthRows.length)}
              note={`${yearlyFinanceSummary.count} day${yearlyFinanceSummary.count === 1 ? '' : 's'} summarized`}
            />
            <CashBankMonthlyFinanceMetric
              label="Net result"
              value={formatMoney(restaurant.currency, yearlyFinanceSummary.netAfterExpenses)}
              note="Annual net after expenses"
              positive={yearlyFinanceSummary.netAfterExpenses >= 0}
              warning={yearlyFinanceSummary.netAfterExpenses < 0}
            />
            <CashBankMonthlyFinanceMetric
              label="Pending risk"
              value={formatMoney(restaurant.currency, yearlyFinanceSummary.pendingTotal)}
              note="COD + online pending"
              warning={yearlyFinanceSummary.pendingTotal > 0}
            />
            <CashBankMonthlyFinanceMetric
              label="Last action"
              value={yearlyCloseRecord?.updated_at ? formatDateTime(yearlyCloseRecord.updated_at) : 'Not reviewed'}
              note={yearlyCloseRecord?.status === 'closed' ? 'Closed and locked' : 'Review before final close'}
            />
          </div>

          <div className="cash-bank-year-close-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => saveYearlyFinanceClose('reviewed')}
              disabled={yearlyCloseSaving || yearlyFinanceSummaries.length === 0}
            >
              <CheckCircle2 size={18} />
              {yearlyCloseSaving ? 'Saving...' : 'Mark Year Reviewed'}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => saveYearlyFinanceClose('closed')}
              disabled={yearlyCloseSaving || yearlyFinanceSummaries.length === 0 || yearlyCloseRecord?.status === 'closed'}
            >
              <ClipboardCheck size={18} />
              {yearlyCloseSaving ? 'Closing...' : 'Close Year'}
            </button>

            {yearlyCloseRecord?.status === 'closed' && (
              <button
                type="button"
                className="secondary-button danger-soft"
                onClick={() => saveYearlyFinanceClose('reopened')}
                disabled={yearlyCloseSaving}
              >
                <RefreshCw size={18} />
                Reopen Year
              </button>
            )}
          </div>
        </div>

        <div className="cash-bank-yearly-month-list">
          {yearlyMonthRows.length === 0 ? (
            <div className="cash-bank-yearly-empty">
              <FileText size={20} />
              <div>
                <strong>No yearly summaries found</strong>
                <span>Create daily finance summaries throughout the year to build the annual report.</span>
              </div>
            </div>
          ) : (
            yearlyMonthRows.map((row) => (
              <article className={`cash-bank-yearly-month-row ${getYearlyMonthHealthTone(row)}`} key={row.monthKey}>
                <div>
                  <strong>{row.monthLabel}</strong>
                  <span>{getYearlyMonthHealthLabel(row)} • {row.count} day{row.count === 1 ? '' : 's'}</span>
                </div>

                <div className="cash-bank-yearly-month-values">
                  <span>Sales <strong>{formatMoney(restaurant.currency, row.totalSales)}</strong></span>
                  <span>Collected <strong>{formatMoney(restaurant.currency, row.collectedTotal)}</strong></span>
                  <span>Pending <strong>{formatMoney(restaurant.currency, row.pendingTotal)}</strong></span>
                  <span>Net <strong>{formatMoney(restaurant.currency, row.netAfterExpenses)}</strong></span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>



      <div className="cash-bank-tab-panel cash-bank-tab-profit-loss cash-bank-profit-loss-panel">
        <div className="cash-bank-profit-loss-head">
          <div>
            <p className="pricing-label">Profit &amp; Loss</p>
            <h3>Monthly business result foundation</h3>
            <span>
              Review gross sales, refunds, operating expenses, estimated profit/loss, margin and pending collection risk from saved daily finance summaries.
            </span>
          </div>

          <div className="cash-bank-profit-loss-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={printProfitLossReport}
              disabled={monthlyFinanceSummaries.length === 0}
            >
              <Printer size={18} />
              Print P&amp;L
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportProfitLossCsv}
              disabled={monthlyFinanceSummaries.length === 0}
            >
              <Download size={18} />
              Export P&amp;L
            </button>
          </div>
        </div>

        <div className="cash-bank-profit-loss-grid">
          <CashBankProfitLossMetric
            label="Gross sales"
            value={formatMoney(restaurant.currency, profitLossSummary.grossSales)}
            note="Sales before refunds"
          />
          <CashBankProfitLossMetric
            label="Net sales"
            value={formatMoney(restaurant.currency, profitLossSummary.netSales)}
            note="Gross sales - refunds"
            positive={profitLossSummary.netSales >= 0}
          />
          <CashBankProfitLossMetric
            label="Operating expenses"
            value={formatMoney(restaurant.currency, profitLossSummary.operatingExpenses)}
            note="Expenses from daily summaries"
            warning={profitLossSummary.operatingExpenses > 0}
          />
          <CashBankProfitLossMetric
            label="Estimated profit / loss"
            value={formatMoney(restaurant.currency, profitLossSummary.estimatedProfit)}
            note="Net sales - expenses"
            positive={profitLossSummary.estimatedProfit >= 0}
            warning={profitLossSummary.estimatedProfit < 0}
          />
          <CashBankProfitLossMetric
            label="Profit margin"
            value={`${profitLossSummary.profitMargin.toFixed(1)}%`}
            note="Estimated profit ÷ net sales"
            positive={profitLossSummary.profitMargin >= 0}
            warning={profitLossSummary.profitMargin < 0}
          />
          <CashBankProfitLossMetric
            label="Pending collections"
            value={formatMoney(restaurant.currency, profitLossSummary.pendingCollections)}
            note="Revenue not collected yet"
            warning={profitLossSummary.pendingCollections > 0}
          />
          <CashBankProfitLossMetric
            label="Cash basis result"
            value={formatMoney(restaurant.currency, profitLossSummary.cashBasisResult)}
            note="Collected - refunds - expenses"
            positive={profitLossSummary.cashBasisResult >= 0}
            warning={profitLossSummary.cashBasisResult < 0}
          />
          <CashBankProfitLossMetric
            label="Month health"
            value={`${profitLossSummary.warningDays} warning day${profitLossSummary.warningDays === 1 ? '' : 's'}`}
            note={`${profitLossSummary.healthyDays} healthy day${profitLossSummary.healthyDays === 1 ? '' : 's'}`}
            warning={profitLossSummary.warningDays > 0}
          />
        </div>

        <div className={`cash-bank-profit-loss-health ${getProfitLossTone(profitLossSummary)}`}>
          <strong>{getProfitLossHealthLabel(profitLossSummary)}</strong>
          <span>
            P&amp;L is a management foundation based on daily summaries. Add inventory cost, tax, payroll and supplier bills later for full accounting profit.
          </span>
        </div>

        <div className="cash-bank-profit-loss-insights">
          <div>
            <span>Best day</span>
            <strong>{profitLossSummary.bestDay ? formatSimpleDate(profitLossSummary.bestDay.summary_date) : 'No data'}</strong>
            <small>{formatMoney(restaurant.currency, profitLossSummary.bestDay?.net_after_expenses || 0)}</small>
          </div>
          <div>
            <span>Weak day</span>
            <strong>{profitLossSummary.weakDay ? formatSimpleDate(profitLossSummary.weakDay.summary_date) : 'No data'}</strong>
            <small>{formatMoney(restaurant.currency, profitLossSummary.weakDay?.net_after_expenses || 0)}</small>
          </div>
          <div>
            <span>Collection risk</span>
            <strong>{formatMoney(restaurant.currency, profitLossSummary.pendingCollections)}</strong>
            <small>COD + online pending inside selected month</small>
          </div>
        </div>
      </div>


      <div className="cash-bank-tab-panel cash-bank-tab-cash-flow cash-bank-cash-flow-panel">
        <div className="cash-bank-cash-flow-head">
          <div>
            <p className="pricing-label">Cash Flow</p>
            <h3>Monthly money movement foundation</h3>
            <span>
              Track real money movement from Cash &amp; Bank ledger and compare it with collected sales, refunds, expenses and pending collection risk.
            </span>
          </div>

          <div className="cash-bank-cash-flow-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={printCashFlowReport}
              disabled={monthlyFinanceSummaries.length === 0 && cashFlowSummary.ledgerEntryCount === 0}
            >
              <Printer size={18} />
              Print Cash Flow
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportCashFlowCsv}
              disabled={monthlyFinanceSummaries.length === 0 && cashFlowSummary.ledgerEntryCount === 0}
            >
              <Download size={18} />
              Export Cash Flow
            </button>
          </div>
        </div>

        <div className="cash-bank-cash-flow-grid">
          <CashBankCashFlowMetric
            label="Opening balance estimate"
            value={formatMoney(restaurant.currency, cashFlowSummary.openingBalanceEstimate)}
            note="Current balance minus month movement"
          />
          <CashBankCashFlowMetric
            label="Money in"
            value={formatMoney(restaurant.currency, cashFlowSummary.moneyIn)}
            note="Income + positive adjustments"
            positive
          />
          <CashBankCashFlowMetric
            label="Money out"
            value={formatMoney(restaurant.currency, cashFlowSummary.moneyOut)}
            note="Expenses + negative adjustments"
            warning={cashFlowSummary.moneyOut > 0}
          />
          <CashBankCashFlowMetric
            label="Net cash flow"
            value={formatMoney(restaurant.currency, cashFlowSummary.netCashFlow)}
            note="Money in - money out"
            positive={cashFlowSummary.netCashFlow >= 0}
            warning={cashFlowSummary.netCashFlow < 0}
          />
          <CashBankCashFlowMetric
            label="Current closing balance"
            value={formatMoney(restaurant.currency, cashFlowSummary.currentClosingBalance)}
            note="Current active account balances"
            positive={cashFlowSummary.currentClosingBalance >= 0}
            warning={cashFlowSummary.currentClosingBalance < 0}
          />
          <CashBankCashFlowMetric
            label="Cash basis result"
            value={formatMoney(restaurant.currency, cashFlowSummary.cashBasisResult)}
            note="Collected - refunds - expenses"
            positive={cashFlowSummary.cashBasisResult >= 0}
            warning={cashFlowSummary.cashBasisResult < 0}
          />
          <CashBankCashFlowMetric
            label="Pending collection risk"
            value={formatMoney(restaurant.currency, cashFlowSummary.pendingRisk)}
            note="COD + online pending"
            warning={cashFlowSummary.pendingRisk > 0}
          />
          <CashBankCashFlowMetric
            label="Ledger entries"
            value={String(cashFlowSummary.ledgerEntryCount)}
            note={`${cashFlowSummary.transferCount} internal transfer record${cashFlowSummary.transferCount === 1 ? '' : 's'}`}
          />
        </div>

        <div className={`cash-bank-cash-flow-health ${getCashFlowTone(cashFlowSummary)}`}>
          <strong>{getCashFlowHealthLabel(cashFlowSummary)}</strong>
          <span>
            Cash Flow is a management foundation. For final accounting, reconcile bank statements and confirm gateway settlements before month closing.
          </span>
        </div>

        <div className="cash-bank-cash-flow-split">
          <div className="cash-bank-cash-flow-card">
            <h4>Finance summary cash basis</h4>
            <div><span>Collected</span><strong>{formatMoney(restaurant.currency, cashFlowSummary.summaryCollected)}</strong></div>
            <div><span>Refunds</span><strong>- {formatMoney(restaurant.currency, cashFlowSummary.summaryRefunds)}</strong></div>
            <div><span>Expenses</span><strong>- {formatMoney(restaurant.currency, cashFlowSummary.summaryExpenses)}</strong></div>
            <div className="total"><span>Cash basis result</span><strong>{formatMoney(restaurant.currency, cashFlowSummary.cashBasisResult)}</strong></div>
          </div>

          <div className="cash-bank-cash-flow-card">
            <h4>Ledger movement view</h4>
            <div><span>Income / adjustment in</span><strong>{formatMoney(restaurant.currency, cashFlowSummary.moneyIn)}</strong></div>
            <div><span>Expense / adjustment out</span><strong>- {formatMoney(restaurant.currency, cashFlowSummary.moneyOut)}</strong></div>
            <div><span>Transfers in / out</span><strong>{formatMoney(restaurant.currency, cashFlowSummary.transferIn)} / {formatMoney(restaurant.currency, cashFlowSummary.transferOut)}</strong></div>
            <div className="total"><span>Net cash flow</span><strong>{formatMoney(restaurant.currency, cashFlowSummary.netCashFlow)}</strong></div>
          </div>
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-overview cash-bank-balance-integrity-panel">
        <div className="cash-bank-balance-integrity-head">
          <div>
            <p className="pricing-label">Balance Integrity</p>
            <h3>Ledger safety check</h3>
            <span>
              Rebuild stored account balances from non-voided Cash & Bank ledger entries whenever a closing is posted, reversed or corrected.
            </span>
          </div>
          <div className={`cash-bank-balance-status ${Number(lastBalanceAudit?.mismatched_accounts || 0) > 0 ? 'warning' : 'ok'}`}>
            <ShieldCheck size={18} />
            <strong>{lastBalanceAudit ? 'Audit ready' : 'No audit yet'}</strong>
            <span>{lastBalanceAudit ? formatDateTime(lastBalanceAudit.created_at) : 'Run recalculation after setup'}</span>
          </div>
        </div>

        <div className="cash-bank-balance-integrity-grid">
          <CashBankBalanceMetric
            label="Accounts checked"
            value={String(Number(lastBalanceAudit?.accounts_checked || activeAccounts.length || 0))}
            note="Active money accounts"
          />
          <CashBankBalanceMetric
            label="Corrected accounts"
            value={String(Number(lastBalanceAudit?.mismatched_accounts || 0))}
            note="Accounts adjusted during last check"
            warning={Number(lastBalanceAudit?.mismatched_accounts || 0) > 0}
          />
          <CashBankBalanceMetric
            label="Before total"
            value={formatMoney(restaurant.currency, lastBalanceAudit?.total_before ?? summary.totalBalance)}
            note="Stored balance before recalculation"
          />
          <CashBankBalanceMetric
            label="After total"
            value={formatMoney(restaurant.currency, lastBalanceAudit?.total_after ?? summary.totalBalance)}
            note="Balance rebuilt from ledger"
            positive
          />
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-reconcile cash-bank-reconciliation-panel">
        <div className="cash-bank-reconciliation-head">
          <div>
            <p className="pricing-label">Statement Reconciliation</p>
            <h3>Check ledger against real cash, card and bank statements</h3>
            <span>
              Mark entries as reconciled after verifying them with cash drawer count, card machine statement, bank account or gateway settlement report.
            </span>
          </div>
          <div className="cash-bank-reconciliation-status">
            <ClipboardCheck size={18} />
            <strong>{reconciliationSummary.reconciledCount} reconciled</strong>
            <span>{reconciliationSummary.unreconciledCount} active entries still need checking</span>
          </div>
        </div>

        <div className="cash-bank-reconciliation-grid">
          <CashBankReconciliationMetric
            label="Unreconciled active"
            value={formatMoney(restaurant.currency, reconciliationSummary.unreconciledAmount)}
            note={`${reconciliationSummary.unreconciledCount} ledger ${reconciliationSummary.unreconciledCount === 1 ? 'entry' : 'entries'} need review`}
            warning={reconciliationSummary.unreconciledCount > 0}
          />
          <CashBankReconciliationMetric
            label="Reconciled"
            value={formatMoney(restaurant.currency, reconciliationSummary.reconciledAmount)}
            note={`${reconciliationSummary.reconciledCount} verified ${reconciliationSummary.reconciledCount === 1 ? 'entry' : 'entries'}`}
            positive
          />
          <CashBankReconciliationMetric
            label="Cash pending check"
            value={formatMoney(restaurant.currency, reconciliationSummary.cashUnreconciled)}
            note="Cash drawer and petty cash entries"
            warning={reconciliationSummary.cashUnreconciled > 0}
          />
          <CashBankReconciliationMetric
            label="Bank / gateway pending"
            value={formatMoney(restaurant.currency, reconciliationSummary.bankGatewayUnreconciled)}
            note="Bank, card machine, wallet and gateway entries"
            warning={reconciliationSummary.bankGatewayUnreconciled > 0}
          />
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-accounts cash-bank-grid-panel cash-bank-main-grid">
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

      <form className="cash-bank-tab-panel cash-bank-tab-accounts cash-bank-transfer-card" onSubmit={handleCreateTransfer}>
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

      <div className="cash-bank-tab-panel cash-bank-tab-accounts cash-bank-grid-panel cash-bank-account-grid">
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

      <div className="cash-bank-tab-panel cash-bank-tab-ledger cash-bank-audit-panel">
        <div className="cash-bank-audit-head">
          <div>
            <p className="pricing-label">Posting Audit</p>
            <h3>Day Closing and ledger control</h3>
            <span>Review posted closings, reversals, manual entries and filtered ledger movement before final finance reporting.</span>
          </div>

          <div className="cash-bank-audit-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={printLedgerStatement}
              disabled={loading || filteredTransactions.length === 0}
            >
              <Printer size={17} />
              Print Statement
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={exportLedgerCsv}
              disabled={loading || filteredTransactions.length === 0}
            >
              <Download size={17} />
              Export Ledger CSV
            </button>
          </div>
        </div>

        <div className="cash-bank-audit-grid">
          <CashBankAuditMetric
            label="Filtered money in"
            value={formatMoney(restaurant.currency, auditSummary.moneyIn)}
            note={`${auditSummary.moneyInCount} active credit ${auditSummary.moneyInCount === 1 ? 'entry' : 'entries'}`}
            positive
          />
          <CashBankAuditMetric
            label="Filtered money out"
            value={formatMoney(restaurant.currency, auditSummary.moneyOut)}
            note={`${auditSummary.moneyOutCount} active debit ${auditSummary.moneyOutCount === 1 ? 'entry' : 'entries'}`}
            negative
          />
          <CashBankAuditMetric
            label="Day Closing posted"
            value={formatMoney(restaurant.currency, auditSummary.dayClosingPosted)}
            note={`${auditSummary.dayClosingCount} posting ${auditSummary.dayClosingCount === 1 ? 'entry' : 'entries'}`}
            positive
          />
          <CashBankAuditMetric
            label="Voided / reversed"
            value={formatMoney(restaurant.currency, auditSummary.voidedAmount)}
            note={`${auditSummary.voidedCount} audit ${auditSummary.voidedCount === 1 ? 'entry' : 'entries'}`}
            warning
          />
        </div>

        <div className="cash-bank-statement-strip">
          <span>Statement scope</span>
          <strong>{getAccountFilterLabel(activeAccounts, accountFilter)}</strong>
          <strong>{getSourceFilterLabel(sourceFilter)}</strong>
          <strong>{getMovementFilterLabel(movementFilter)}</strong>
          <strong>{getDateFilterLabel(dateFilter)}</strong>
          <strong>{getReconciliationFilterLabel(reconciliationFilter)}</strong>
        </div>
      </div>

      <div className="cash-bank-tab-panel cash-bank-tab-ledger cash-bank-ledger-card">
        <div className="cash-bank-ledger-head">
          <div>
            <p className="pricing-label">Ledger</p>
            <h3>Recent account movements</h3>
            <span className="cash-bank-ledger-subtitle">Showing {filteredTransactions.length} of {transactions.length} entries</span>
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

            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">All sources</option>
              <option value="day_closing">Day Closing</option>
              <option value="manual">Manual entries</option>
              <option value="system">Other system entries</option>
              <option value="reversal">Voided / reversed</option>
            </select>

            <select
              value={movementFilter}
              onChange={(event) => setMovementFilter(event.target.value)}
            >
              <option value="all">All movement</option>
              <option value="money_in">Money in</option>
              <option value="money_out">Money out</option>
              <option value="voided">Voided only</option>
            </select>

            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
            </select>

            <select
              value={reconciliationFilter}
              onChange={(event) => setReconciliationFilter(event.target.value)}
            >
              <option value="all">All reconcile</option>
              <option value="unreconciled">Unreconciled</option>
              <option value="reconciled">Reconciled</option>
              <option value="voided">Voided only</option>
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
                } ${transaction.is_voided ? 'voided' : ''} ${getLedgerSourceClass(transaction)}`}
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
                    {(transaction.source_type || transaction.metadata?.reversed_by_day_closing) && (
                      <small className={`cash-bank-source-badge ${getLedgerSourceClass(transaction)}`}>
                        {formatLedgerSource(transaction.source_type, transaction.metadata)}
                      </small>
                    )}
                    {transaction.external_reference && (
                      <small>Reference: {transaction.external_reference}</small>
                    )}
                    {transaction.source_id && (
                      <small>Source ID: {shortId(transaction.source_id)}</small>
                    )}
                    {transaction.is_reconciled && (
                      <small className="cash-bank-reconciled-badge">
                        Reconciled {formatDateTime(transaction.reconciled_at)}
                      </small>
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
                    <div className="cash-bank-ledger-action-stack">
                      {transaction.is_reconciled ? (
                        <button
                          type="button"
                          className="cash-bank-reconcile-button done"
                          onClick={() => handleUndoReconciliation(transaction)}
                          disabled={reconciliationSavingId === transaction.id}
                        >
                          <ClipboardCheck size={14} />
                          {reconciliationSavingId === transaction.id ? 'Saving...' : 'Reconciled'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="cash-bank-reconcile-button"
                          onClick={() => handleMarkReconciled(transaction)}
                          disabled={reconciliationSavingId === transaction.id}
                        >
                          <ClipboardCheck size={14} />
                          {reconciliationSavingId === transaction.id ? 'Saving...' : 'Mark Reconciled'}
                        </button>
                      )}

                      <button
                        type="button"
                        className="cash-bank-void-button"
                        onClick={() => handleVoidTransaction(transaction)}
                      >
                        <Trash2 size={14} />
                        Void
                      </button>
                    </div>
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

function buildFinanceAlerts({
  financeSetupAssistant,
  dailyFinanceSummary,
  monthlyFinanceSummary,
  profitLossSummary,
  cashFlowSummary,
  reconciliationSummary,
  businessHealthSummary,
  dailyFinanceHistorySummary,
  lastBalanceAudit,
}) {
  const items = []

  if (Number(financeSetupAssistant?.progress || 0) < 80) {
    items.push({
      key: 'setup_incomplete',
      tone: Number(financeSetupAssistant?.progress || 0) < 45 ? 'critical' : 'warning',
      title: 'Finance setup is not fully ready',
      detail: `${Number(financeSetupAssistant?.completedSteps || 0)}/${Number(financeSetupAssistant?.totalSteps || 0)} setup checks are complete. Finish setup before trusting monthly reports.`,
      actionLabel: 'Open Accounts',
      tab: 'accounts',
      primary: true,
    })
  }

  if (!dailyFinanceSummary) {
    items.push({
      key: 'daily_summary_missing',
      tone: 'warning',
      title: 'Selected day has no Daily Finance Summary',
      detail: 'Create the daily summary after Day Closing is posted so Monthly, P&L, Cash Flow and Health panels stay accurate.',
      actionLabel: 'Create Daily',
      tab: 'daily',
      primary: true,
    })
  }

  if (Number(reconciliationSummary?.unreconciledAmount || 0) > 0) {
    items.push({
      key: 'unreconciled_entries',
      tone: Number(reconciliationSummary?.unreconciledAmount || 0) > 1000 ? 'critical' : 'warning',
      title: 'Ledger entries need reconciliation',
      detail: `${Number(reconciliationSummary?.unreconciledCount || 0)} unreconciled entry${Number(reconciliationSummary?.unreconciledCount || 0) === 1 ? '' : 'ies'} worth ${formatMoney('', reconciliationSummary?.unreconciledAmount || 0)} need checking.`,
      actionLabel: 'Reconcile',
      tab: 'reconcile',
      primary: true,
    })
  }

  if (Number(monthlyFinanceSummary?.pendingTotal || 0) > 0) {
    items.push({
      key: 'pending_collection_risk',
      tone: Number(monthlyFinanceSummary?.pendingTotal || 0) > Number(monthlyFinanceSummary?.collectedTotal || 0) * 0.15 ? 'critical' : 'warning',
      title: 'Pending collections are affecting cash flow',
      detail: `Pending total is ${formatMoney('', monthlyFinanceSummary?.pendingTotal || 0)}. Check COD pending and online pending before month closing.`,
      actionLabel: 'Monthly View',
      tab: 'monthly',
      primary: false,
    })
  }

  if (Number(profitLossSummary?.estimatedProfit || 0) < 0) {
    items.push({
      key: 'negative_profit',
      tone: 'critical',
      title: 'Estimated P&L is negative',
      detail: `Estimated result is ${formatMoney('', profitLossSummary?.estimatedProfit || 0)}. Review expenses, refunds and weak sales days.`,
      actionLabel: 'Open P&L',
      tab: 'profit_loss',
      primary: true,
    })
  }

  if (Number(cashFlowSummary?.netCashFlow || 0) < 0) {
    items.push({
      key: 'negative_cash_flow',
      tone: 'warning',
      title: 'Monthly cash flow is negative',
      detail: `Net cash flow is ${formatMoney('', cashFlowSummary?.netCashFlow || 0)}. Compare money in, money out and pending collection risk.`,
      actionLabel: 'Cash Flow',
      tab: 'cash_flow',
      primary: false,
    })
  }

  if (Number(dailyFinanceHistorySummary?.warningDays || 0) > 0) {
    items.push({
      key: 'warning_days',
      tone: 'warning',
      title: 'Some daily summaries need review',
      detail: `${Number(dailyFinanceHistorySummary?.warningDays || 0)} day${Number(dailyFinanceHistorySummary?.warningDays || 0) === 1 ? '' : 's'} in history are marked as warning.`,
      actionLabel: 'Open History',
      tab: 'history',
      primary: false,
    })
  }

  if (!lastBalanceAudit) {
    items.push({
      key: 'balance_check_missing',
      tone: 'info',
      title: 'Balance integrity check not run yet',
      detail: 'Run balance recalculation after posting or reversing Day Closing to confirm account balances match ledger entries.',
      actionLabel: 'Overview',
      tab: 'overview',
      primary: false,
    })
  }

  if (items.length === 0) {
    items.push({
      key: 'finance_clear',
      tone: 'good',
      title: 'No urgent finance alerts',
      detail: 'Setup, daily summary, reconciliation, profit and cash flow checks look stable for the current data loaded.',
      actionLabel: 'Business Health',
      tab: 'overview',
      primary: false,
    })
  }

  const criticalCount = items.filter((item) => item.tone === 'critical').length
  const warningCount = items.filter((item) => item.tone === 'warning').length
  const infoCount = items.filter((item) => item.tone === 'info').length
  const goodCount = items.filter((item) => item.tone === 'good').length
  const tone = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : infoCount > 0 ? 'info' : 'good'

  return {
    items,
    tone,
    scoreLabel: criticalCount > 0 ? `${criticalCount} urgent` : warningCount > 0 ? `${warningCount} warning` : infoCount > 0 ? `${infoCount} task` : 'Clear',
    summaryLabel: `${items.length} action${items.length === 1 ? '' : 's'}`,
    title:
      tone === 'critical'
        ? 'Finance needs urgent review'
        : tone === 'warning'
          ? 'Finance checks need attention'
          : tone === 'info'
            ? 'Finance tasks available'
            : 'Finance looks clear',
    message:
      tone === 'good'
        ? 'No urgent problems are visible from the current loaded finance data.'
        : 'Use these alerts as the owner action list before closing the day or reviewing monthly reports.',
    businessHealthScore: Number(businessHealthSummary?.score || 0),
    goodCount,
  }
}

function buildFinanceSetupAssistant({ accounts, transactions, dailyFinanceSummary, monthlyFinanceSummaries }) {
  const activeAccounts = accounts || []
  const activeTypes = new Set(activeAccounts.map((account) => account.account_type))
  const requiredAccountsReady = recommendedFinanceAccounts
    .filter((account) => account.required)
    .every((account) => activeTypes.has(account.account_type))
  const bankAccountReady = activeTypes.has('bank')
  const hasLedgerMovement = (transactions || []).some((transaction) => !transaction.is_voided)
  const hasDailySummary = Boolean(dailyFinanceSummary)
  const hasMonthlyHistory = (monthlyFinanceSummaries || []).length > 0

  const steps = [
    {
      key: 'required_accounts',
      title: 'Required accounts',
      detail: requiredAccountsReady
        ? 'Cash drawer, card machine and online gateway accounts are ready.'
        : 'Create cash drawer, card machine and online gateway clearing accounts.',
      done: requiredAccountsReady,
    },
    {
      key: 'bank_account',
      title: 'Bank settlement account',
      detail: bankAccountReady
        ? 'A bank account is available for deposits and gateway settlements.'
        : 'Add a bank account when the restaurant is ready for statement reconciliation.',
      done: bankAccountReady,
      warning: !bankAccountReady,
    },
    {
      key: 'ledger_movement',
      title: 'Ledger movement',
      detail: hasLedgerMovement
        ? 'Cash & Bank has active ledger movements to review.'
        : 'Post Day Closing or add an opening/manual entry to start the ledger.',
      done: hasLedgerMovement,
    },
    {
      key: 'daily_summary',
      title: 'Daily finance summary',
      detail: hasDailySummary
        ? 'The selected day has a finance summary ready.'
        : 'Create a daily summary after Day Closing is posted.',
      done: hasDailySummary,
    },
    {
      key: 'monthly_history',
      title: 'Monthly reporting data',
      detail: hasMonthlyHistory
        ? 'Monthly Finance, P&L, Cash Flow and Health panels have data.'
        : 'Create daily summaries to unlock stronger monthly reports.',
      done: hasMonthlyHistory,
    },
  ]

  const completedSteps = steps.filter((step) => step.done).length
  const totalSteps = steps.length
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  return {
    steps,
    completedSteps,
    totalSteps,
    progress,
    title: progress >= 80 ? 'Finance setup is almost ready' : 'Complete finance setup first',
    statusLabel: progress >= 80 ? 'Ready for daily use' : progress >= 45 ? 'Partially ready' : 'Setup needed',
    message:
      progress >= 80
        ? 'Your finance base is ready. Continue using Day Closing, Daily Summary and Reconciliation every day.'
        : 'Create the core accounts first, then post Day Closing and create daily summaries for accurate reports.',
  }
}

function buildFinanceSetupGuide({
  assistant,
  accounts,
  transactions,
  dailyFinanceSummary,
  monthlyFinanceSummaries,
  reconciliationSummary,
}) {
  const activeTypes = new Set((accounts || []).map((account) => account.account_type))
  const requiredAccountsReady = recommendedFinanceAccounts
    .filter((account) => account.required)
    .every((account) => activeTypes.has(account.account_type))
  const hasLedgerMovement = (transactions || []).some((transaction) => !transaction.is_voided)
  const hasDailySummary = Boolean(dailyFinanceSummary)
  const hasUnreconciled = Number(reconciliationSummary?.unreconciledAmount || 0) > 0
  const hasMonthlyData = (monthlyFinanceSummaries || []).length > 0

  const steps = [
    {
      key: 'setup_accounts',
      title: 'Create finance accounts',
      detail: requiredAccountsReady
        ? 'Required accounts are ready for cash, card machine and online gateway posting.'
        : 'Start here. Create the required accounts so Day Closing can post collections into the ledger.',
      done: requiredAccountsReady,
      status: requiredAccountsReady ? 'done' : 'active',
      action: requiredAccountsReady ? 'open_accounts' : 'create_accounts',
      actionLabel: requiredAccountsReady ? 'View Accounts' : 'Create Accounts',
      tab: 'accounts',
      primary: !requiredAccountsReady,
      icon: <WalletCards size={17} />,
    },
    {
      key: 'post_day_closing',
      title: 'Post Day Closing to Cash & Bank',
      detail: hasLedgerMovement
        ? 'Ledger movement exists. Continue reviewing postings and references.'
        : 'Go to Day Closing, create a payment snapshot, close the day and post it to Cash & Bank.',
      done: hasLedgerMovement,
      status: hasLedgerMovement ? 'done' : requiredAccountsReady ? 'active' : 'locked',
      actionLabel: hasLedgerMovement ? 'Review Ledger' : 'Open Ledger',
      tab: 'ledger',
      primary: requiredAccountsReady && !hasLedgerMovement,
      icon: <FileText size={17} />,
    },
    {
      key: 'daily_summary',
      title: 'Create Daily Finance Summary',
      detail: hasDailySummary
        ? 'The selected day has a saved finance summary.'
        : 'After posting Day Closing, create the daily finance summary for owner reporting.',
      done: hasDailySummary,
      status: hasDailySummary ? 'done' : hasLedgerMovement ? 'active' : 'locked',
      actionLabel: 'Open Daily',
      tab: 'daily',
      primary: hasLedgerMovement && !hasDailySummary,
      icon: <ClipboardCheck size={17} />,
    },
    {
      key: 'reconcile',
      title: 'Reconcile cash, card and gateway movements',
      detail: hasUnreconciled
        ? 'There are unreconciled ledger movements. Check bank/card/gateway statement status.'
        : 'No major unreconciled balance is currently highlighted for the loaded ledger.',
      done: !hasUnreconciled && hasLedgerMovement,
      status: hasUnreconciled ? 'active warning' : hasLedgerMovement ? 'done' : 'locked',
      actionLabel: 'Open Reconcile',
      tab: 'reconcile',
      primary: hasUnreconciled,
      icon: <ShieldCheck size={17} />,
    },
    {
      key: 'monthly_review',
      title: 'Review Monthly, P&L, Cash Flow and Health',
      detail: hasMonthlyData
        ? 'Monthly reports have daily summary data. Review profit, cash flow and health regularly.'
        : 'Create multiple daily summaries to make monthly reports meaningful.',
      done: hasMonthlyData && Number(assistant?.progress || 0) >= 80,
      status: hasMonthlyData ? 'active' : 'locked',
      actionLabel: 'Open Monthly',
      tab: 'monthly',
      primary: false,
      icon: <CircleDollarSign size={17} />,
    },
  ]

  const readyCount = steps.filter((step) => step.done).length
  const totalCount = steps.length
  const nextStep = steps.find((step) => !step.done && step.status.includes('active')) ||
    steps.find((step) => !step.done) ||
    steps[steps.length - 1]

  return {
    steps,
    readyCount,
    totalCount,
    title: readyCount === totalCount ? 'Finance workflow is ready' : 'Follow the finance setup path',
    message:
      readyCount === totalCount
        ? 'The main finance workflow is ready. Keep using Day Closing, reconciliation and reports daily.'
        : 'Complete these actions in order so Cash & Bank, daily finance, monthly reports and owner health score stay accurate.',
    nextActionLabel: nextStep?.done ? 'All ready' : nextStep?.actionLabel || 'Continue setup',
    tone: readyCount >= 4 ? 'ready' : readyCount >= 2 ? 'progress' : 'setup',
  }
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

function CashBankDailyFinanceMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-daily-finance-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}


function CashBankTaxMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-tax-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankInputTaxMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-input-tax-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankVatCloseMetric({ label, value, note, warning = false }) {
  return (
    <article className={`cash-bank-vat-close-metric ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankMonthlyFinanceMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-monthly-finance-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankMonthCloseMetric({ label, value, note, warning = false }) {
  return (
    <article className={`cash-bank-month-close-metric ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankProfitLossMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-profit-loss-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}


function CashBankCashFlowMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-cash-flow-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankBusinessHealthMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-business-health-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}


function CashBankDailyHistoryMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-daily-history-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankAuditMetric({ label, value, note, positive = false, negative = false, warning = false }) {
  return (
    <article
      className={`cash-bank-audit-metric ${positive ? 'positive' : ''} ${
        negative ? 'negative' : ''
      } ${warning ? 'warning' : ''}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankBalanceMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-balance-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function CashBankReconciliationMetric({ label, value, note, positive = false, warning = false }) {
  return (
    <article className={`cash-bank-reconciliation-metric ${positive ? 'positive' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function buildCashBankReconciliationSummary(items) {
  return items.reduce(
    (summary, transaction) => {
      const amount = Number(transaction.amount || 0)
      const accountType = transaction.account?.account_type || ''

      if (transaction.is_voided) {
        summary.voidedAmount += amount
        summary.voidedCount += 1
        return summary
      }

      if (transaction.is_reconciled) {
        summary.reconciledAmount += amount
        summary.reconciledCount += 1
        return summary
      }

      summary.unreconciledAmount += amount
      summary.unreconciledCount += 1

      if (['cash', 'petty_cash'].includes(accountType)) {
        summary.cashUnreconciled += amount
      } else if (['bank', 'card_machine', 'online_gateway', 'wallet'].includes(accountType)) {
        summary.bankGatewayUnreconciled += amount
      }

      return summary
    },
    {
      unreconciledAmount: 0,
      unreconciledCount: 0,
      reconciledAmount: 0,
      reconciledCount: 0,
      cashUnreconciled: 0,
      bankGatewayUnreconciled: 0,
      voidedAmount: 0,
      voidedCount: 0,
    },
  )
}

function buildCashBankAuditSummary(items) {
  return items.reduce(
    (summary, transaction) => {
      const amount = Number(transaction.amount || 0)
      const moneyIn = isMoneyIn(transaction.transaction_type)
      const dayClosing = isDayClosingLedgerEntry(transaction)

      if (transaction.is_voided) {
        summary.voidedAmount += amount
        summary.voidedCount += 1
        return summary
      }

      if (moneyIn) {
        summary.moneyIn += amount
        summary.moneyInCount += 1
      } else {
        summary.moneyOut += amount
        summary.moneyOutCount += 1
      }

      if (dayClosing) {
        summary.dayClosingPosted += amount
        summary.dayClosingCount += 1
      }

      if (!transaction.source_type && !transaction.metadata?.reversed_by_day_closing) {
        summary.manualCount += 1
      }

      return summary
    },
    {
      moneyIn: 0,
      moneyOut: 0,
      dayClosingPosted: 0,
      voidedAmount: 0,
      moneyInCount: 0,
      moneyOutCount: 0,
      dayClosingCount: 0,
      voidedCount: 0,
      manualCount: 0,
    },
  )
}

function matchesLedgerSourceFilter(transaction, filter) {
  if (filter === 'all') return true

  const dayClosing = isDayClosingLedgerEntry(transaction)
  const reversed = Boolean(transaction.is_voided || transaction.metadata?.reversed_by_day_closing)
  const manual = !transaction.source_type && !transaction.metadata?.reversed_by_day_closing

  if (filter === 'day_closing') return dayClosing
  if (filter === 'manual') return manual
  if (filter === 'reversal') return reversed
  if (filter === 'system') return Boolean(transaction.source_type && !dayClosing)

  return true
}

function matchesLedgerMovementFilter(transaction, filter) {
  if (filter === 'all') return true
  if (filter === 'money_in') return isMoneyIn(transaction.transaction_type) && !transaction.is_voided
  if (filter === 'money_out') return !isMoneyIn(transaction.transaction_type) && !transaction.is_voided
  if (filter === 'voided') return Boolean(transaction.is_voided)

  return true
}

function matchesLedgerDateFilter(transaction, filter) {
  if (filter === 'all') return true

  const value = transaction.transaction_date
  if (!value) return false

  if (filter === 'today') return value === getTodayInputDate()

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false

  const today = new Date(`${getTodayInputDate()}T00:00:00`)
  const diffDays = Math.floor((today.getTime() - date.getTime()) / 86400000)

  if (filter === 'last7') return diffDays >= 0 && diffDays <= 7
  if (filter === 'last30') return diffDays >= 0 && diffDays <= 30

  return true
}

function matchesReconciliationFilter(transaction, filter) {
  if (filter === 'all') return true
  if (filter === 'reconciled') return Boolean(transaction.is_reconciled && !transaction.is_voided)
  if (filter === 'unreconciled') return Boolean(!transaction.is_reconciled && !transaction.is_voided)
  if (filter === 'voided') return Boolean(transaction.is_voided)

  return true
}

function isDayClosingLedgerEntry(transaction) {
  return ['day_closing_cash_bank_posting', 'day_closing'].includes(transaction.source_type)
}

function getLedgerSourceClass(transaction) {
  if (transaction.metadata?.reversed_by_day_closing || transaction.is_voided) return 'source-reversed'
  if (isDayClosingLedgerEntry(transaction)) return 'source-day-closing'
  if (transaction.source_type) return 'source-system'
  return 'source-manual'
}

function shortId(value) {
  const text = String(value || '')
  if (text.length <= 12) return text
  return `${text.slice(0, 8)}…${text.slice(-4)}`
}


function buildDailyFinanceSummaryReportHtml({ restaurant, summary, currency }) {
  const breakdown = summary?.summary_breakdown || {}
  const generatedFrom = breakdown.generated_from || {}
  const gatewayRows = getDailyBreakdownEntries(breakdown.gateway_breakdown)
  const issueRows = getDailyBreakdownEntries(breakdown.issue_breakdown)
  const date = summary?.summary_date || getTodayInputDate()
  const netAfterExpenses = Number(summary?.net_after_expenses || 0)
  const pendingTotal = Number(summary?.pending_total || 0)
  const cashDifference = Number(summary?.cash_difference || 0)
  const health = getDailyFinanceSummaryStatus(summary)

  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Daily Finance Summary - ${escapeHtml(date)}</title>
        <style>
          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, sans-serif;
            color: #111;
            background: #f5f5f5;
          }

          .report {
            max-width: 980px;
            margin: 0 auto;
            padding: 24px;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 18px 48px rgba(0,0,0,0.12);
          }

          .head {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            border-bottom: 3px solid #111;
            padding-bottom: 16px;
          }

          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          h3 { margin: 22px 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; }
          .muted { color: #555; line-height: 1.45; font-size: 12px; }
          .right { text-align: right; white-space: pre-line; }

          .health {
            margin-top: 16px;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid ${pendingTotal > 0 || cashDifference !== 0 || netAfterExpenses < 0 ? '#f59e0b' : '#16a34a'};
            background: ${pendingTotal > 0 || cashDifference !== 0 || netAfterExpenses < 0 ? '#fffbeb' : '#f0fdf4'};
            font-weight: 800;
          }

          .grid {
            margin-top: 18px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }

          .metric {
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 12px;
            min-height: 82px;
          }

          .metric span {
            display: block;
            color: #555;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .metric strong {
            display: block;
            margin-top: 8px;
            font-size: 17px;
          }

          .metric.good strong { color: #15803d; }
          .metric.warn strong { color: #b45309; }
          .metric.bad strong { color: #b91c1c; }

          table {
            width: 100%;
            margin-top: 10px;
            border-collapse: collapse;
            font-size: 12px;
          }

          th, td {
            padding: 8px 7px;
            border-bottom: 1px solid #ddd;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f3f3f3;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          td.amount { text-align: right; font-weight: 800; white-space: nowrap; }

          .source-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 10px;
          }

          .source-item {
            padding: 9px;
            border-radius: 10px;
            border: 1px solid #ddd;
            font-size: 12px;
          }

          .source-item strong { display:block; margin-top:4px; }

          .actions {
            margin-top: 22px;
            display: flex;
            gap: 10px;
          }

          button {
            padding: 10px 14px;
            border: 0;
            border-radius: 8px;
            color: #fff;
            background: #111;
            font-weight: 800;
            cursor: pointer;
          }

          @media print {
            body { padding: 12px; background: #fff; }
            .report { max-width: none; box-shadow: none; padding: 0; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Daily Finance Summary</h2>
              <p class="muted">Date: ${escapeHtml(date)} • Currency: ${escapeHtml(currency)}</p>
            </div>
            <div class="right muted">
              Spizy Menu\nPrinted: ${escapeHtml(formatDateTime(new Date().toISOString()))}\n${escapeHtml(getDailyFinanceUpdatedLabel(summary))}
            </div>
          </div>

          <div class="health">${escapeHtml(health)}</div>

          <div class="grid">
            ${financeMetric('Total sales', formatMoney(currency, summary?.total_sales || 0))}
            ${financeMetric('Collected', formatMoney(currency, summary?.collected_total || 0), 'good')}
            ${financeMetric('Pending', formatMoney(currency, summary?.pending_total || 0), pendingTotal > 0 ? 'warn' : '')}
            ${financeMetric('Refunds', formatMoney(currency, summary?.refund_total || 0), Number(summary?.refund_total || 0) > 0 ? 'warn' : '')}
            ${financeMetric('Expenses', formatMoney(currency, summary?.expense_total || 0), Number(summary?.expense_total || 0) > 0 ? 'warn' : '')}
            ${financeMetric('Net collection', formatMoney(currency, summary?.net_collection || 0), Number(summary?.net_collection || 0) >= 0 ? 'good' : 'bad')}
            ${financeMetric('Net after expenses', formatMoney(currency, summary?.net_after_expenses || 0), netAfterExpenses >= 0 ? 'good' : 'bad')}
            ${financeMetric('Cash difference', formatMoney(currency, summary?.cash_difference || 0), cashDifference === 0 ? 'good' : 'bad')}
          </div>

          <h3>Collection & Pending Details</h3>
          <table>
            <tbody>
              ${reportRow('COD pending', formatMoney(currency, summary?.cod_pending || 0))}
              ${reportRow('Online pending', formatMoney(currency, summary?.online_pending || 0))}
              ${reportRow('Cash & Bank money in', formatMoney(currency, summary?.cash_bank_money_in || 0))}
              ${reportRow('Cash & Bank money out', formatMoney(currency, summary?.cash_bank_money_out || 0))}
              ${reportRow('Day closing status', summary?.day_closing_status || 'open')}
              ${reportRow('Orders counted', Number(breakdown.order_count || 0))}
              ${reportRow('Ledger entries counted', Number(breakdown.ledger_entry_count || 0))}
            </tbody>
          </table>

          <h3>Gateway / Method Breakdown</h3>
          <table>
            <thead><tr><th>Method</th><th>Count</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
              ${gatewayRows.length ? gatewayRows.map((row) => `<tr><td>${escapeHtml(formatReportKey(row.key))}</td><td>${row.count}</td><td class="amount">${escapeHtml(formatMoney(currency, row.amount))}</td></tr>`).join('') : '<tr><td colspan="3">No gateway breakdown available.</td></tr>'}
            </tbody>
          </table>

          <h3>Issues Needing Attention</h3>
          <table>
            <thead><tr><th>Issue</th><th>Count</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
              ${issueRows.length ? issueRows.map((row) => `<tr><td>${escapeHtml(formatReportKey(row.key))}</td><td>${row.count}</td><td class="amount">${escapeHtml(formatMoney(currency, row.amount))}</td></tr>`).join('') : '<tr><td colspan="3">No payment issues found.</td></tr>'}
            </tbody>
          </table>

          <h3>Source Coverage</h3>
          <div class="source-grid">
            ${sourceItem('Orders', generatedFrom.orders)}
            ${sourceItem('Expenses', generatedFrom.expenses)}
            ${sourceItem('Day Closing', generatedFrom.day_closing)}
            ${sourceItem('Payment Snapshot', generatedFrom.payment_snapshot)}
            ${sourceItem('Refund Records', generatedFrom.refunds)}
            ${sourceItem('Cash & Bank Ledger', generatedFrom.cash_bank_ledger)}
          </div>

          <p class="muted" style="margin-top:14px;">This is a management finance summary generated from Spizy Orders, Day Closing, Payment Snapshot, refunds, expenses and Cash & Bank ledger data available for the selected date.</p>

          <div class="actions">
            <button onclick="window.print()">Print Finance Summary</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}

function financeMetric(label, value, tone = '') {
  return `<div class="metric ${escapeHtml(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
}

function reportRow(label, value) {
  return `<tr><td>${escapeHtml(label)}</td><td class="amount">${escapeHtml(value)}</td></tr>`
}

function sourceItem(label, enabled) {
  return `<div class="source-item"><span>${escapeHtml(label)}</span><strong>${enabled ? 'Included' : 'Not found'}</strong></div>`
}

function getDailyBreakdownEntries(value) {
  if (!value || typeof value !== 'object') return []

  return Object.entries(value)
    .map(([key, row]) => ({
      key,
      count: Number(row?.count || 0),
      amount: Number(row?.amount || 0),
    }))
    .filter((row) => row.count > 0 || row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

function formatReportKey(value) {
  return String(value || 'Unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildCashBankStatementHtml({
  restaurant,
  accounts,
  transactions,
  auditSummary,
  accountFilter,
  sourceFilter,
  movementFilter,
  dateFilter,
  reconciliationFilter,
}) {
  const selectedAccount = accountFilter === 'all'
    ? null
    : accounts.find((account) => account.id === accountFilter)
  const currency = selectedAccount?.currency || restaurant?.currency || 'AED'
  const netMovement = Number(auditSummary.moneyIn || 0) - Number(auditSummary.moneyOut || 0)
  const filterLines = [
    ['Account', getAccountFilterLabel(accounts, accountFilter)],
    ['Source', getSourceFilterLabel(sourceFilter)],
    ['Movement', getMovementFilterLabel(movementFilter)],
    ['Date range', getDateFilterLabel(dateFilter)],
    ['Reconciliation', getReconciliationFilterLabel(reconciliationFilter)],
    ['Generated', formatDateTime(new Date().toISOString())],
  ]

  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Cash & Bank Statement</title>
        <style>
          body {
            margin: 0;
            padding: 28px;
            font-family: Arial, sans-serif;
            color: #111;
            background: #fff;
          }

          .statement {
            max-width: 920px;
            margin: 0 auto;
          }

          .head {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 3px solid #111;
            padding-bottom: 16px;
          }

          h1, h2, h3, p {
            margin: 0;
          }

          h1 {
            font-size: 26px;
            letter-spacing: -0.03em;
          }

          h2 {
            margin-top: 6px;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
          }

          .muted {
            margin-top: 6px;
            color: #555;
            font-size: 12px;
            line-height: 1.45;
          }

          .status {
            text-align: right;
            font-size: 12px;
            color: #444;
            line-height: 1.5;
          }

          .summary {
            margin-top: 18px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }

          .metric {
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 12px;
          }

          .metric span {
            display: block;
            color: #555;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .metric strong {
            display: block;
            margin-top: 6px;
            font-size: 16px;
          }

          .filters {
            margin-top: 14px;
            padding: 12px;
            border: 1px dashed #aaa;
            border-radius: 12px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
          }

          .filters span {
            display: block;
            color: #666;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .filters strong {
            display: block;
            margin-top: 4px;
            font-size: 12px;
          }

          table {
            width: 100%;
            margin-top: 18px;
            border-collapse: collapse;
            font-size: 12px;
          }

          th, td {
            padding: 8px 7px;
            border-bottom: 1px solid #ddd;
            text-align: left;
            vertical-align: top;
          }

          th {
            color: #222;
            background: #f3f3f3;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          td.amount {
            text-align: right;
            white-space: nowrap;
            font-weight: 800;
          }

          .voided {
            color: #777;
            text-decoration: line-through;
          }

          .source {
            display: inline-block;
            margin-top: 4px;
            padding: 2px 6px;
            border-radius: 999px;
            border: 1px solid #bbb;
            color: #444;
            font-size: 10px;
            font-weight: 800;
          }

          .actions {
            margin-top: 22px;
            display: flex;
            gap: 10px;
          }

          button {
            padding: 10px 14px;
            border: 0;
            border-radius: 8px;
            color: #fff;
            background: #111;
            font-weight: 800;
            cursor: pointer;
          }

          @media print {
            body { padding: 14px; }
            .actions { display: none; }
            .statement { max-width: none; }
          }
        </style>
      </head>

      <body>
        <div class="statement">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Cash & Bank Statement</h2>
            </div>
            <div class="status">
              <strong>Spizy Menu</strong><br />
              ${escapeHtml(filterLines.map(([label, value]) => `${label}: ${value}`).join('\n'))}
            </div>
          </div>

          <div class="summary">
            <div class="metric"><span>Money in</span><strong>${escapeHtml(formatMoney(currency, auditSummary.moneyIn))}</strong></div>
            <div class="metric"><span>Money out</span><strong>${escapeHtml(formatMoney(currency, auditSummary.moneyOut))}</strong></div>
            <div class="metric"><span>Net movement</span><strong>${escapeHtml(formatMoney(currency, netMovement))}</strong></div>
            <div class="metric"><span>Entries</span><strong>${transactions.length}</strong></div>
          </div>

          <div class="filters">
            ${filterLines.map(([label, value]) => `
              <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `).join('')}
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Entry</th>
                <th>Source</th>
                <th>Status</th>
                <th>Reconciled</th>
                <th style="text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.length ? transactions.map((transaction) => `
                <tr class="${transaction.is_voided ? 'voided' : ''}">
                  <td>${escapeHtml(formatSimpleDate(transaction.transaction_date))}</td>
                  <td>
                    ${escapeHtml(transaction.account?.account_name || 'Account')}
                    ${transaction.related_account?.account_name ? `<br /><span class="muted">To/from: ${escapeHtml(transaction.related_account.account_name)}</span>` : ''}
                  </td>
                  <td>
                    <strong>${escapeHtml(transaction.title || formatTransactionType(transaction.transaction_type))}</strong>
                    ${transaction.description ? `<br /><span class="muted">${escapeHtml(transaction.description)}</span>` : ''}
                    ${transaction.external_reference ? `<br /><span class="muted">Ref: ${escapeHtml(transaction.external_reference)}</span>` : ''}
                  </td>
                  <td><span class="source">${escapeHtml(formatLedgerSource(transaction.source_type, transaction.metadata))}</span></td>
                  <td>${transaction.is_voided ? 'Voided / reversed' : 'Active'}</td>
                  <td>${transaction.is_reconciled ? `Yes${transaction.reconciliation_reference ? ` (${escapeHtml(transaction.reconciliation_reference)})` : ''}` : 'No'}</td>
                  <td class="amount">${escapeHtml(isMoneyIn(transaction.transaction_type) ? '+' : '-')}${escapeHtml(formatMoney(transaction.account?.currency || currency, transaction.amount))}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="7">No ledger entries match the selected statement filters.</td>
                </tr>
              `}
            </tbody>
          </table>

          <p class="muted" style="margin-top:14px;">This statement is generated from Cash & Bank ledger entries visible to the restaurant account. Voided entries remain visible for audit history.</p>

          <div class="actions">
            <button onclick="window.print()">Print Statement</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}

function getAccountFilterLabel(accounts, accountFilter) {
  if (accountFilter === 'all') return 'All accounts'

  const account = accounts.find((item) => item.id === accountFilter)
  return account?.account_name || 'Selected account'
}

function getSourceFilterLabel(filter) {
  if (filter === 'day_closing') return 'Day Closing'
  if (filter === 'manual') return 'Manual entries'
  if (filter === 'system') return 'Other system entries'
  if (filter === 'reversal') return 'Voided / reversed'
  return 'All sources'
}

function getMovementFilterLabel(filter) {
  if (filter === 'money_in') return 'Money in'
  if (filter === 'money_out') return 'Money out'
  if (filter === 'voided') return 'Voided only'
  return 'All movement'
}

function getDateFilterLabel(filter) {
  if (filter === 'today') return 'Today'
  if (filter === 'last7') return 'Last 7 days'
  if (filter === 'last30') return 'Last 30 days'
  return 'All dates'
}

function getReconciliationFilterLabel(filter) {
  if (filter === 'reconciled') return 'Reconciled only'
  if (filter === 'unreconciled') return 'Unreconciled only'
  if (filter === 'voided') return 'Voided only'
  return 'All reconciliation'
}

function buildReconciliationReference(transaction) {
  const datePart = String(transaction.transaction_date || getTodayInputDate()).replaceAll('-', '')
  return `RCN-${datePart}-${shortId(transaction.id)}`
}

function formatDateTime(value) {
  if (!value) return 'Just now'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Just now'
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getDailyFinanceUpdatedLabel(summary) {
  if (!summary?.updated_at && !summary?.created_at) {
    return 'Create summary after closing the day'
  }

  return `Updated ${formatDateTime(summary.updated_at || summary.created_at)}`
}

function getDailyFinanceSummaryStatus(summary) {
  const status = String(summary?.day_closing_status || 'open').toLowerCase()
  const pending = Number(summary?.pending_total || 0)
  const cashDifference = Number(summary?.cash_difference || 0)

  if (status === 'closed' && pending <= 0 && cashDifference === 0) {
    return 'Healthy closing: closed, balanced and no pending collection.'
  }

  if (pending > 0) {
    return 'Attention needed: pending collections still exist for this date.'
  }

  if (cashDifference !== 0) {
    return 'Attention needed: cash difference found in Day Closing.'
  }

  return 'Summary ready for management review.'
}


function buildDailyFinanceHistorySummary(items) {
  return items.reduce(
    (summary, item) => {
      summary.count += 1
      summary.totalSales += Number(item.total_sales || 0)
      summary.collectedTotal += Number(item.collected_total || 0)
      summary.pendingTotal += Number(item.pending_total || 0)
      summary.refundTotal += Number(item.refund_total || 0)
      summary.expenseTotal += Number(item.expense_total || 0)
      summary.netAfterExpenses += Number(item.net_after_expenses || 0)

      if (getDailyFinanceHealthTone(item) === 'warning') {
        summary.warningDays += 1
      }

      if (getDailyFinanceHealthTone(item) === 'healthy') {
        summary.healthyDays += 1
      }

      return summary
    },
    {
      count: 0,
      totalSales: 0,
      collectedTotal: 0,
      pendingTotal: 0,
      refundTotal: 0,
      expenseTotal: 0,
      netAfterExpenses: 0,
      healthyDays: 0,
      warningDays: 0,
    },
  )
}

function getDailyFinanceHealthTone(summary) {
  const pending = Number(summary?.pending_total || 0)
  const cashDifference = Math.abs(Number(summary?.cash_difference || 0))
  const netAfterExpenses = Number(summary?.net_after_expenses || 0)
  const status = String(summary?.day_closing_status || 'open').toLowerCase()

  if (pending > 0 || cashDifference > 0 || netAfterExpenses < 0 || status !== 'closed') {
    return 'warning'
  }

  return 'healthy'
}

function getDailyFinanceHealthLabel(summary) {
  const pending = Number(summary?.pending_total || 0)
  const cashDifference = Math.abs(Number(summary?.cash_difference || 0))
  const netAfterExpenses = Number(summary?.net_after_expenses || 0)
  const status = String(summary?.day_closing_status || 'open').toLowerCase()

  if (status !== 'closed') return 'Open or draft closing'
  if (pending > 0) return 'Pending collection exists'
  if (cashDifference > 0) return 'Cash difference found'
  if (netAfterExpenses < 0) return 'Negative net after expenses'
  return 'Healthy closed day'
}

function getFinanceHistoryRangeLabel(range) {
  if (range === 'last7') return 'Last 7 days'
  if (range === 'last90') return 'Last 90 days'
  return 'Last 30 days'
}

function getFinanceHistoryStartDate(range) {
  const date = new Date()
  const days = range === 'last7' ? 7 : range === 'last90' ? 90 : 30
  date.setDate(date.getDate() - days + 1)
  return date.toISOString().slice(0, 10)
}

function buildDailyFinanceHistoryReportHtml({ restaurant, summaries, range, totals, currency }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Daily Finance History</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, sans-serif;
            color: #111;
            background: #f5f5f5;
          }
          .report {
            max-width: 1060px;
            margin: 0 auto;
            padding: 24px;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 18px 48px rgba(0,0,0,0.12);
          }
          .head {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            padding-bottom: 16px;
            border-bottom: 3px solid #111;
          }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #555; line-height: 1.45; font-size: 12px; }
          .right { text-align: right; white-space: pre-line; }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-top: 18px;
          }
          .metric {
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 12px;
          }
          .metric span { display: block; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 8px; font-size: 17px; }
          table { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 9px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
          th { background: #f3f3f3; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
          td.amount { text-align: right; font-weight: 800; white-space: nowrap; }
          .healthy { color: #15803d; font-weight: 800; }
          .warning { color: #b45309; font-weight: 800; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 8px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; background: #fff; } .report { max-width: none; box-shadow: none; padding: 0; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Daily Finance History</h2>
              <p class="muted">Range: ${escapeHtml(getFinanceHistoryRangeLabel(range))} • Currency: ${escapeHtml(currency)}</p>
            </div>
            <div class="right muted">Spizy Menu
Printed: ${escapeHtml(formatDateTime(new Date().toISOString()))}
Summaries: ${summaries.length}</div>
          </div>

          <div class="grid">
            ${historyMetric('Summaries', totals.count)}
            ${historyMetric('Total sales', formatMoney(currency, totals.totalSales))}
            ${historyMetric('Collected', formatMoney(currency, totals.collectedTotal))}
            ${historyMetric('Pending', formatMoney(currency, totals.pendingTotal))}
            ${historyMetric('Refunds', formatMoney(currency, totals.refundTotal))}
            ${historyMetric('Expenses', formatMoney(currency, totals.expenseTotal))}
            ${historyMetric('Net after expenses', formatMoney(currency, totals.netAfterExpenses))}
            ${historyMetric('Warning days', totals.warningDays)}
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Health</th>
                <th style="text-align:right;">Sales</th>
                <th style="text-align:right;">Collected</th>
                <th style="text-align:right;">Pending</th>
                <th style="text-align:right;">Expenses</th>
                <th style="text-align:right;">Net</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.length ? summaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(formatSimpleDate(summary.summary_date))}</td>
                  <td>${escapeHtml(summary.day_closing_status || 'open')}</td>
                  <td class="${escapeHtml(getDailyFinanceHealthTone(summary))}">${escapeHtml(getDailyFinanceHealthLabel(summary))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.total_sales))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.collected_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.pending_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.expense_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.net_after_expenses))}</td>
                </tr>
              `).join('') : '<tr><td colspan="8">No daily finance summaries found for this range.</td></tr>'}
            </tbody>
          </table>

          <p class="muted" style="margin-top:14px;">This history report is generated from saved Spizy daily finance summaries. Create or refresh the daily summary for a date before using it for final accounting review.</p>

          <div class="actions">
            <button onclick="window.print()">Print History</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}

function historyMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
}


function getMonthlyCloseStatusLabel(record) {
  if (!record) return 'Not reviewed'
  if (record.status === 'closed') return 'Closed'
  if (record.status === 'reviewed') return 'Reviewed'
  if (record.status === 'reopened') return 'Reopened'
  return 'In review'
}

function getMonthlyCloseMetaLabel(record) {
  if (!record) return 'Review the month after checking daily summaries and reconciliation.'
  if (record.status === 'closed' && record.closed_at) return `Closed ${formatDateTime(record.closed_at)}`
  if (record.status === 'reviewed' && record.reviewed_at) return `Reviewed ${formatDateTime(record.reviewed_at)}`
  if (record.status === 'reopened' && record.reopened_at) return `Reopened ${formatDateTime(record.reopened_at)}`
  return 'Monthly review snapshot saved.'
}

function buildMonthlyFinanceSummary(items) {
  return items.reduce(
    (summary, item) => {
      summary.count += 1
      summary.totalSales += Number(item.total_sales || 0)
      summary.collectedTotal += Number(item.collected_total || 0)
      summary.pendingTotal += Number(item.pending_total || 0)
      summary.codPending += Number(item.cod_pending || 0)
      summary.onlinePending += Number(item.online_pending || 0)
      summary.refundTotal += Number(item.refund_total || 0)
      summary.expenseTotal += Number(item.expense_total || 0)
      summary.netCollection += Number(item.net_collection || 0)
      summary.netAfterExpenses += Number(item.net_after_expenses || 0)
      summary.cashDifferenceTotal += Math.abs(Number(item.cash_difference || 0))

      if (getDailyFinanceHealthTone(item) === 'warning') summary.warningDays += 1
      if (getDailyFinanceHealthTone(item) === 'healthy') summary.healthyDays += 1

      if (!summary.bestDay || Number(item.net_after_expenses || 0) > Number(summary.bestDay.net_after_expenses || 0)) {
        summary.bestDay = item
      }

      if (!summary.weakDay || Number(item.net_after_expenses || 0) < Number(summary.weakDay.net_after_expenses || 0)) {
        summary.weakDay = item
      }

      return summary
    },
    {
      count: 0,
      totalSales: 0,
      collectedTotal: 0,
      pendingTotal: 0,
      codPending: 0,
      onlinePending: 0,
      refundTotal: 0,
      expenseTotal: 0,
      netCollection: 0,
      netAfterExpenses: 0,
      cashDifferenceTotal: 0,
      healthyDays: 0,
      warningDays: 0,
      bestDay: null,
      weakDay: null,
    },
  )
}

function getMonthlyFinanceHealthLabel(summary) {
  if (!summary?.count) return 'No daily summaries for this month yet'
  if (summary.pendingTotal > 0) return 'Monthly warning: pending collections exist'
  if (summary.cashDifferenceTotal > 0) return 'Monthly warning: cash differences need review'
  if (summary.netAfterExpenses < 0) return 'Monthly warning: expenses are higher than collections'
  if (summary.warningDays > 0) return 'Monthly review needed: some days have warnings'
  return 'Healthy month based on saved daily summaries'
}

function getCurrentMonthInput() {
  return new Date().toISOString().slice(0, 7)
}

function getMonthDateRange(monthValue) {
  const safeMonth = monthValue || getCurrentMonthInput()
  const [yearText, monthText] = safeMonth.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText || 1) - 1
  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

function formatMonthLabel(monthValue) {
  const { startDate } = getMonthDateRange(monthValue)

  try {
    return new Intl.DateTimeFormat('en-AE', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${startDate}T00:00:00`))
  } catch {
    return monthValue || getCurrentMonthInput()
  }
}



function formatCloseStatus(status) {
  if (status === 'closed') return 'Closed'
  if (status === 'reviewed') return 'Reviewed'
  if (status === 'reopened') return 'Reopened'
  return 'Open / not reviewed'
}

function getCurrentYearInput() {
  return String(new Date().getFullYear())
}

function getYearDateRange(yearValue) {
  const year = Number(yearValue || getCurrentYearInput()) || new Date().getFullYear()
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  }
}

function buildYearlyFinanceSummary(items) {
  return buildMonthlyFinanceSummary(items)
}

function buildYearlyMonthRows(items) {
  const monthMap = new Map()

  items.forEach((item) => {
    const dateValue = String(item.summary_date || '')
    const monthKey = dateValue.slice(0, 7) || 'unknown'
    const existing = monthMap.get(monthKey) || []
    existing.push(item)
    monthMap.set(monthKey, existing)
  })

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, rows]) => ({
      ...buildMonthlyFinanceSummary(rows),
      monthKey,
      monthLabel: monthKey === 'unknown' ? 'Unknown month' : formatMonthLabel(monthKey),
    }))
}

function getYearlyFinanceHealthLabel(summary) {
  if (!summary?.count) return 'No yearly finance summaries yet'
  if (summary.netAfterExpenses < 0) return 'Yearly warning: annual expenses are higher than collections'
  if (summary.pendingTotal > 0) return 'Yearly review needed: pending collections exist'
  if (summary.cashDifferenceTotal > 0) return 'Yearly review needed: cash differences exist'
  if (summary.warningDays > 0) return 'Yearly review needed: some days have warnings'
  return 'Healthy year based on saved daily finance summaries'
}

function getYearlyMonthHealthTone(row) {
  if (!row?.count) return 'empty'
  if (row.netAfterExpenses < 0 || row.pendingTotal > 0 || row.cashDifferenceTotal > 0 || row.warningDays > 0) return 'warning'
  return 'healthy'
}

function getYearlyMonthHealthLabel(row) {
  if (!row?.count) return 'No data'
  if (row.netAfterExpenses < 0) return 'Loss month'
  if (row.pendingTotal > 0) return 'Pending collections'
  if (row.cashDifferenceTotal > 0) return 'Cash difference'
  if (row.warningDays > 0) return 'Needs review'
  return 'Healthy month'
}

function buildYearlyFinanceReportHtml({ restaurant, summaries, monthRows, year, totals, currency, yearCloseRecord }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Yearly Finance - ${escapeHtml(year)}</title>
        <style>
          body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #111; background: #fff; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; }
          h2 { margin-top: 4px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #666; font-size: 12px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #111; padding-bottom: 16px; }
          .right { text-align: right; white-space: pre-line; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
          .metric { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
          .metric span { display: block; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 6px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f4f4f4; text-transform: uppercase; font-size: 11px; }
          .amount { text-align: right; white-space: nowrap; }
          .healthy { color: #047857; font-weight: 800; }
          .warning { color: #b45309; font-weight: 800; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 10px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { .actions { display: none; } body { padding: 18px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
            <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
            <h2>Yearly Finance Report</h2>
            <p class="muted">Year: ${escapeHtml(year)} • Currency: ${escapeHtml(currency)}</p>
          </div>
          <div class="right muted">Spizy Menu
Printed: ${escapeHtml(formatDateTime(new Date().toISOString()))}
Daily summaries: ${summaries.length}
Year close: ${escapeHtml(formatCloseStatus(yearCloseRecord?.status || 'open'))}</div>
        </div>

        <div class="grid">
          ${historyMetric('Days loaded', totals.count)}
          ${historyMetric('Months loaded', monthRows.length)}
          ${historyMetric('Year close status', formatCloseStatus(yearCloseRecord?.status || 'open'))}
          ${historyMetric('Last close action', yearCloseRecord?.updated_at ? formatDateTime(yearCloseRecord.updated_at) : 'Not reviewed')}
          ${historyMetric('Total sales', formatMoney(currency, totals.totalSales))}
          ${historyMetric('Collected', formatMoney(currency, totals.collectedTotal))}
          ${historyMetric('Pending', formatMoney(currency, totals.pendingTotal))}
          ${historyMetric('Refunds', formatMoney(currency, totals.refundTotal))}
          ${historyMetric('Expenses', formatMoney(currency, totals.expenseTotal))}
          ${historyMetric('Net after expenses', formatMoney(currency, totals.netAfterExpenses))}
        </div>

        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Days</th>
              <th>Health</th>
              <th style="text-align:right;">Sales</th>
              <th style="text-align:right;">Collected</th>
              <th style="text-align:right;">Pending</th>
              <th style="text-align:right;">Expenses</th>
              <th style="text-align:right;">Net</th>
            </tr>
          </thead>
          <tbody>
            ${monthRows.length ? monthRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.monthLabel)}</td>
                <td>${escapeHtml(row.count)}</td>
                <td class="${escapeHtml(getYearlyMonthHealthTone(row))}">${escapeHtml(getYearlyMonthHealthLabel(row))}</td>
                <td class="amount">${escapeHtml(formatMoney(currency, row.totalSales))}</td>
                <td class="amount">${escapeHtml(formatMoney(currency, row.collectedTotal))}</td>
                <td class="amount">${escapeHtml(formatMoney(currency, row.pendingTotal))}</td>
                <td class="amount">${escapeHtml(formatMoney(currency, row.expenseTotal))}</td>
                <td class="amount">${escapeHtml(formatMoney(currency, row.netAfterExpenses))}</td>
              </tr>
            `).join('') : '<tr><td colspan="8">No yearly finance summaries found.</td></tr>'}
          </tbody>
        </table>

        <p class="muted" style="margin-top:14px;">This annual report is generated from saved Spizy daily finance summaries. Missing daily summaries will reduce report accuracy.</p>

        <div class="actions">
          <button onclick="window.print()">Print Year Report</button>
          <button onclick="window.close()">Close</button>
        </div>
      </body>
    </html>
  `
}

function buildMonthlyFinanceReportHtml({ restaurant, summaries, month, totals, currency, monthCloseRecord }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Monthly Finance Summary</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111; background: #f5f5f5; }
          .report { max-width: 1120px; margin: 0 auto; padding: 24px; border-radius: 18px; background: #fff; box-shadow: 0 18px 48px rgba(0,0,0,0.12); }
          .head { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 16px; border-bottom: 3px solid #111; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #555; line-height: 1.45; font-size: 12px; }
          .right { text-align: right; white-space: pre-line; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
          .metric { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
          .metric span { display: block; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 8px; font-size: 17px; }
          .health { margin-top: 16px; padding: 12px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; font-weight: 800; }
          table { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 9px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
          th { background: #f3f3f3; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
          td.amount { text-align: right; font-weight: 800; white-space: nowrap; }
          .healthy { color: #15803d; font-weight: 800; }
          .warning { color: #b45309; font-weight: 800; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 8px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; background: #fff; } .report { max-width: none; box-shadow: none; padding: 0; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Monthly Finance Summary</h2>
              <p class="muted">Month: ${escapeHtml(formatMonthLabel(month))} • Currency: ${escapeHtml(currency)} • Month close: ${escapeHtml(getMonthlyCloseStatusLabel(monthCloseRecord))}</p>
            </div>
            <div class="right muted">Spizy Menu
Printed: ${escapeHtml(formatDateTime(new Date().toISOString()))}
Days loaded: ${summaries.length}</div>
          </div>

          <div class="grid">
            ${historyMetric('Days loaded', totals.count)}
            ${historyMetric('Total sales', formatMoney(currency, totals.totalSales))}
            ${historyMetric('Collected', formatMoney(currency, totals.collectedTotal))}
            ${historyMetric('Pending', formatMoney(currency, totals.pendingTotal))}
            ${historyMetric('COD pending', formatMoney(currency, totals.codPending))}
            ${historyMetric('Online pending', formatMoney(currency, totals.onlinePending))}
            ${historyMetric('Refunds', formatMoney(currency, totals.refundTotal))}
            ${historyMetric('Expenses', formatMoney(currency, totals.expenseTotal))}
            ${historyMetric('Net collection', formatMoney(currency, totals.netCollection))}
            ${historyMetric('Net after expenses', formatMoney(currency, totals.netAfterExpenses))}
            ${historyMetric('Cash differences', formatMoney(currency, totals.cashDifferenceTotal))}
            ${historyMetric('Warning days', totals.warningDays)}
          </div>

          <div class="health">${escapeHtml(getMonthlyFinanceHealthLabel(totals))}<br/><span class="muted">${escapeHtml(getMonthlyCloseMetaLabel(monthCloseRecord))}</span></div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Health</th>
                <th style="text-align:right;">Sales</th>
                <th style="text-align:right;">Collected</th>
                <th style="text-align:right;">Pending</th>
                <th style="text-align:right;">Refunds</th>
                <th style="text-align:right;">Expenses</th>
                <th style="text-align:right;">Net</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.length ? summaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(formatSimpleDate(summary.summary_date))}</td>
                  <td>${escapeHtml(summary.day_closing_status || 'open')}</td>
                  <td class="${escapeHtml(getDailyFinanceHealthTone(summary))}">${escapeHtml(getDailyFinanceHealthLabel(summary))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.total_sales))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.collected_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.pending_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.refund_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.expense_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.net_after_expenses))}</td>
                </tr>
              `).join('') : '<tr><td colspan="9">No daily finance summaries found for this month.</td></tr>'}
            </tbody>
          </table>

          <p class="muted" style="margin-top:14px;">This monthly report is generated from saved Spizy daily finance summaries. Create or refresh missing daily summaries before final accounting review.</p>

          <div class="actions">
            <button onclick="window.print()">Print Month</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}



function buildCashFlowSummary({ monthlySummary, transactions, accounts, month }) {
  const { startDate, endDate } = getMonthDateRange(month)
  const activeTransactions = (transactions || []).filter((transaction) => {
    const date = String(transaction.transaction_date || '')
    return date >= startDate && date <= endDate && !transaction.is_voided
  })

  const moneyInTypes = ['income', 'adjustment_in']
  const moneyOutTypes = ['expense', 'adjustment_out']
  const transferInTypes = ['transfer_in']
  const transferOutTypes = ['transfer_out']

  const moneyIn = activeTransactions
    .filter((transaction) => moneyInTypes.includes(transaction.transaction_type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)
  const moneyOut = activeTransactions
    .filter((transaction) => moneyOutTypes.includes(transaction.transaction_type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)
  const transferIn = activeTransactions
    .filter((transaction) => transferInTypes.includes(transaction.transaction_type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)
  const transferOut = activeTransactions
    .filter((transaction) => transferOutTypes.includes(transaction.transaction_type))
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)

  const netCashFlow = moneyIn - moneyOut
  const currentClosingBalance = (accounts || [])
    .filter((account) => account.is_active !== false)
    .reduce((total, account) => total + Number(account.current_balance || 0), 0)
  const openingBalanceEstimate = currentClosingBalance - netCashFlow
  const summaryCollected = Number(monthlySummary?.collectedTotal || 0)
  const summaryRefunds = Number(monthlySummary?.refundTotal || 0)
  const summaryExpenses = Number(monthlySummary?.expenseTotal || 0)
  const cashBasisResult = summaryCollected - summaryRefunds - summaryExpenses
  const pendingRisk = Number(monthlySummary?.pendingTotal || 0)

  return {
    daysLoaded: Number(monthlySummary?.count || 0),
    ledgerEntryCount: activeTransactions.length,
    ledgerRows: activeTransactions
      .slice()
      .sort((a, b) => String(b.transaction_date || '').localeCompare(String(a.transaction_date || ''))),
    transferCount: activeTransactions.filter((transaction) => ['transfer_in', 'transfer_out'].includes(transaction.transaction_type)).length,
    moneyIn,
    moneyOut,
    transferIn,
    transferOut,
    netCashFlow,
    currentClosingBalance,
    openingBalanceEstimate,
    summaryCollected,
    summaryRefunds,
    summaryExpenses,
    cashBasisResult,
    pendingRisk,
  }
}

function getCashFlowTone(summary) {
  if (!summary?.daysLoaded && !summary?.ledgerEntryCount) return 'empty'
  if (summary.netCashFlow < 0 || summary.cashBasisResult < 0) return 'warning'
  if (summary.pendingRisk > 0) return 'review'
  return 'healthy'
}

function getCashFlowHealthLabel(summary) {
  if (!summary?.daysLoaded && !summary?.ledgerEntryCount) return 'No cash flow data yet for this month'
  if (summary.netCashFlow < 0) return 'Cash flow warning: money out is higher than money in for this month'
  if (summary.cashBasisResult < 0) return 'Cash basis warning: collections are not enough after refunds and expenses'
  if (summary.pendingRisk > 0) return 'Collection review: pending COD or online payments can affect real cash flow'
  return 'Healthy cash flow foundation based on saved summaries and ledger movement'
}

function buildCashFlowReportHtml({ restaurant, month, cashFlow, currency }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Cash Flow</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111; background: #f5f5f5; }
          .report { max-width: 1120px; margin: 0 auto; padding: 24px; border-radius: 18px; background: #fff; box-shadow: 0 18px 48px rgba(0,0,0,0.12); }
          .head { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 16px; border-bottom: 3px solid #111; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #555; line-height: 1.45; font-size: 12px; }
          .right { text-align: right; white-space: pre-line; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
          .metric { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
          .metric span { display: block; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 8px; font-size: 17px; }
          .statement { margin-top: 18px; border: 1px solid #ddd; border-radius: 14px; overflow: hidden; }
          .row { display: flex; justify-content: space-between; gap: 20px; padding: 12px 14px; border-bottom: 1px solid #eee; }
          .row:last-child { border-bottom: 0; }
          .row.total { background: #111; color: #fff; font-weight: 800; }
          .row.warning { background: #fff7ed; color: #9a3412; font-weight: 800; }
          table { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 9px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
          th { background: #f3f3f3; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
          td.amount { text-align: right; font-weight: 800; white-space: nowrap; }
          .healthy { color: #15803d; font-weight: 800; }
          .warning { color: #b45309; font-weight: 800; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 8px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; background: #fff; } .report { max-width: none; box-shadow: none; padding: 0; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Cash Flow Statement</h2>
            </div>
            <div class="right muted">
              Month: ${escapeHtml(formatMonthLabel(month))}\nPrinted: ${escapeHtml(formatDateTime(new Date().toISOString()))}\nGenerated by Spizy Menu
            </div>
          </div>

          <div class="grid">
            <div class="metric"><span>Opening estimate</span><strong>${escapeHtml(formatMoney(currency, cashFlow.openingBalanceEstimate))}</strong></div>
            <div class="metric"><span>Money in</span><strong>${escapeHtml(formatMoney(currency, cashFlow.moneyIn))}</strong></div>
            <div class="metric"><span>Money out</span><strong>${escapeHtml(formatMoney(currency, cashFlow.moneyOut))}</strong></div>
            <div class="metric"><span>Net cash flow</span><strong>${escapeHtml(formatMoney(currency, cashFlow.netCashFlow))}</strong></div>
            <div class="metric"><span>Closing balance</span><strong>${escapeHtml(formatMoney(currency, cashFlow.currentClosingBalance))}</strong></div>
            <div class="metric"><span>Cash basis result</span><strong>${escapeHtml(formatMoney(currency, cashFlow.cashBasisResult))}</strong></div>
            <div class="metric"><span>Pending risk</span><strong>${escapeHtml(formatMoney(currency, cashFlow.pendingRisk))}</strong></div>
            <div class="metric"><span>Ledger entries</span><strong>${escapeHtml(cashFlow.ledgerEntryCount)}</strong></div>
          </div>

          <div class="statement">
            <div class="row"><span>Collected from finance summaries</span><strong>${escapeHtml(formatMoney(currency, cashFlow.summaryCollected))}</strong></div>
            <div class="row"><span>Refunds / adjustments</span><strong>- ${escapeHtml(formatMoney(currency, cashFlow.summaryRefunds))}</strong></div>
            <div class="row"><span>Expenses</span><strong>- ${escapeHtml(formatMoney(currency, cashFlow.summaryExpenses))}</strong></div>
            <div class="row total"><span>Cash basis result</span><strong>${escapeHtml(formatMoney(currency, cashFlow.cashBasisResult))}</strong></div>
            <div class="row"><span>Ledger money in</span><strong>${escapeHtml(formatMoney(currency, cashFlow.moneyIn))}</strong></div>
            <div class="row"><span>Ledger money out</span><strong>- ${escapeHtml(formatMoney(currency, cashFlow.moneyOut))}</strong></div>
            <div class="row total"><span>Net ledger cash flow</span><strong>${escapeHtml(formatMoney(currency, cashFlow.netCashFlow))}</strong></div>
            <div class="row ${getCashFlowTone(cashFlow) === 'warning' ? 'warning' : ''}"><span>Health</span><strong>${escapeHtml(getCashFlowHealthLabel(cashFlow))}</strong></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Type</th>
                <th>Title</th>
                <th>Source</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${cashFlow.ledgerRows.length ? cashFlow.ledgerRows.map((transaction) => `
                <tr>
                  <td>${escapeHtml(formatSimpleDate(transaction.transaction_date))}</td>
                  <td>${escapeHtml(transaction.account?.account_name || 'Account')}</td>
                  <td>${escapeHtml(formatTransactionType(transaction.transaction_type))}</td>
                  <td>${escapeHtml(transaction.title || '')}</td>
                  <td>${escapeHtml(formatLedgerSource(transaction.source_type, transaction.metadata))}</td>
                  <td class="amount">${escapeHtml(formatMoney(transaction.account?.currency || currency, transaction.amount))}</td>
                  <td>${escapeHtml(transaction.is_voided ? 'Voided' : 'Active')}</td>
                </tr>
              `).join('') : '<tr><td colspan="7">No Cash & Bank ledger movements found for this month.</td></tr>'}
            </tbody>
          </table>

          <p class="muted" style="margin-top:14px;">This cash flow report combines saved daily finance summaries with Cash & Bank ledger movement. Reconcile bank statements and gateway settlements before final accounting.</p>

          <div class="actions">
            <button onclick="window.print()">Print Cash Flow</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}


function buildBusinessHealthSummary({
  accountSummary,
  monthlySummary,
  profitLoss,
  cashFlow,
  reconciliation,
  historySummary,
}) {
  const daysLoaded = Number(monthlySummary?.count || 0)
  const totalSales = Number(monthlySummary?.totalSales || 0)
  const collectedTotal = Number(monthlySummary?.collectedTotal || 0)
  const pendingRisk = Number(monthlySummary?.pendingTotal || 0)
  const refundTotal = Number(monthlySummary?.refundTotal || 0)
  const expenseTotal = Number(monthlySummary?.expenseTotal || 0)
  const warningDays = Number(monthlySummary?.warningDays || historySummary?.warningDays || 0)
  const healthyDays = Number(monthlySummary?.healthyDays || historySummary?.healthyDays || 0)
  const estimatedProfit = Number(profitLoss?.estimatedProfit || 0)
  const profitMargin = Number(profitLoss?.profitMargin || 0)
  const cashBasisResult = Number(profitLoss?.cashBasisResult || 0)
  const netCashFlow = Number(cashFlow?.netCashFlow || 0)
  const currentBalance = Number(accountSummary?.totalBalance || cashFlow?.currentClosingBalance || 0)
  const unreconciledAmount = Number(reconciliation?.unreconciledAmount || 0)
  const unreconciledCount = Number(reconciliation?.unreconciledCount || 0)
  const pendingRiskPercent = totalSales > 0 ? (pendingRisk / totalSales) * 100 : 0
  const expenseRatio = totalSales > 0 ? (expenseTotal / totalSales) * 100 : 0
  const refundRatio = totalSales > 0 ? (refundTotal / totalSales) * 100 : 0

  let score = daysLoaded > 0 ? 100 : 55

  if (estimatedProfit < 0) score -= 24
  if (cashBasisResult < 0) score -= 16
  if (netCashFlow < 0) score -= 14
  if (pendingRiskPercent >= 25) score -= 18
  else if (pendingRiskPercent >= 10) score -= 10
  else if (pendingRisk > 0) score -= 5
  if (expenseRatio >= 70) score -= 14
  else if (expenseRatio >= 45) score -= 8
  if (refundRatio >= 10) score -= 10
  else if (refundRatio >= 3) score -= 5
  if (warningDays > 0) score -= Math.min(14, warningDays * 3)
  if (unreconciledCount >= 20) score -= 12
  else if (unreconciledCount > 0) score -= 6
  if (currentBalance < 0) score -= 15

  score = Math.max(0, Math.min(100, Math.round(score)))

  const actions = []

  if (daysLoaded === 0) {
    actions.push({
      title: 'Create daily summaries',
      detail: 'No saved daily finance summaries are loaded for this month. Create Daily Finance Summary records before final review.',
      badge: 'Setup',
      tone: 'warning',
    })
  }

  if (pendingRisk > 0) {
    actions.push({
      title: 'Follow pending collections',
      detail: `${formatMoney('', pendingRisk).trim()} is still pending from COD / online payments. Collect or reconcile before month closing.`,
      badge: 'Collections',
      tone: pendingRiskPercent >= 10 ? 'warning' : 'review',
    })
  }

  if (estimatedProfit < 0) {
    actions.push({
      title: 'Profit warning',
      detail: 'Estimated Profit & Loss is negative. Review expenses, refunds, pricing and weak days.',
      badge: 'P&L',
      tone: 'warning',
    })
  }

  if (netCashFlow < 0) {
    actions.push({
      title: 'Cash flow pressure',
      detail: 'Money out is higher than money in for the selected month. Check supplier payments, refunds and withdrawals.',
      badge: 'Cash Flow',
      tone: 'warning',
    })
  }

  if (unreconciledCount > 0) {
    actions.push({
      title: 'Reconcile ledger entries',
      detail: `${unreconciledCount} Cash & Bank ledger entries still need statement checking.`,
      badge: 'Audit',
      tone: 'review',
    })
  }

  if (actions.length === 0) {
    actions.push({
      title: 'Healthy finance position',
      detail: 'Profit, cash flow, pending collections and reconciliation look healthy for this management view.',
      badge: 'Healthy',
      tone: 'healthy',
    })
  }

  return {
    daysLoaded,
    totalSales,
    collectedTotal,
    pendingRisk,
    refundTotal,
    expenseTotal,
    warningDays,
    healthyDays,
    estimatedProfit,
    profitMargin,
    cashBasisResult,
    netCashFlow,
    currentBalance,
    unreconciledAmount,
    unreconciledCount,
    pendingRiskPercent,
    expenseRatio,
    refundRatio,
    score,
    actions: actions.slice(0, 5),
  }
}

function getBusinessHealthTone(summary) {
  if (!summary?.daysLoaded) return 'setup'
  if (summary.score < 55) return 'danger'
  if (summary.score < 78) return 'review'
  return 'healthy'
}

function getBusinessHealthLabel(summary) {
  if (!summary?.daysLoaded) return 'Setup needed'
  if (summary.score < 55) return 'Needs urgent review'
  if (summary.score < 78) return 'Review needed'
  return 'Healthy'
}

function buildBusinessHealthReportHtml({ restaurant, month, health, currency }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Business Health</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111; background: #f5f5f5; }
          .report { max-width: 1120px; margin: 0 auto; padding: 24px; border-radius: 18px; background: #fff; box-shadow: 0 18px 48px rgba(0,0,0,0.12); }
          .head { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 16px; border-bottom: 3px solid #111; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #555; line-height: 1.45; font-size: 12px; }
          .score { text-align: right; }
          .score strong { display: block; font-size: 44px; letter-spacing: -0.08em; }
          .score span { display: inline-block; margin-top: 4px; padding: 6px 10px; border-radius: 999px; color: #fff; background: #111; font-size: 12px; font-weight: 800; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
          .metric { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
          .metric span { display: block; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 8px; font-size: 18px; }
          .insights { margin-top: 18px; display: grid; gap: 10px; }
          .insight { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
          .insight strong { display: block; margin-bottom: 5px; }
          .insight small { display: inline-block; margin-top: 8px; padding: 4px 8px; border-radius: 999px; color: #fff; background: #111; font-weight: 800; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 8px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; background: #fff; } .report { max-width: none; box-shadow: none; padding: 0; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Business Health Dashboard</h2>
              <p class="muted">Month: ${escapeHtml(formatMonthLabel(month))} • Currency: ${escapeHtml(currency)} • Printed: ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
            </div>
            <div class="score">
              <strong>${escapeHtml(health.score)}</strong>
              <span>${escapeHtml(getBusinessHealthLabel(health))}</span>
            </div>
          </div>

          <div class="grid">
            ${historyMetric('Estimated profit', formatMoney(currency, health.estimatedProfit))}
            ${historyMetric('Profit margin', `${health.profitMargin.toFixed(1)}%`)}
            ${historyMetric('Net cash flow', formatMoney(currency, health.netCashFlow))}
            ${historyMetric('Closing balance', formatMoney(currency, health.currentBalance))}
            ${historyMetric('Pending risk', formatMoney(currency, health.pendingRisk))}
            ${historyMetric('Unreconciled', `${health.unreconciledCount} / ${formatMoney(currency, health.unreconciledAmount)}`)}
            ${historyMetric('Days loaded', String(health.daysLoaded))}
            ${historyMetric('Warning days', String(health.warningDays))}
            ${historyMetric('Refunds', formatMoney(currency, health.refundTotal))}
          </div>

          <div class="insights">
            ${health.actions.map((item) => `
              <div class="insight">
                <strong>${escapeHtml(item.title)}</strong>
                <p class="muted">${escapeHtml(item.detail)}</p>
                <small>${escapeHtml(item.badge)}</small>
              </div>
            `).join('')}
          </div>

          <p class="muted" style="margin-top:14px;">This is a management dashboard generated from daily finance summaries, Profit & Loss, Cash Flow, and Cash & Bank reconciliation data. Confirm statements and accounting categories before final statutory reporting.</p>

          <div class="actions">
            <button onclick="window.print()">Print Business Health</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}

function buildProfitLossSummary(monthlySummary) {
  const grossSales = Number(monthlySummary?.totalSales || 0)
  const refunds = Number(monthlySummary?.refundTotal || 0)
  const netSales = grossSales - refunds
  const operatingExpenses = Number(monthlySummary?.expenseTotal || 0)
  const estimatedProfit = netSales - operatingExpenses
  const cashCollected = Number(monthlySummary?.collectedTotal || 0)
  const pendingCollections = Number(monthlySummary?.pendingTotal || 0)
  const cashBasisResult = cashCollected - refunds - operatingExpenses
  const profitMargin = netSales > 0 ? (estimatedProfit / netSales) * 100 : 0

  return {
    daysLoaded: Number(monthlySummary?.count || 0),
    grossSales,
    refunds,
    netSales,
    operatingExpenses,
    estimatedProfit,
    cashCollected,
    pendingCollections,
    cashBasisResult,
    profitMargin,
    healthyDays: Number(monthlySummary?.healthyDays || 0),
    warningDays: Number(monthlySummary?.warningDays || 0),
    bestDay: monthlySummary?.bestDay || null,
    weakDay: monthlySummary?.weakDay || null,
  }
}

function getProfitLossTone(summary) {
  if (!summary?.daysLoaded) return 'empty'
  if (summary.estimatedProfit < 0 || summary.cashBasisResult < 0) return 'warning'
  if (summary.pendingCollections > 0 || summary.warningDays > 0) return 'review'
  return 'healthy'
}

function getProfitLossHealthLabel(summary) {
  if (!summary?.daysLoaded) return 'No P&L data yet for this month'
  if (summary.estimatedProfit < 0) return 'Loss warning: expenses and refunds are higher than net sales'
  if (summary.cashBasisResult < 0) return 'Cash warning: collected cash is not enough after refunds and expenses'
  if (summary.pendingCollections > 0) return 'Collection review: pending collections can affect real cash profit'
  if (summary.warningDays > 0) return 'Review needed: some daily summaries contain warnings'
  return 'Healthy P&L foundation based on saved daily summaries'
}

function buildProfitLossReportHtml({ restaurant, summaries, month, profitLoss, currency }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Profit & Loss</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111; background: #f5f5f5; }
          .report { max-width: 1120px; margin: 0 auto; padding: 24px; border-radius: 18px; background: #fff; box-shadow: 0 18px 48px rgba(0,0,0,0.12); }
          .head { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 16px; border-bottom: 3px solid #111; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #555; line-height: 1.45; font-size: 12px; }
          .right { text-align: right; white-space: pre-line; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
          .metric { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
          .metric span { display: block; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 8px; font-size: 17px; }
          .statement { margin-top: 18px; border: 1px solid #ddd; border-radius: 14px; overflow: hidden; }
          .row { display: flex; justify-content: space-between; gap: 20px; padding: 12px 14px; border-bottom: 1px solid #eee; }
          .row:last-child { border-bottom: 0; }
          .row.total { background: #111; color: #fff; font-weight: 800; }
          .row.warning { background: #fff7ed; color: #9a3412; font-weight: 800; }
          table { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 9px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
          th { background: #f3f3f3; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
          td.amount { text-align: right; font-weight: 800; white-space: nowrap; }
          .healthy { color: #15803d; font-weight: 800; }
          .warning { color: #b45309; font-weight: 800; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 8px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; background: #fff; } .report { max-width: none; box-shadow: none; padding: 0; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Profit & Loss Foundation</h2>
              <p class="muted">Month: ${escapeHtml(formatMonthLabel(month))} • Currency: ${escapeHtml(currency)}</p>
            </div>
            <div class="right muted">Spizy Menu
Printed: ${escapeHtml(formatDateTime(new Date().toISOString()))}
Days loaded: ${profitLoss.daysLoaded}</div>
          </div>

          <div class="grid">
            ${historyMetric('Gross sales', formatMoney(currency, profitLoss.grossSales))}
            ${historyMetric('Refunds', formatMoney(currency, profitLoss.refunds))}
            ${historyMetric('Net sales', formatMoney(currency, profitLoss.netSales))}
            ${historyMetric('Expenses', formatMoney(currency, profitLoss.operatingExpenses))}
            ${historyMetric('Estimated P&L', formatMoney(currency, profitLoss.estimatedProfit))}
            ${historyMetric('Margin', `${profitLoss.profitMargin.toFixed(1)}%`)}
            ${historyMetric('Pending collections', formatMoney(currency, profitLoss.pendingCollections))}
            ${historyMetric('Cash basis result', formatMoney(currency, profitLoss.cashBasisResult))}
          </div>

          <div class="statement">
            <div class="row"><span>Gross sales</span><strong>${escapeHtml(formatMoney(currency, profitLoss.grossSales))}</strong></div>
            <div class="row warning"><span>Less: refunds / adjustments</span><strong>- ${escapeHtml(formatMoney(currency, profitLoss.refunds))}</strong></div>
            <div class="row"><span>Net sales</span><strong>${escapeHtml(formatMoney(currency, profitLoss.netSales))}</strong></div>
            <div class="row warning"><span>Less: operating expenses</span><strong>- ${escapeHtml(formatMoney(currency, profitLoss.operatingExpenses))}</strong></div>
            <div class="row total"><span>Estimated profit / loss</span><strong>${escapeHtml(formatMoney(currency, profitLoss.estimatedProfit))}</strong></div>
          </div>

          <div class="statement">
            <div class="row"><span>Cash collected</span><strong>${escapeHtml(formatMoney(currency, profitLoss.cashCollected))}</strong></div>
            <div class="row warning"><span>Pending collections</span><strong>${escapeHtml(formatMoney(currency, profitLoss.pendingCollections))}</strong></div>
            <div class="row total"><span>Cash basis result</span><strong>${escapeHtml(formatMoney(currency, profitLoss.cashBasisResult))}</strong></div>
          </div>

          <p class="muted" style="margin-top:14px;"><strong>${escapeHtml(getProfitLossHealthLabel(profitLoss))}</strong></p>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Health</th>
                <th style="text-align:right;">Sales</th>
                <th style="text-align:right;">Refunds</th>
                <th style="text-align:right;">Expenses</th>
                <th style="text-align:right;">Pending</th>
                <th style="text-align:right;">Net</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.length ? summaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(formatSimpleDate(summary.summary_date))}</td>
                  <td class="${escapeHtml(getDailyFinanceHealthTone(summary))}">${escapeHtml(getDailyFinanceHealthLabel(summary))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.total_sales))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.refund_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.expense_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.pending_total))}</td>
                  <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.net_after_expenses))}</td>
                </tr>
              `).join('') : '<tr><td colspan="7">No daily finance summaries found for this month.</td></tr>'}
            </tbody>
          </table>

          <p class="muted" style="margin-top:14px;">This is a management P&L foundation generated from saved daily finance summaries. Add inventory COGS, VAT/tax, payroll, supplier bills and accounting categories later for final statutory reports.</p>

          <div class="actions">
            <button onclick="window.print()">Print P&L</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}


function buildTaxVatSummary({ monthlySummary, taxRate }) {
  const rate = Math.max(Number(taxRate || 0), 0)
  const grossSales = Number(monthlySummary?.totalSales || 0)
  const refunds = Number(monthlySummary?.refundTotal || 0)
  const taxableSales = Math.max(grossSales - refunds, 0)
  const divisor = 100 + rate
  const outputTax = rate > 0 ? taxableSales * rate / divisor : 0
  const salesExcludingTax = Math.max(taxableSales - outputTax, 0)
  const pendingCollections = Number(monthlySummary?.pendingTotal || 0)

  return {
    rate,
    daysLoaded: Number(monthlySummary?.count || 0),
    grossSales,
    refunds,
    taxableSales,
    salesExcludingTax,
    outputTax,
    pendingCollections,
  }
}

function buildInputTaxSummary({ inputTaxRecords, outputTax }) {
  const activeRecords = Array.isArray(inputTaxRecords) ? inputTaxRecords : []
  const grossAmount = activeRecords.reduce((total, record) => total + Number(record.gross_amount || 0), 0)
  const netAmount = activeRecords.reduce((total, record) => total + Number(record.net_amount || 0), 0)
  const inputTax = activeRecords.reduce((total, record) => total + Number(record.input_tax_amount || 0), 0)
  const vatPayable = Number(outputTax || 0) - inputTax

  return {
    recordCount: activeRecords.length,
    grossAmount,
    netAmount,
    inputTax,
    vatPayable,
  }
}

function calculateTaxIncludedAmount(grossAmount, taxRate) {
  const gross = Number(grossAmount || 0)
  const rate = Math.max(Number(taxRate || 0), 0)

  if (gross <= 0 || rate <= 0) return 0

  return gross * rate / (100 + rate)
}

function formatInputTaxCategory(value) {
  return inputTaxCategories.find((category) => category.value === value)?.label || formatSnapshotKey(value || 'other')
}

function getTaxVatHealthLabel(summary, inputSummary = null) {
  if (!summary?.daysLoaded) return 'Create daily summaries to prepare tax view'
  if (summary.pendingCollections > 0) return 'Review pending collections before final tax filing'
  if (summary.outputTax <= 0) return 'No estimated output tax for this month'
  if (!inputSummary?.recordCount) return 'Output tax ready; add purchase input tax before final review'
  if (inputSummary.vatPayable <= 0) return 'Input tax offsets output tax in this management estimate'
  return 'VAT payable estimate ready for owner/accountant review'
}

function getTaxVatPeriodCloseStatusLabel(record) {
  if (!record?.status) return 'Not reviewed'
  if (record.status === 'reviewed') return 'Reviewed'
  if (record.status === 'closed') return 'Closed'
  if (record.status === 'reopened') return 'Reopened'
  return formatSnapshotKey(record.status)
}

function getTaxVatPeriodCloseTone(record) {
  if (record?.status === 'closed') return 'closed'
  if (record?.status === 'reviewed') return 'reviewed'
  if (record?.status === 'reopened') return 'reopened'
  return 'open'
}

function getTaxVatPeriodCloseTimeLabel(record) {
  if (!record?.status) return 'Review this month before accountant filing'
  if (record.status === 'closed' && record.closed_at) return `Closed ${formatDateTime(record.closed_at)}`
  if (record.status === 'reviewed' && record.reviewed_at) return `Reviewed ${formatDateTime(record.reviewed_at)}`
  if (record.status === 'reopened' && record.reopened_at) return `Reopened ${formatDateTime(record.reopened_at)}`
  return 'Snapshot saved'
}

function buildTaxVatReportHtml({ restaurant, month, currency, taxSummary, inputTaxSummary, inputTaxRecords = [], summaries, taxRate, taxVatCloseRecord = null }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Tax / VAT Report - ${escapeHtml(month)}</title>
        <style>
          body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #111; background: #fff; }
          .report { max-width: 980px; margin: 0 auto; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; letter-spacing: -0.04em; }
          h2 { margin-top: 4px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; }
          .muted { color: #555; font-size: 12px; line-height: 1.45; }
          .head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 18px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
          .card { border: 1px solid #ccc; border-radius: 14px; padding: 13px; display: grid; gap: 6px; }
          .card span { color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
          .card strong { font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border-bottom: 1px solid #ddd; padding: 9px; text-align: left; font-size: 12px; }
          th { background: #f3f3f3; text-transform: uppercase; letter-spacing: 0.06em; }
          .amount { text-align: right; white-space: nowrap; }
          .note { margin-top: 16px; border: 1px dashed #999; padding: 12px; border-radius: 12px; font-size: 12px; line-height: 1.5; }
          .actions { margin-top: 20px; display: flex; gap: 10px; }
          button { padding: 11px 16px; border: 0; border-radius: 10px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Tax / VAT Report Foundation</h2>
              <p class="muted">Month: ${escapeHtml(formatMonthLabel(month))} • Rate: ${escapeHtml(Number(taxRate || 0).toFixed(2))}% • Printed: ${escapeHtml(formatSimpleDate(new Date().toISOString()))}</p>
            </div>
            <p class="muted">Generated by Spizy Menu</p>
          </div>

          <div class="grid">
            ${taxPrintCard('Gross sales', formatMoney(currency, taxSummary.grossSales))}
            ${taxPrintCard('Refunds / adjustments', formatMoney(currency, taxSummary.refunds))}
            ${taxPrintCard('Taxable sales', formatMoney(currency, taxSummary.taxableSales))}
            ${taxPrintCard('Estimated output tax', formatMoney(currency, taxSummary.outputTax))}
            ${taxPrintCard('Estimated input tax', formatMoney(currency, inputTaxSummary?.inputTax || 0))}
            ${taxPrintCard('Estimated VAT payable', formatMoney(currency, inputTaxSummary?.vatPayable || 0))}
            ${taxPrintCard('Pending risk', formatMoney(currency, taxSummary.pendingCollections))}
            ${taxPrintCard('VAT close status', getTaxVatPeriodCloseStatusLabel(taxVatCloseRecord))}
          </div>

          <p class="note"><strong>${escapeHtml(getTaxVatHealthLabel(taxSummary, inputTaxSummary))}</strong><br/>VAT period close: ${escapeHtml(getTaxVatPeriodCloseStatusLabel(taxVatCloseRecord))}. This report assumes tax is included in sales amounts and estimates output tax from daily finance summaries. Purchase VAT/input tax records are management entries for accountant review. This is not a final statutory VAT return.</p>

          <table>
            <thead>
              <tr>
                <th>Purchase date</th>
                <th>Supplier</th>
                <th>Invoice</th>
                <th>Category</th>
                <th class="amount">Gross</th>
                <th class="amount">Net</th>
                <th class="amount">Input tax</th>
              </tr>
            </thead>
            <tbody>
              ${inputTaxRecords.length ? inputTaxRecords.map((record) => `
                <tr>
                  <td>${escapeHtml(formatSimpleDate(record.purchase_date))}</td>
                  <td>${escapeHtml(record.supplier_name || 'Purchase bill')}</td>
                  <td>${escapeHtml(record.invoice_number || '-')}</td>
                  <td>${escapeHtml(formatInputTaxCategory(record.category))}</td>
                  <td class="amount">${escapeHtml(formatMoney(record.currency || currency, record.gross_amount))}</td>
                  <td class="amount">${escapeHtml(formatMoney(record.currency || currency, record.net_amount))}</td>
                  <td class="amount">${escapeHtml(formatMoney(record.currency || currency, record.input_tax_amount))}</td>
                </tr>
              `).join('') : '<tr><td colspan="7">No input tax / purchase VAT records found for this month.</td></tr>'}
            </tbody>
          </table>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Health</th>
                <th class="amount">Gross sales</th>
                <th class="amount">Refunds</th>
                <th class="amount">Taxable sales</th>
                <th class="amount">Est. output tax</th>
                <th class="amount">Pending</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.length ? summaries.map((summary) => {
                const rowTax = buildTaxVatSummary({
                  monthlySummary: buildMonthlyFinanceSummary([summary]),
                  taxRate,
                })

                return `
                  <tr>
                    <td>${escapeHtml(formatSimpleDate(summary.summary_date))}</td>
                    <td>${escapeHtml(getDailyFinanceHealthLabel(summary))}</td>
                    <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.total_sales))}</td>
                    <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.refund_total))}</td>
                    <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, rowTax.taxableSales))}</td>
                    <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, rowTax.outputTax))}</td>
                    <td class="amount">${escapeHtml(formatMoney(summary.currency || currency, summary.pending_total))}</td>
                  </tr>
                `
              }).join('') : '<tr><td colspan="7">No daily finance summaries found for this month.</td></tr>'}
            </tbody>
          </table>

          <div class="actions">
            <button onclick="window.print()">Print Tax / VAT Report</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}

function taxPrintCard(label, value) {
  return `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
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

function formatLedgerSource(sourceType, metadata = {}) {
  if (metadata?.reversed_by_day_closing) return 'Reversed Day Closing posting'
  if (sourceType === 'day_closing_cash_bank_posting') return 'Posted from Day Closing'
  if (sourceType === 'day_closing') return 'Day Closing'
  if (sourceType === 'payment_reconciliation') return 'Payment Reconciliation'
  return sourceType ? String(sourceType).replaceAll('_', ' ') : 'Manual entry'
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
