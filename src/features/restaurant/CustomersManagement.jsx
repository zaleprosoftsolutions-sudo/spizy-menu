import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Gift,
  History,
  MinusCircle,
  Phone,
  PlusCircle,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Star,
  ToggleLeft,
  ToggleRight,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './CustomersManagement.css'

const expiryUnitOptions = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
]

const defaultRewardSettings = {
  rewards_enabled: false,
  reward_amount_unit: 10,
  reward_points_per_amount: 1,
  reward_redeem_points: 100,
  reward_redeem_discount_amount: 10,
  reward_expiration_enabled: false,
  reward_expiry_value: 12,
  reward_expiry_unit: 'months',
}

function CustomersManagement({ restaurant }) {
  const [customers, setCustomers] = useState([])
  const [settings, setSettings] = useState(defaultRewardSettings)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerTransactions, setCustomerTransactions] = useState([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [adjustingPoints, setAdjustingPoints] = useState(false)
  const [adjustForm, setAdjustForm] = useState({
    mode: 'add',
    points: '',
    reason: '',
  })

  const currency = restaurant?.currency || 'AED'

  const loadCustomers = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select(
        `
          id,
          rewards_enabled,
          reward_amount_unit,
          reward_points_per_amount,
          reward_redeem_points,
          reward_redeem_discount_amount,
          reward_expiration_enabled,
          reward_expiry_value,
          reward_expiry_unit,
          currency
        `,
      )
      .eq('id', restaurant.id)
      .maybeSingle()

    if (restaurantData) {
      setSettings({
        rewards_enabled: Boolean(restaurantData.rewards_enabled),
        reward_amount_unit: Number(restaurantData.reward_amount_unit || 10),
        reward_points_per_amount: Number(
          restaurantData.reward_points_per_amount || 1,
        ),
        reward_redeem_points: Number(restaurantData.reward_redeem_points || 100),
        reward_redeem_discount_amount: Number(
          restaurantData.reward_redeem_discount_amount || 10,
        ),
        reward_expiration_enabled: Boolean(
          restaurantData.reward_expiration_enabled,
        ),
        reward_expiry_value: Number(restaurantData.reward_expiry_value || 12),
        reward_expiry_unit: getSafeExpiryUnit(
          restaurantData.reward_expiry_unit || 'months',
        ),
      })
    }

    const { data: customerData } = await supabase
      .from('restaurant_customers')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    setCustomers(customerData || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const refreshCustomerData = async () => {
    if (!restaurant?.id) return

    setRefreshing(true)

    await supabase.rpc('refresh_restaurant_customers', {
      p_restaurant_id: restaurant.id,
    })

    setRefreshing(false)
    await loadCustomers()
  }

  const loadCustomerTransactions = async (customer) => {
    if (!restaurant?.id || !customer?.id) return

    setTransactionsLoading(true)

    const { data, error } = await supabase.rpc(
      'get_restaurant_customer_reward_ledger',
      {
        p_restaurant_id: restaurant.id,
        p_customer_id: customer.id,
      },
    )

    setTransactionsLoading(false)

    if (error) {
      setCustomerTransactions([])
      return
    }

    setCustomerTransactions(Array.isArray(data) ? data : [])
  }

  const openCustomerLedger = async (customer) => {
    setSelectedCustomer(customer)
    setCustomerTransactions([])
    setAdjustForm({
      mode: 'add',
      points: '',
      reason: '',
    })

    await loadCustomerTransactions(customer)
  }

  const handleAdjustPoints = async () => {
    if (!restaurant?.id || !selectedCustomer?.id) return

    const rawPoints = Math.abs(Number(adjustForm.points || 0))

    if (rawPoints <= 0) return

    const signedPoints = adjustForm.mode === 'deduct' ? -rawPoints : rawPoints

    setAdjustingPoints(true)

    const { data: newBalance, error } = await supabase.rpc(
      'adjust_customer_reward_points',
      {
        p_restaurant_id: restaurant.id,
        p_customer_id: selectedCustomer.id,
        p_points: signedPoints,
        p_description:
          adjustForm.reason.trim() ||
          (signedPoints > 0
            ? 'Manual points added by restaurant'
            : 'Manual points deducted by restaurant'),
      },
    )

    setAdjustingPoints(false)

    if (error) return

    if (newBalance !== null && newBalance !== undefined) {
      setSelectedCustomer((current) =>
        current
          ? {
              ...current,
              reward_points: Number(newBalance || 0),
            }
          : current,
      )
    }

    setAdjustForm({
      mode: 'add',
      points: '',
      reason: '',
    })

    await refreshCustomerData()
    await loadCustomerTransactions(selectedCustomer)
  }

  const saveRewardSettings = async () => {
    if (!restaurant?.id) return

    const rewardAmountUnit = Math.max(
      1,
      Number(settings.reward_amount_unit || 10),
    )
    const rewardPointsPerAmount = Math.max(
      0,
      Number(settings.reward_points_per_amount || 1),
    )
    const rewardRedeemPoints = Math.max(
      1,
      Number(settings.reward_redeem_points || 100),
    )
    const rewardRedeemDiscountAmount = Math.max(
      0,
      Number(settings.reward_redeem_discount_amount || 10),
    )
    const rewardExpirationEnabled = Boolean(settings.reward_expiration_enabled)
    const rewardExpiryValue = rewardExpirationEnabled
      ? Math.max(1, Number(settings.reward_expiry_value || 12))
      : 0
    const rewardExpiryUnit = getSafeExpiryUnit(
      settings.reward_expiry_unit || 'months',
    )

    setSavingSettings(true)

    const { error } = await supabase
      .from('restaurants')
      .update({
        rewards_enabled: Boolean(settings.rewards_enabled),
        reward_amount_unit: rewardAmountUnit,
        reward_points_per_amount: rewardPointsPerAmount,
        reward_redeem_points: rewardRedeemPoints,
        reward_redeem_discount_amount: rewardRedeemDiscountAmount,
        reward_expiration_enabled: rewardExpirationEnabled,
        reward_expiry_value: rewardExpiryValue,
        reward_expiry_unit: rewardExpiryUnit,
      })
      .eq('id', restaurant.id)

    setSavingSettings(false)

    if (error) return

    setSettings((current) => ({
      ...current,
      reward_amount_unit: rewardAmountUnit,
      reward_points_per_amount: rewardPointsPerAmount,
      reward_redeem_points: rewardRedeemPoints,
      reward_redeem_discount_amount: rewardRedeemDiscountAmount,
      reward_expiration_enabled: rewardExpirationEnabled,
      reward_expiry_value: rewardExpiryValue || 12,
      reward_expiry_unit: rewardExpiryUnit,
    }))

    await refreshCustomerData()
  }

  const updateSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return customers

    return customers.filter((customer) =>
      [customer.customer_name, customer.customer_phone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword)),
    )
  }, [customers, search])

  const stats = useMemo(() => {
    const totalSpend = customers.reduce(
      (total, customer) => total + Number(customer.total_spend || 0),
      0,
    )

    const totalOrders = customers.reduce(
      (total, customer) => total + Number(customer.total_orders || 0),
      0,
    )

    const repeatCustomers = customers.filter(
      (customer) => Number(customer.total_orders || 0) > 1,
    ).length

    const rewardPoints = customers.reduce(
      (total, customer) => total + Number(customer.reward_points || 0),
      0,
    )

    return {
      totalCustomers: customers.length,
      totalOrders,
      totalSpend,
      repeatCustomers,
      rewardPoints,
    }
  }, [customers])

  if (loading) {
    return (
      <section className="management-section customers-screen">
        <div className="customers-empty-state">
          <Users size={36} />
          <h2>Loading customers...</h2>
          <p>Please wait while Spizy prepares customer records.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section customers-screen">
      <header className="customers-header">
        <div>
          <p className="section-kicker">Customers</p>
          <h2>Customers & Rewards</h2>
          <span>
            Track repeat customers, paid orders, customer spend, points,
            redemption rules and expiration settings.
          </span>
        </div>

        <button
          type="button"
          className="customers-refresh-button"
          onClick={refreshCustomerData}
          disabled={refreshing}
        >
          <RefreshCcw size={16} />
          {refreshing ? 'Syncing...' : 'Sync customers'}
        </button>
      </header>

      <div className="customers-stats-grid">
        <CustomerStatCard
          icon={Users}
          label="Customers"
          value={stats.totalCustomers}
        />
        <CustomerStatCard
          icon={Star}
          label="Repeat customers"
          value={stats.repeatCustomers}
        />
        <CustomerStatCard
          icon={WalletCards}
          label="Paid orders"
          value={stats.totalOrders}
        />
        <CustomerStatCard
          icon={Sparkles}
          label="Total spend"
          value={formatMoney(stats.totalSpend, currency)}
        />
        <CustomerStatCard
          icon={Gift}
          label="Reward points"
          value={Number(stats.rewardPoints || 0).toFixed(0)}
        />
      </div>

      <div
        className={`customers-rewards-panel ${
          settings.rewards_enabled ? 'active' : 'inactive'
        }`}
      >
        <div className="customers-rewards-top">
          <div className="customers-rewards-main">
            <div className="customers-rewards-icon">
              <Gift size={24} />
            </div>

            <div>
              <p className="section-kicker">Rewards status</p>
              <h3>
                {settings.rewards_enabled
                  ? 'Rewards active for this restaurant'
                  : 'Rewards not active yet'}
              </h3>
              <span>
                {settings.rewards_enabled
                  ? getRewardSummary(settings, currency)
                  : 'Customer app Rewards tab should show Coming soon until this store activates rewards.'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="customers-toggle-rewards"
            onClick={() =>
              updateSetting('rewards_enabled', !settings.rewards_enabled)
            }
          >
            {settings.rewards_enabled ? (
              <ToggleRight size={28} />
            ) : (
              <ToggleLeft size={28} />
            )}
            {settings.rewards_enabled ? 'Active' : 'Coming soon'}
          </button>
        </div>

        <div className="customers-reward-rules-grid">
          <div className="customers-reward-rule-card">
            <div className="customers-rule-head">
              <span>01</span>
              <strong>Earning rule</strong>
            </div>

            <div className="customers-rule-fields two">
              <label>
                Spend amount
                <input
                  type="number"
                  min="1"
                  value={settings.reward_amount_unit}
                  onChange={(event) =>
                    updateSetting('reward_amount_unit', event.target.value)
                  }
                />
              </label>

              <label>
                Points earned
                <input
                  type="number"
                  min="0"
                  value={settings.reward_points_per_amount}
                  onChange={(event) =>
                    updateSetting(
                      'reward_points_per_amount',
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>

            <p>
              Example: spend {currency} {settings.reward_amount_unit || 0} ={' '}
              {settings.reward_points_per_amount || 0} point(s).
            </p>
          </div>

          <div className="customers-reward-rule-card">
            <div className="customers-rule-head">
              <span>02</span>
              <strong>Redemption rule</strong>
            </div>

            <div className="customers-rule-fields two">
              <label>
                Points to redeem
                <input
                  type="number"
                  min="1"
                  value={settings.reward_redeem_points}
                  onChange={(event) =>
                    updateSetting('reward_redeem_points', event.target.value)
                  }
                />
              </label>

              <label>
                Coupon discount
                <input
                  type="number"
                  min="0"
                  value={settings.reward_redeem_discount_amount}
                  onChange={(event) =>
                    updateSetting(
                      'reward_redeem_discount_amount',
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>

            <p>
              Example: {settings.reward_redeem_points || 0} points = {currency}{' '}
              {settings.reward_redeem_discount_amount || 0} discount coupon.
            </p>
          </div>

          <div className="customers-reward-rule-card">
            <div className="customers-rule-head">
              <span>03</span>
              <strong>Points expiration</strong>
            </div>

            <div className="customers-expiry-toggle-row">
              <button
                type="button"
                className={`customers-expiry-toggle ${
                  settings.reward_expiration_enabled ? 'active' : ''
                }`}
                onClick={() =>
                  updateSetting(
                    'reward_expiration_enabled',
                    !settings.reward_expiration_enabled,
                  )
                }
              >
                {settings.reward_expiration_enabled ? (
                  <ToggleRight size={26} />
                ) : (
                  <ToggleLeft size={26} />
                )}
                {settings.reward_expiration_enabled ? 'Expiry on' : 'Lifetime'}
              </button>
            </div>

            {settings.reward_expiration_enabled ? (
              <div className="customers-rule-fields two">
                <label>
                  Expiry duration
                  <input
                    type="number"
                    min="1"
                    value={settings.reward_expiry_value}
                    onChange={(event) =>
                      updateSetting('reward_expiry_value', event.target.value)
                    }
                  />
                </label>

                <label>
                  Period
                  <select
                    value={settings.reward_expiry_unit}
                    onChange={(event) =>
                      updateSetting('reward_expiry_unit', event.target.value)
                    }
                  >
                    {expiryUnitOptions.map((unit) => (
                      <option value={unit.value} key={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="customers-lifetime-box">
                Points will not expire. Customers can keep points for lifetime.
              </div>
            )}

            <p>{getExpirySummary(settings)}</p>
          </div>
        </div>

        <div className="customers-rewards-footer">
          <div>
            <strong>Customer side rule</strong>
            <span>
              If rewards are not active, customer Rewards tab will show Coming
              soon. Once points are earned for an order, later rule changes will not recalculate those old points.
            </span>
          </div>

          <button
            type="button"
            className="customers-save-rewards"
            onClick={saveRewardSettings}
            disabled={savingSettings}
          >
            <Save size={16} />
            {savingSettings ? 'Saving...' : 'Save reward rules'}
          </button>
        </div>
      </div>

      <div className="customers-toolbar">
        <div className="customers-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer name or phone..."
          />
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="customers-empty-state">
          <Users size={36} />
          <h2>No customers found</h2>
          <p>
            Customers will appear here after paid completed orders with phone
            numbers. Click Sync customers after completing bills.
          </p>
        </div>
      ) : (
        <div className="customers-compact-table-card">
          <div className="customers-compact-table-head">
            <span>Customer</span>
            <span>Rewards</span>
            <span>Activity</span>
            <span>Visits</span>
          </div>

          <div className="customers-compact-table-body">
            {filteredCustomers.map((customer) => (
              <CustomerCompactRow
                key={customer.id}
                customer={customer}
                currency={currency}
                rewardsEnabled={settings.rewards_enabled}
                settings={settings}
                onViewLedger={openCustomerLedger}
              />
            ))}
          </div>
        </div>
      )}

      {selectedCustomer && (
        <CustomerLedgerModal
          customer={selectedCustomer}
          transactions={customerTransactions}
          loading={transactionsLoading}
          currency={currency}
          rewardsEnabled={settings.rewards_enabled}
          adjustForm={adjustForm}
          adjustingPoints={adjustingPoints}
          onClose={() => setSelectedCustomer(null)}
          onRefresh={() => loadCustomerTransactions(selectedCustomer)}
          onAdjustChange={(key, value) =>
            setAdjustForm((current) => ({ ...current, [key]: value }))
          }
          onAdjust={handleAdjustPoints}
        />
      )}
    </section>
  )
}

function CustomerStatCard({ icon: Icon, label, value }) {
  return (
    <div className="customers-stat-card">
      <div>
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CustomerCompactRow({
  customer,
  currency,
  rewardsEnabled,
  settings,
  onViewLedger,
}) {
  const points = Number(customer.reward_points || 0)
  const redeemPoints = Number(settings.reward_redeem_points || 100)
  const pointsNeeded = Math.max(0, redeemPoints - points)

  return (
    <article className="customer-compact-row">
      <div className="customer-compact-profile">
        <div className="customer-compact-avatar">
          {getCustomerInitials(customer.customer_name, customer.customer_phone)}
        </div>

        <div className="customer-compact-info">
          <strong>{customer.customer_name || 'Guest customer'}</strong>
          <span>
            <Phone size={13} />
            {customer.customer_phone || 'No phone'}
          </span>

          <button
            type="button"
            className="customer-compact-ledger-button"
            onClick={() => onViewLedger(customer)}
          >
            <History size={14} />
            View ledger
          </button>
        </div>
      </div>

      <div className="customer-compact-rewards">
        <div
          className={`customer-reward-badge ${
            rewardsEnabled ? 'active' : 'inactive'
          }`}
        >
          {rewardsEnabled ? `${points.toFixed(0)} pts` : 'Coming soon'}
        </div>

        {rewardsEnabled && (
          <span className="customer-compact-reward-hint">
            {points >= redeemPoints
              ? `${redeemPoints} pts = ${currency} ${settings.reward_redeem_discount_amount}`
              : `${pointsNeeded.toFixed(0)} pts more`}
          </span>
        )}
      </div>

      <div className="customer-compact-activity">
        <div>
          <span>Paid orders</span>
          <strong>{customer.total_orders || 0}</strong>
        </div>

        <div>
          <span>Total spend</span>
          <strong>{formatMoney(customer.total_spend, currency)}</strong>
        </div>
      </div>

      <div className="customer-compact-visits">
        <div>
          <span>Last</span>
          <strong>{formatShortDate(customer.last_order_at)}</strong>
        </div>

        <div>
          <span>First</span>
          <strong>{formatShortDate(customer.first_order_at)}</strong>
        </div>
      </div>
    </article>
  )
}


function CustomerLedgerModal({
  customer,
  transactions,
  loading,
  currency,
  rewardsEnabled,
  adjustForm,
  adjustingPoints,
  onClose,
  onRefresh,
  onAdjustChange,
  onAdjust,
}) {
  const pointsValue = Math.abs(Number(adjustForm.points || 0))
  const canAdjust = rewardsEnabled && pointsValue > 0

  return (
    <div className="customers-ledger-overlay" onClick={onClose}>
      <div
        className="customers-ledger-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="customers-ledger-head">
          <div>
            <p className="section-kicker">Rewards ledger</p>
            <h2>{customer.customer_name || 'Guest customer'}</h2>
            <span>{customer.customer_phone}</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="customers-ledger-summary">
          <div>
            <span>Current points</span>
            <strong>{Number(customer.reward_points || 0).toFixed(0)}</strong>
          </div>

          <div>
            <span>Total spend</span>
            <strong>{formatMoney(customer.total_spend, currency)}</strong>
          </div>

          <div>
            <span>Paid orders</span>
            <strong>{customer.total_orders || 0}</strong>
          </div>
        </div>

        <div className="customers-adjust-panel">
          <div>
            <strong>Manual adjustment</strong>
            <span>
              Use this for goodwill points, correction, complaint settlement or
              removing wrong points. This will create a locked ledger record.
            </span>
          </div>

          <div className="customers-adjust-grid">
            <label>
              Type
              <select
                value={adjustForm.mode}
                onChange={(event) => onAdjustChange('mode', event.target.value)}
                disabled={!rewardsEnabled || adjustingPoints}
              >
                <option value="add">Add points</option>
                <option value="deduct">Deduct points</option>
              </select>
            </label>

            <label>
              Points
              <input
                type="number"
                min="1"
                value={adjustForm.points}
                onChange={(event) =>
                  onAdjustChange('points', event.target.value)
                }
                disabled={!rewardsEnabled || adjustingPoints}
                placeholder="100"
              />
            </label>
          </div>

          <label className="customers-adjust-reason">
            Reason
            <input
              type="text"
              value={adjustForm.reason}
              onChange={(event) => onAdjustChange('reason', event.target.value)}
              disabled={!rewardsEnabled || adjustingPoints}
              placeholder="Example: goodwill bonus"
            />
          </label>

          {!rewardsEnabled && (
            <div className="customers-adjust-disabled-note">
              Activate rewards before manually adjusting customer points.
            </div>
          )}

          <button
            type="button"
            className="customers-adjust-submit"
            onClick={onAdjust}
            disabled={!canAdjust || adjustingPoints}
          >
            {adjustForm.mode === 'deduct' ? (
              <MinusCircle size={16} />
            ) : (
              <PlusCircle size={16} />
            )}
            {adjustingPoints ? 'Saving...' : 'Save adjustment'}
          </button>
        </div>

        <div className="customers-ledger-toolbar">
          <strong>Recent activity</strong>
          <button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="customers-ledger-empty">Loading activity...</div>
        ) : transactions.length === 0 ? (
          <div className="customers-ledger-empty">
            No reward activity found for this customer yet.
          </div>
        ) : (
          <div className="customers-ledger-list">
            {transactions.map((transaction) => (
              <RewardTransactionRow
                key={transaction.id}
                transaction={transaction}
                currency={currency}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RewardTransactionRow({ transaction, currency }) {
  const points = Number(transaction.points || 0)
  const isPositive = points >= 0
  const expired = Boolean(transaction.is_expired)

  return (
    <article
      className={`customers-ledger-row ${isPositive ? 'positive' : 'negative'} ${
        expired ? 'expired' : ''
      }`}
    >
      <div className="customers-ledger-row-icon">
        {isPositive ? <PlusCircle size={16} /> : <MinusCircle size={16} />}
      </div>

      <div>
        <strong>{transaction.description || formatTransactionType(transaction.transaction_type)}</strong>
        <span>
          {formatShortDateTime(transaction.created_at)}
          {transaction.order_code ? ` • ${transaction.order_code}` : ''}
        </span>
        {transaction.order_total_amount_snapshot !== null &&
          transaction.order_total_amount_snapshot !== undefined && (
            <small>
              Order value snapshot: {formatMoney(transaction.order_total_amount_snapshot, currency)}
            </small>
          )}
        {transaction.expires_at && (
          <small className={expired ? 'expired-text' : ''}>
            {expired
              ? `Expired on ${formatShortDate(transaction.expires_at)}`
              : `Expires on ${formatShortDate(transaction.expires_at)}`}
          </small>
        )}
      </div>

      <strong>{isPositive ? '+' : ''}{points.toFixed(0)} pts</strong>
    </article>
  )
}

function Metric({ label, value }) {
  return (
    <div className="customer-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getCustomerInitials(name, phone) {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }

  return String(phone || 'CU').slice(-2).toUpperCase()
}

function getSafeExpiryUnit(value) {
  return expiryUnitOptions.some((unit) => unit.value === value)
    ? value
    : 'months'
}

function getRewardSummary(settings, currency) {
  const earningText = `Customers earn ${settings.reward_points_per_amount} point(s) for every ${currency} ${settings.reward_amount_unit}.`
  const redeemText = `${settings.reward_redeem_points} points can become a ${currency} ${settings.reward_redeem_discount_amount} discount coupon.`
  const expiryText = getExpirySummary(settings)

  return `${earningText} ${redeemText} ${expiryText}`
}

function getExpirySummary(settings) {
  if (!settings.reward_expiration_enabled) {
    return 'Points are lifetime and do not expire.'
  }

  return `Points expire after ${settings.reward_expiry_value} ${settings.reward_expiry_unit}.`
}

function formatMoney(value, currency = 'AED') {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

function formatTransactionType(type) {
  if (type === 'earn') return 'Points earned'
  if (type === 'redeem') return 'Points redeemed'
  if (type === 'adjust') return 'Manual adjustment'
  return 'Reward activity'
}

function formatShortDateTime(value) {
  if (!value) return 'Not yet'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Not yet'
  }
}

function formatShortDate(value) {
  if (!value) return 'Not yet'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'Not yet'
  }
}

export default CustomersManagement
