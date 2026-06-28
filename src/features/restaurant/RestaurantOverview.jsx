    import { useCallback, useEffect, useMemo, useState } from 'react'
    import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Banknote,
    BellRing,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    CreditCard,
    ExternalLink,
    FileText,
    Landmark,
    ReceiptText,
    RefreshCw,
    RotateCcw,
    Settings,
    ShoppingCart,
    Store,
    WalletCards,
    } from 'lucide-react'
    import { supabase } from '../../lib/supabaseClient'
    import './RestaurantOverview.css'

    const emptyDashboardData = {
    orders: [],
    accounts: [],
    dayClosing: null,
    dailySummary: null,
    paymentSnapshot: null,
    }

    function RestaurantOverview({ profile, restaurant, onOpenSection }) {
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [loadErrors, setLoadErrors] = useState([])
    const [dashboardData, setDashboardData] = useState(emptyDashboardData)
    const [lastUpdated, setLastUpdated] = useState(null)

    const currency = restaurant?.currency || 'AED'
    const todayKey = useMemo(() => getTodayDateKey(), [])

    const publicMenuUrl = useMemo(() => {
        if (!restaurant?.slug) return ''

        const appUrl =
        typeof window !== 'undefined'
            ? window.location.origin.replace(/\/$/, '')
            : ''

        return appUrl ? `${appUrl}/menu/${encodeURIComponent(restaurant.slug)}` : ''
    }, [restaurant?.slug])

    const loadOwnerDashboard = useCallback(
        async ({ silent = false } = {}) => {
        if (!restaurant?.id) return

        if (silent) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        const { startIso, endIso } = getDateRangeIso(todayKey)

        const [
            ordersResult,
            accountsResult,
            dayClosingResult,
            dailySummaryResult,
            paymentSnapshotResult,
        ] = await Promise.all([
            supabase
            .from('restaurant_orders')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .gte('created_at', startIso)
            .lt('created_at', endIso)
            .order('created_at', { ascending: false })
            .limit(150),
            supabase
            .from('restaurant_finance_accounts')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true }),
            supabase
            .from('restaurant_day_closings')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .eq('closing_date', todayKey)
            .maybeSingle(),
            supabase
            .from('restaurant_daily_finance_summaries')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .eq('summary_date', todayKey)
            .maybeSingle(),
            supabase
            .from('restaurant_day_closing_payment_snapshots')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .eq('closing_date', todayKey)
            .maybeSingle(),
        ])

        const nextErrors = [
            normalizeDashboardError('Orders', ordersResult.error),
            normalizeDashboardError('Cash & Bank accounts', accountsResult.error),
            normalizeDashboardError('Day Closing', dayClosingResult.error),
            normalizeDashboardError('Daily Finance Summary', dailySummaryResult.error),
            normalizeDashboardError('Payment Snapshot', paymentSnapshotResult.error),
        ].filter(Boolean)

        setDashboardData({
            orders: ordersResult.data || [],
            accounts: accountsResult.data || [],
            dayClosing: dayClosingResult.data || null,
            dailySummary: dailySummaryResult.data || null,
            paymentSnapshot: paymentSnapshotResult.data || null,
        })
        setLoadErrors(nextErrors)
        setLastUpdated(new Date())
        setLoading(false)
        setRefreshing(false)
        },
        [restaurant?.id, todayKey],
    )

    useEffect(() => {
        loadOwnerDashboard()
    }, [loadOwnerDashboard])

    const dashboardSummary = useMemo(
        () =>
        buildOwnerDashboardSummary({
            data: dashboardData,
            currency,
        }),
        [currency, dashboardData],
    )

    const dashboardAlerts = useMemo(
        () =>
        buildOwnerDashboardAlerts({
            summary: dashboardSummary,
            dayClosing: dashboardData.dayClosing,
            dailySummary: dashboardData.dailySummary,
            accounts: dashboardData.accounts,
        }),
        [dashboardData.accounts, dashboardData.dayClosing, dashboardData.dailySummary, dashboardSummary],
    )

    const publicMenuButtonDisabled = !publicMenuUrl

    return (
        <section className="owner-dashboard-shell">
        <div className="owner-dashboard-hero">
            <div>
            <p className="pricing-label">Restaurant Dashboard</p>
            <h1>Owner Command Center</h1>
            <p>
                Welcome, {profile?.full_name || 'Restaurant Owner'}. See today’s sales,
                collections, pending payments, finance health, day closing and quick
                actions from one live dashboard.
            </p>
            </div>

            <div className="owner-dashboard-hero-actions">
            <div className={`owner-dashboard-status-pill ${restaurant?.is_active ? 'active' : 'inactive'}`}>
                <span>Live Status</span>
                <strong>{restaurant?.is_active ? 'Active' : 'Inactive'}</strong>
            </div>

            <button
                type="button"
                className="owner-dashboard-refresh"
                onClick={() => loadOwnerDashboard({ silent: true })}
                disabled={refreshing}
            >
                <RefreshCw size={17} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            </div>
        </div>

        {loadErrors.length > 0 && (
            <div className="owner-dashboard-warning">
            <AlertTriangle size={18} />
            <div>
                <strong>Some dashboard data could not be loaded</strong>
                <span>{loadErrors.join(' • ')}</span>
            </div>
            </div>
        )}

        <div className="owner-dashboard-meta-row">
            <DashboardMetaCard
            icon={<Store size={19} />}
            label="Restaurant"
            value={restaurant?.name || 'Not created'}
            note={restaurant?.subscription_status || 'trialing'}
            />
            <DashboardMetaCard
            icon={<Settings size={19} />}
            label="Role"
            value={profile?.role || 'restaurant_owner'}
            note="Access mode"
            />
            <DashboardMetaCard
            icon={<Clock3 size={19} />}
            label="Today"
            value={formatSimpleDate(todayKey)}
            note={lastUpdated ? `Updated ${formatTime(lastUpdated)}` : 'Loading live data'}
            />
        </div>

        {loading ? (
            <div className="owner-dashboard-loading">
            <RefreshCw size={20} />
            Loading owner dashboard...
            </div>
        ) : (
            <>
            <div className="owner-dashboard-kpi-grid">
                <DashboardMetricCard
                icon={<ReceiptText size={21} />}
                label="Today Sales"
                value={formatMoney(currency, dashboardSummary.todaySales)}
                note={`${dashboardSummary.totalOrders} order${dashboardSummary.totalOrders === 1 ? '' : 's'} today`}
                tone="gold"
                />
                <DashboardMetricCard
                icon={<WalletCards size={21} />}
                label="Today Collected"
                value={formatMoney(currency, dashboardSummary.todayCollected)}
                note="Paid / collected amount"
                tone="green"
                />
                <DashboardMetricCard
                icon={<Banknote size={21} />}
                label="Pending Payments"
                value={formatMoney(currency, dashboardSummary.pendingPayments)}
                note={`${dashboardSummary.pendingPaymentCount} pending order${dashboardSummary.pendingPaymentCount === 1 ? '' : 's'}`}
                tone={dashboardSummary.pendingPayments > 0 ? 'warning' : 'green'}
                />
                <DashboardMetricCard
                icon={<ShoppingCart size={21} />}
                label="Open Orders"
                value={String(dashboardSummary.openOrders)}
                note={`${dashboardSummary.billRequestedOrders} bill request${dashboardSummary.billRequestedOrders === 1 ? '' : 's'}`}
                tone={dashboardSummary.openOrders > 0 ? 'blue' : 'green'}
                />
                <DashboardMetricCard
                icon={<Landmark size={21} />}
                label="Cash Balance"
                value={formatMoney(currency, dashboardSummary.cashBalance)}
                note="Cash drawer + petty cash"
                tone={dashboardSummary.cashBalance < 0 ? 'danger' : 'blue'}
                />
                <DashboardMetricCard
                icon={<CreditCard size={21} />}
                label="Online Pending"
                value={formatMoney(currency, dashboardSummary.onlinePending)}
                note={`${dashboardSummary.onlinePendingCount} online pending`}
                tone={dashboardSummary.onlinePending > 0 ? 'warning' : 'green'}
                />
                <DashboardMetricCard
                icon={<AlertTriangle size={21} />}
                label="Refund Alerts"
                value={String(dashboardSummary.refundCount)}
                note={formatMoney(currency, dashboardSummary.refundTotal)}
                tone={dashboardSummary.refundCount > 0 ? 'warning' : 'green'}
                />
                <DashboardMetricCard
                icon={<ClipboardCheck size={21} />}
                label="Business Health"
                value={`${dashboardSummary.healthScore}/100`}
                note={dashboardSummary.healthLabel}
                tone={getHealthTone(dashboardSummary.healthScore)}
                />
            </div>

            <div className="owner-dashboard-main-grid">
                <section className="owner-dashboard-panel">
                <div className="owner-dashboard-panel-head">
                    <div>
                    <p className="pricing-label">Today’s Control Flow</p>
                    <h2>What needs attention?</h2>
                    </div>
                    <StatusBadge status={dashboardSummary.dayClosingStatus} />
                </div>

                <div className="owner-dashboard-alert-list">
                    {dashboardAlerts.map((alert) => (
                    <OwnerAlertCard
                        key={alert.key}
                        alert={alert}
                        onOpenSection={onOpenSection}
                    />
                    ))}
                </div>
                </section>

                <section className="owner-dashboard-panel">
                <div className="owner-dashboard-panel-head">
                    <div>
                    <p className="pricing-label">Quick Actions</p>
                    <h2>Open main modules</h2>
                    </div>
                </div>

                <div className="owner-dashboard-action-grid">
                    <QuickActionButton
                    icon={<ClipboardCheck size={18} />}
                    title="Onboarding"
                    text="Launch setup checklist"
                    onClick={() => onOpenSection('onboarding')}
                    />
                    <QuickActionButton
                    icon={<CreditCard size={18} />}
                    title="Subscription"
                    text="Mamo Pay billing"
                    onClick={() => onOpenSection('subscription-billing')}
                    />
                    <QuickActionButton
                    icon={<ShoppingCart size={18} />}
                    title="New Order / POS"
                    text="Create counter order"
                    onClick={() => onOpenSection('pos')}
                    />
                    <QuickActionButton
                    icon={<ReceiptText size={18} />}
                    title="Orders"
                    text="Live order control"
                    onClick={() => onOpenSection('orders')}
                    />
                    <QuickActionButton
                    icon={<Banknote size={18} />}
                    title="Customer Payments"
                    text="Collect pending dues"
                    onClick={() => onOpenSection('customer-payments')}
                    />
                    <QuickActionButton
                    icon={<RotateCcw size={18} />}
                    title="Refund Automation"
                    text="Gateway refund tracker"
                    onClick={() => onOpenSection('refund-automation')}
                    />
                    <QuickActionButton
                    icon={<BellRing size={18} />}
                    title="Reminder Center"
                    text="Rules and notifications"
                    onClick={() => onOpenSection('notification-center')}
                    />
                    <QuickActionButton
                    icon={<ClipboardCheck size={18} />}
                    title="Day Closing"
                    text="Z report and drawer"
                    onClick={() => onOpenSection('day-closing')}
                    />
                    <QuickActionButton
                    icon={<Landmark size={18} />}
                    title="Cash & Bank"
                    text="Ledger and finance"
                    onClick={() => onOpenSection('cash-bank')}
                    />
                    <QuickActionButton
                    icon={<WalletCards size={18} />}
                    title="Expense Reports"
                    text="Category cost reports"
                    onClick={() => onOpenSection('expense-reports')}
                    />
                    <QuickActionButton
                    icon={<ClipboardCheck size={18} />}
                    title="VAT Statutory"
                    text="TRN and VAT filing pack"
                    onClick={() => onOpenSection('vat-statutory')}
                    />
                    <QuickActionButton
                    icon={<BarChart3 size={18} />}
                    title="COGS & Margin"
                    text="Food cost and profit"
                    onClick={() => onOpenSection('cogs')}
                    />
                    <QuickActionButton
                    icon={<BarChart3 size={18} />}
                    title="Advanced Reports"
                    text="Products, tables and gateways"
                    onClick={() => onOpenSection('advanced-reports')}
                    />
                    <QuickActionButton
                    icon={<Settings size={18} />}
                    title="Settings"
                    text="Profile and gateways"
                    onClick={() => onOpenSection('settings')}
                    />
                    <QuickActionButton
                    icon={<ExternalLink size={18} />}
                    title="Public Menu"
                    text="Open QR menu"
                    disabled={publicMenuButtonDisabled}
                    onClick={() => {
                        if (publicMenuUrl) window.open(publicMenuUrl, '_blank', 'noopener,noreferrer')
                    }}
                    />
                </div>
                </section>
            </div>

            <section className="owner-dashboard-panel owner-dashboard-orders-panel">
                <div className="owner-dashboard-panel-head">
                <div>
                    <p className="pricing-label">Live Orders</p>
                    <h2>Latest activity today</h2>
                </div>

                <button
                    type="button"
                    className="owner-dashboard-link-button"
                    onClick={() => onOpenSection('orders')}
                >
                    View all orders
                    <ArrowRight size={16} />
                </button>
                </div>

                <div className="owner-dashboard-orders-list">
                {dashboardData.orders.length === 0 ? (
                    <div className="owner-dashboard-empty">
                    <CheckCircle2 size={19} />
                    <span>No orders recorded today yet.</span>
                    </div>
                ) : (
                    dashboardData.orders.slice(0, 6).map((order) => (
                    <article className="owner-dashboard-order-row" key={order.id}>
                        <div>
                        <strong>{order.order_code || order.public_order_number || 'Order'}</strong>
                        <span>
                            {formatOrderType(order.order_type)} • {formatOrderStatus(order.status)}
                        </span>
                        </div>

                        <div>
                        <strong>{formatMoney(order.currency || currency, getOrderTotal(order))}</strong>
                        <span>{formatPaymentStatus(order)}</span>
                        </div>
                    </article>
                    ))
                )}
                </div>
            </section>
            </>
        )}
        </section>
    )
    }

    function DashboardMetaCard({ icon, label, value, note }) {
    return (
        <article className="owner-dashboard-meta-card">
        <div>{icon}</div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
        </article>
    )
    }

    function DashboardMetricCard({ icon, label, value, note, tone = 'neutral' }) {
    return (
        <article className={`owner-dashboard-metric-card ${tone}`}>
        <div className="owner-dashboard-metric-icon">{icon}</div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
        </article>
    )
    }

    function OwnerAlertCard({ alert, onOpenSection }) {
    const Icon = alert.tone === 'good' ? CheckCircle2 : AlertTriangle

    return (
        <article className={`owner-dashboard-alert-card ${alert.tone}`}>
        <div className="owner-dashboard-alert-icon">
            <Icon size={17} />
        </div>

        <div>
            <strong>{alert.title}</strong>
            <span>{alert.message}</span>
        </div>

        {alert.section && (
            <button type="button" onClick={() => onOpenSection(alert.section)}>
            {alert.actionLabel || 'Open'}
            </button>
        )}
        </article>
    )
    }

    function QuickActionButton({ icon, title, text, onClick, disabled = false }) {
    return (
        <button
        type="button"
        className="owner-dashboard-action-button"
        onClick={onClick}
        disabled={disabled}
        >
        <div>{icon}</div>
        <strong>{title}</strong>
        <span>{disabled ? 'Not available yet' : text}</span>
        </button>
    )
    }

    function StatusBadge({ status }) {
    return (
        <div className={`owner-dashboard-day-status ${status.tone}`}>
        <strong>{status.label}</strong>
        <span>{status.note}</span>
        </div>
    )
    }

    function buildOwnerDashboardSummary({ data, currency }) {
    const orders = Array.isArray(data.orders) ? data.orders : []
    const accounts = Array.isArray(data.accounts) ? data.accounts : []
    const activeAccounts = accounts.filter((account) => account.is_active !== false)

    const todaySales = sumValues(orders.map(getOrderTotal))
    const collectedFromOrders = sumValues(orders.map(getOrderCollectedAmount))
    const snapshotCollected = getFirstNumericValue(data.paymentSnapshot, [
        'net_collected',
        'collected_total',
        'total_collected',
    ])
    const summaryCollected = getFirstNumericValue(data.dailySummary, [
        'collected_total',
        'total_collections',
        'net_collected',
    ])
    const todayCollected =
        snapshotCollected > 0
        ? snapshotCollected
        : summaryCollected > 0
            ? summaryCollected
            : collectedFromOrders

    const pendingOrderRows = orders.filter(isPaymentPending)
    const pendingPayments = sumValues(pendingOrderRows.map(getOrderPendingAmount))
    const onlinePendingRows = pendingOrderRows.filter(isOnlinePaymentPending)
    const onlinePending = sumValues(onlinePendingRows.map(getOrderPendingAmount))
    const refundRows = orders.filter(isRefundedOrAdjustedOrder)
    const refundTotal = sumValues(refundRows.map(getOrderRefundAmount))

    const openOrders = orders.filter((order) => !isFinalRestaurantOrderStatus(order.status)).length
    const billRequestedOrders = orders.filter((order) => order.status === 'bill_requested').length

    const cashBalance = activeAccounts
        .filter((account) => ['cash', 'petty_cash'].includes(account.account_type))
        .reduce((total, account) => total + Number(account.current_balance || 0), 0)

    const dayClosingStatus = getDayClosingStatus(data.dayClosing)
    const healthScore = calculateBusinessHealthScore({
        totalOrders: orders.length,
        pendingPayments,
        onlinePending,
        refundCount: refundRows.length,
        openOrders,
        cashBalance,
        hasAccounts: activeAccounts.length > 0,
        dayClosingStatus,
        hasDailySummary: Boolean(data.dailySummary),
    })

    return {
        currency,
        totalOrders: orders.length,
        todaySales,
        todayCollected,
        pendingPaymentCount: pendingOrderRows.length,
        pendingPayments,
        openOrders,
        billRequestedOrders,
        cashBalance,
        onlinePending,
        onlinePendingCount: onlinePendingRows.length,
        refundCount: refundRows.length,
        refundTotal,
        dayClosingStatus,
        healthScore,
        healthLabel: getBusinessHealthLabel(healthScore),
    }
    }

    function buildOwnerDashboardAlerts({ summary, dayClosing, dailySummary, accounts }) {
    const alerts = []

    if (!Array.isArray(accounts) || accounts.filter((account) => account.is_active !== false).length === 0) {
        alerts.push({
        key: 'setup_accounts',
        tone: 'warning',
        title: 'Cash & Bank setup needed',
        message: 'Create cash, card and online gateway accounts before posting closings.',
        section: 'cash-bank',
        actionLabel: 'Open Cash & Bank',
        })
    }

    if (summary.pendingPayments > 0) {
        alerts.push({
        key: 'pending_payments',
        tone: 'warning',
        title: 'Pending payments need follow-up',
        message: `${formatMoney(summary.currency, summary.pendingPayments)} is still pending from today’s orders.`,
        section: 'customer-payments',
        actionLabel: 'Collect dues',
        })
    }

    if (summary.onlinePending > 0) {
        alerts.push({
        key: 'online_pending',
        tone: 'warning',
        title: 'Online payments pending',
        message: `${formatMoney(summary.currency, summary.onlinePending)} is waiting for gateway confirmation or collection.`,
        section: 'orders',
        actionLabel: 'Review orders',
        })
    }

    if (summary.refundCount > 0) {
        alerts.push({
        key: 'refunds',
        tone: 'warning',
        title: 'Refund / adjustment activity found',
        message: `${summary.refundCount} refund or adjustment item needs owner review.`,
        section: 'orders',
        actionLabel: 'Review refunds',
        })
    }

    if (!dayClosing || dayClosing.status !== 'closed') {
        alerts.push({
        key: 'day_closing',
        tone: 'warning',
        title: 'Day Closing not completed',
        message: 'Create payment snapshot, verify drawer count and close the day.',
        section: 'day-closing',
        actionLabel: 'Close day',
        })
    }

    if (!dailySummary) {
        alerts.push({
        key: 'daily_summary',
        tone: 'warning',
        title: 'Daily finance summary not created',
        message: 'After Day Closing, create the Daily Summary inside Cash & Bank.',
        section: 'cash-bank',
        actionLabel: 'Open finance',
        })
    }

    if (summary.cashBalance < 0) {
        alerts.push({
        key: 'cash_negative',
        tone: 'danger',
        title: 'Cash balance is negative',
        message: 'Review cash ledger, opening balance and day closing postings.',
        section: 'cash-bank',
        actionLabel: 'Review ledger',
        })
    }

    if (alerts.length === 0) {
        alerts.push({
        key: 'healthy',
        tone: 'good',
        title: 'Today looks healthy',
        message: 'Orders, collections, cash balance and closing workflow look clean.',
        section: 'reports',
        actionLabel: 'View reports',
        })
    }

    return alerts.slice(0, 6)
    }

    function calculateBusinessHealthScore({
    totalOrders,
    pendingPayments,
    onlinePending,
    refundCount,
    openOrders,
    cashBalance,
    hasAccounts,
    dayClosingStatus,
    hasDailySummary,
    }) {
    let score = 100

    if (!hasAccounts) score -= 15
    if (dayClosingStatus.value !== 'closed') score -= 18
    if (!hasDailySummary) score -= 12
    if (pendingPayments > 0) score -= Math.min(20, 8 + pendingPayments / 100)
    if (onlinePending > 0) score -= 6
    if (refundCount > 0) score -= Math.min(10, refundCount * 3)
    if (cashBalance < 0) score -= 12
    if (openOrders > 10) score -= 6
    if (totalOrders === 0) score -= 3

    return Math.max(0, Math.min(100, Math.round(score)))
    }

    function getDayClosingStatus(dayClosing) {
    if (!dayClosing) {
        return {
        value: 'not_started',
        label: 'Not closed',
        note: 'Day Closing pending',
        tone: 'warning',
        }
    }

    if (dayClosing.status === 'closed') {
        return {
        value: 'closed',
        label: 'Closed',
        note: 'Z report saved',
        tone: 'good',
        }
    }

    if (dayClosing.status === 'draft') {
        return {
        value: 'draft',
        label: 'Draft',
        note: 'Closing draft saved',
        tone: 'warning',
        }
    }

    return {
        value: dayClosing.status || 'open',
        label: formatTitle(dayClosing.status || 'Open'),
        note: 'Review closing',
        tone: 'warning',
    }
    }

    function normalizeDashboardError(label, error) {
    if (!error) return ''
    if (['42P01', 'PGRST116'].includes(error.code)) return ''

    return `${label}: ${error.message}`
    }

    function getOrderTotal(order) {
    return Number(order?.total_amount ?? order?.grand_total ?? order?.amount ?? 0)
    }

    function getOrderCollectedAmount(order) {
    const paidAmount = Number(order?.paid_amount || 0)

    if (paidAmount > 0) return paidAmount
    if (isOrderPaid(order)) return getOrderTotal(order)

    return 0
    }

    function getOrderPendingAmount(order) {
    if (!isPaymentPending(order)) return 0

    return Math.max(getOrderTotal(order) - getOrderCollectedAmount(order), 0)
    }

    function getOrderRefundAmount(order) {
    return getFirstNumericValue(order, [
        'refund_total',
        'refunded_amount',
        'refund_amount',
        'adjustment_amount',
    ])
    }

    function isOrderPaid(order) {
    const status = String(order?.payment_status || '').toLowerCase()

    return ['paid', 'captured', 'completed', 'settled'].includes(status)
    }

    function isPaymentPending(order) {
    const paymentStatus = String(order?.payment_status || '').toLowerCase()
    const orderStatus = String(order?.status || '').toLowerCase()

    if (['paid', 'refunded', 'cancelled', 'voided'].includes(paymentStatus)) return false
    if (['cancelled'].includes(orderStatus)) return false

    return getOrderPendingAmountWithoutStatusLoop(order) > 0
    }

    function getOrderPendingAmountWithoutStatusLoop(order) {
    const total = getOrderTotal(order)
    const paid = Number(order?.paid_amount || 0)

    if (isOrderPaid(order)) return 0

    return Math.max(total - paid, 0)
    }

    function isOnlinePaymentPending(order) {
    const values = [
        order?.payment_method,
        order?.delivery_payment_type,
        order?.payment_gateway,
        order?.gateway,
    ]
        .map((value) => String(value || '').toLowerCase())
        .filter(Boolean)

    return values.some((value) =>
        [
        'online',
        'ziina',
        'stripe',
        'razorpay',
        'cashfree',
        'phonepe',
        'paypal',
        'network',
        'ngenius',
        'n-genius',
        'card_online',
        'payment_link',
        ].includes(value),
    )
    }

    function isRefundedOrAdjustedOrder(order) {
    const paymentStatus = String(order?.payment_status || '').toLowerCase()

    return paymentStatus.includes('refund') || getOrderRefundAmount(order) > 0
    }

    function isFinalRestaurantOrderStatus(status) {
    return ['completed', 'cancelled', 'delivered'].includes(String(status || '').toLowerCase())
    }

    function sumValues(values) {
    return values.reduce((total, value) => total + Number(value || 0), 0)
    }

    function getFirstNumericValue(source, keys) {
    if (!source || typeof source !== 'object') return 0

    for (const key of keys) {
        const value = Number(source[key] || 0)
        if (Number.isFinite(value) && value !== 0) return value
    }

    return 0
    }

    function getBusinessHealthLabel(score) {
    if (score >= 85) return 'Healthy'
    if (score >= 65) return 'Review needed'
    if (score >= 40) return 'Needs urgent review'
    return 'Setup needed'
    }

    function getHealthTone(score) {
    if (score >= 85) return 'green'
    if (score >= 65) return 'warning'
    return 'danger'
    }

    function formatPaymentStatus(order) {
    const status = String(order?.payment_status || 'pending').toLowerCase()

    if (status === 'paid') return 'Paid'
    if (status.includes('refund')) return 'Refunded / adjusted'
    if (isOnlinePaymentPending(order)) return 'Online pending'
    if (status === 'unpaid') return 'Unpaid'

    return formatTitle(status || 'Pending')
    }

    function formatOrderStatus(status) {
    return formatTitle(status || 'order_received')
    }

    function formatOrderType(type) {
    if (type === 'dine_in') return 'Dine-in'
    if (type === 'delivery') return 'Delivery'
    if (type === 'takeaway') return 'Takeaway'
    return 'Counter'
    }

    function formatTitle(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
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

    function formatSimpleDate(value) {
    try {
        return new Intl.DateTimeFormat('en-AE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        }).format(new Date(`${value}T00:00:00`))
    } catch {
        return value
    }
    }

    function formatTime(value) {
    try {
        return new Intl.DateTimeFormat('en-AE', {
        hour: '2-digit',
        minute: '2-digit',
        }).format(value)
    } catch {
        return 'now'
    }
    }

    function getTodayDateKey() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
    }

    function getDateRangeIso(dateKey) {
    const start = new Date(`${dateKey}T00:00:00`)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)

    return {
        startIso: start.toISOString(),
        endIso: end.toISOString(),
    }
    }

    export default RestaurantOverview
