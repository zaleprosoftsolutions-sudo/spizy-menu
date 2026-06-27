import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Clock3,
  Home,
  ReceiptText,
  RefreshCcw,
  ShoppingBag,
  XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './PaymentResultPage.css'

function PaymentResultPage({ resultType = 'success' }) {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [paymentResult, setPaymentResult] = useState(null)

  const restaurantSlug =
    searchParams.get('restaurant') ||
    searchParams.get('restaurant_slug') ||
    searchParams.get('slug') ||
    ''
  const orderReference =
    searchParams.get('order') ||
    searchParams.get('order_code') ||
    searchParams.get('ref') ||
    searchParams.get('payment_reference') ||
    searchParams.get('gateway_order_id') ||
    ''
  const gateway = searchParams.get('gateway') || ''
  const customerSessionId = getStoredCustomerSessionId()

  const loadPaymentResult = useCallback(async () => {
    setLoading(true)
    setMessage('')

    const fallbackResult = getLocalPaymentResultSnapshot(orderReference)

    if (!restaurantSlug && !orderReference) {
      setPaymentResult(fallbackResult)
      setMessage(
        fallbackResult
          ? 'Showing the latest saved payment snapshot from this device.'
          : 'Payment reference is missing. Please open this page from the payment link again.',
      )
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc('get_public_payment_result', {
        p_restaurant_slug: restaurantSlug || null,
        p_order_reference: orderReference || null,
        p_customer_session_id: customerSessionId || null,
      })

      if (error) throw error

      const normalizedResult = normalizePaymentResult(data)

      if (normalizedResult) {
        setPaymentResult(normalizedResult)
        setLoading(false)
        return
      }

      setPaymentResult(fallbackResult)
      setMessage(
        fallbackResult
          ? 'Showing saved payment details from this device. Run the included SQL if database lookup is not active yet.'
          : 'No payment record found yet. The restaurant may still be waiting for gateway confirmation.',
      )
    } catch (error) {
      setPaymentResult(fallbackResult)
      setMessage(
        fallbackResult
          ? 'Database lookup is not active yet, so this page is showing the saved local payment snapshot.'
          : error.message || 'Unable to load payment result right now.',
      )
    } finally {
      setLoading(false)
    }
  }, [customerSessionId, orderReference, restaurantSlug])

  useEffect(() => {
    loadPaymentResult()
  }, [loadPaymentResult])

  const viewModel = useMemo(
    () => getPaymentResultViewModel({ resultType, paymentResult, gateway }),
    [gateway, paymentResult, resultType],
  )

  const menuPath = paymentResult?.restaurant_slug
    ? `/menu/${encodeURIComponent(paymentResult.restaurant_slug)}`
    : restaurantSlug
      ? `/menu/${encodeURIComponent(restaurantSlug)}`
      : '/'

  return (
    <main className="payment-result-page">
      <section className="payment-result-shell">
        <Link className="payment-result-brand" to={menuPath}>
          <ReceiptText size={20} />
          Spizy Menu Payment
        </Link>

        <div className={`payment-result-card ${viewModel.tone}`}>
          <div className="payment-result-icon">{viewModel.icon}</div>

          <p className="payment-result-kicker">{viewModel.kicker}</p>
          <h1>{viewModel.title}</h1>
          <p>{viewModel.description}</p>

          {loading ? (
            <div className="payment-result-loading">
              <RefreshCcw size={18} />
              Checking payment status...
            </div>
          ) : (
            <>
              {paymentResult ? (
                <div className="payment-result-details">
                  <PaymentResultRow
                    label="Order"
                    value={
                      paymentResult.order_code ||
                      paymentResult.public_order_number ||
                      paymentResult.order_reference ||
                      orderReference ||
                      'Order'
                    }
                  />
                  <PaymentResultRow
                    label="Restaurant"
                    value={paymentResult.restaurant_name || paymentResult.restaurant_slug || restaurantSlug || 'Restaurant'}
                  />
                  <PaymentResultRow
                    label="Amount"
                    value={formatMoney(paymentResult.total_amount, paymentResult.currency)}
                  />
                  <PaymentResultRow
                    label="Payment method"
                    value={getPaymentMethodLabel(paymentResult, gateway)}
                  />
                  <PaymentResultRow
                    label="Payment status"
                    value={viewModel.statusLabel}
                  />
                  {paymentResult.payment_reference && (
                    <PaymentResultRow
                      label="Payment reference"
                      value={paymentResult.payment_reference}
                    />
                  )}
                  {paymentResult.gateway_transaction_id && (
                    <PaymentResultRow
                      label="Gateway transaction"
                      value={paymentResult.gateway_transaction_id}
                    />
                  )}
                </div>
              ) : (
                <div className="payment-result-empty">
                  <Clock3 size={18} />
                  Payment details are not available yet.
                </div>
              )}

              {message && <div className="payment-result-message">{message}</div>}
            </>
          )}

          <div className="payment-result-actions">
            <button type="button" onClick={loadPaymentResult} disabled={loading}>
              <RefreshCcw size={16} />
              Refresh status
            </button>

            <Link to={menuPath}>
              <ShoppingBag size={16} />
              Back to menu
            </Link>

            <Link className="ghost" to="/">
              <Home size={16} />
              Home
            </Link>
          </div>
        </div>

        <div className="payment-result-note">
          Gateway webhook integration will update the order as paid, failed or
          refunded automatically. Until then, restaurant admin can manually mark
          verified payments from the Orders screen.
        </div>
      </section>
    </main>
  )
}

function PaymentResultRow({ label, value }) {
  return (
    <div className="payment-result-row">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  )
}

function getPaymentResultViewModel({ resultType, paymentResult, gateway }) {
  const status = String(paymentResult?.payment_status || '').toLowerCase()
  const onlineStatus = String(paymentResult?.online_payment_status || '').toLowerCase()
  const normalizedStatus = status || onlineStatus
  const isPaid = normalizedStatus === 'paid'
  const isFailed = ['failed', 'payment_failed', 'cancelled'].includes(normalizedStatus)
  const isRefunded = normalizedStatus === 'refunded'
  const isPending = !isPaid && !isFailed && !isRefunded

  if (resultType === 'failed' || isFailed) {
    return {
      tone: 'failed',
      icon: <XCircle size={44} />,
      kicker: 'Payment failed / cancelled',
      title: 'Payment was not completed',
      description:
        'Your payment was cancelled or failed. The order will remain unpaid unless the restaurant confirms another payment method.',
      statusLabel: 'Payment failed',
    }
  }

  if (isPaid) {
    return {
      tone: 'paid',
      icon: <CheckCircle2 size={44} />,
      kicker: 'Payment successful',
      title: 'Payment confirmed',
      description:
        'Your payment has been confirmed and the restaurant can process the order as paid.',
      statusLabel: 'Paid',
    }
  }

  if (isRefunded) {
    return {
      tone: 'refunded',
      icon: <RefreshCcw size={44} />,
      kicker: 'Payment refunded',
      title: 'Payment was refunded',
      description: 'This payment is marked as refunded in the restaurant order record.',
      statusLabel: 'Refunded',
    }
  }

  return {
    tone: 'pending',
    icon: <Clock3 size={44} />,
    kicker: 'Payment status pending',
    title: resultType === 'success' ? 'Order received, payment is checking' : 'Payment not confirmed yet',
    description: gateway
      ? `${formatGatewayLabel(gateway)} confirmation is pending. Refresh this page after the gateway redirects or the webhook updates the order.`
      : 'Payment confirmation is pending. Refresh this page after the restaurant or gateway updates the order.',
    statusLabel: 'Pending / unpaid',
  }
}

function normalizePaymentResult(data) {
  if (!data) return null

  if (Array.isArray(data)) {
    return data[0] || null
  }

  if (typeof data === 'string') {
    try {
      return normalizePaymentResult(JSON.parse(data))
    } catch {
      return null
    }
  }

  if (typeof data === 'object') {
    if (Object.keys(data).length === 0) return null
    return data
  }

  return null
}

function getLocalPaymentResultSnapshot(orderReference = '') {
  try {
    const normalizedRef = String(orderReference || '').toLowerCase()
    const storedValue =
      (normalizedRef && localStorage.getItem(`spizy_payment_result_${normalizedRef}`)) ||
      localStorage.getItem('spizy_last_payment_result')

    if (!storedValue) return null

    return normalizePaymentResult(JSON.parse(storedValue))
  } catch {
    return null
  }
}

function getStoredCustomerSessionId() {
  try {
    return localStorage.getItem('spizy_customer_session_id') || ''
  } catch {
    return ''
  }
}

function getPaymentMethodLabel(result, fallbackGateway = '') {
  const gateway = result?.payment_gateway || fallbackGateway
  const deliveryType = String(result?.delivery_payment_type || '').toLowerCase()

  if (gateway === 'cod') {
    return deliveryType === 'card' ? 'Card on Delivery' : 'Cash on Delivery'
  }

  if (gateway) return `${formatGatewayLabel(gateway)} online payment`

  return result?.payment_method || result?.payment_method_label || 'Payment'
}

function formatGatewayLabel(gateway = '') {
  const labels = {
    ziina: 'Ziina',
    stripe: 'Stripe',
    paypal: 'PayPal',
    network: 'Network / N-Genius',
    cashfree: 'Cashfree',
    razorpay: 'Razorpay',
    phonepe: 'PhonePe',
    cod: 'COD',
  }

  const normalizedGateway = String(gateway || '').toLowerCase()

  if (!normalizedGateway) return 'Online gateway'

  return labels[normalizedGateway] || normalizedGateway.toUpperCase()
}

function formatMoney(value, currency = 'AED') {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

export default PaymentResultPage
