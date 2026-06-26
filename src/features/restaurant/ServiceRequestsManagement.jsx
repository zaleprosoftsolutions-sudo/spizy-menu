import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Filter,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  Table2,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ServiceRequestsManagement.css'

const statusOptions = [
  { value: 'live', label: 'Live' },
  { value: 'new', label: 'New' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
]

const requestTypeLabels = {
  waiter: 'Call waiter',
  water: 'Water',
  tissue: 'Tissue',
  cutlery: 'Cutlery',
  cleaning: 'Clean table',
  bill: 'Bill help',
  custom: 'Other request',
}

function ServiceRequestsManagement({ restaurant }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [statusFilter, setStatusFilter] = useState('live')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const restaurantId = restaurant?.id

  const showMessage = (text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2800)
  }

  const loadRequests = useCallback(async () => {
    if (!restaurantId) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_service_requests')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(120)

    setLoading(false)

    if (error) {
      showMessage(error.message)
      setRequests([])
      return
    }

    setRequests(data || [])
  }, [restaurantId])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  useEffect(() => {
    if (!restaurantId) return undefined

    const channel = supabase
      .channel(`restaurant-service-requests-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_service_requests',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          loadRequests()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadRequests, restaurantId])

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return requests.filter((request) => {
      if (statusFilter === 'live' && ['completed', 'cancelled'].includes(request.status)) {
        return false
      }

      if (statusFilter !== 'live' && statusFilter !== 'all' && request.status !== statusFilter) {
        return false
      }

      if (!keyword) return true

      return [
        request.request_code,
        request.table_name,
        request.customer_name,
        request.customer_phone,
        request.request_title,
        request.message,
        request.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [requests, search, statusFilter])

  const stats = useMemo(() => {
    return requests.reduce(
      (total, request) => {
        total.all += 1
        if (request.status === 'new') total.new += 1
        if (request.status === 'acknowledged') total.acknowledged += 1
        if (request.status === 'completed') total.completed += 1
        if (!['completed', 'cancelled'].includes(request.status)) total.live += 1
        return total
      },
      { all: 0, live: 0, new: 0, acknowledged: 0, completed: 0 },
    )
  }, [requests])

  const updateRequestStatus = async (request, status) => {
    if (!request?.id) return

    setSavingId(request.id)

    const payload = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'acknowledged') {
      payload.acknowledged_at = new Date().toISOString()
    }

    if (status === 'completed') {
      payload.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('restaurant_service_requests')
      .update(payload)
      .eq('id', request.id)
      .eq('restaurant_id', restaurantId)

    setSavingId('')

    if (error) {
      showMessage(error.message)
      return
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? {
              ...item,
              ...payload,
            }
          : item,
      ),
    )
    showMessage('Service request updated.')
  }

  return (
    <section className="service-requests-page">
      {message && <div className="service-requests-toast">{message}</div>}

      <div className="service-requests-hero">
        <div>
          <p>Table Service</p>
          <h1>Service Requests</h1>
          <span>
            Live waiter calls, water requests, tissue requests and guest help from QR tables.
          </span>
        </div>

        <button type="button" onClick={loadRequests} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="service-requests-stat-grid">
        <ServiceStatCard icon={<BellRing size={20} />} label="Live" value={stats.live} />
        <ServiceStatCard icon={<Clock3 size={20} />} label="New" value={stats.new} />
        <ServiceStatCard icon={<MessageSquareText size={20} />} label="Acknowledged" value={stats.acknowledged} />
        <ServiceStatCard icon={<CheckCircle2 size={20} />} label="Completed" value={stats.completed} />
      </div>

      <div className="service-requests-toolbar">
        <div className="service-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search table, phone, request or note..."
          />
        </div>

        <div className="service-filter-row">
          <Filter size={17} />
          {statusOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={statusFilter === option.value ? 'active' : ''}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="service-empty-state">Loading service requests...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="service-empty-state">
          <BellRing size={34} />
          <strong>No service requests found</strong>
          <span>New QR table requests will appear here instantly.</span>
        </div>
      ) : (
        <div className="service-request-grid">
          {filteredRequests.map((request) => (
            <ServiceRequestCard
              key={request.id}
              request={request}
              saving={savingId === request.id}
              onUpdateStatus={updateRequestStatus}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ServiceStatCard({ icon, label, value }) {
  return (
    <article className="service-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function ServiceRequestCard({ request, saving, onUpdateStatus }) {
  const requestLabel = request.request_title || requestTypeLabels[request.request_type] || 'Service request'
  const requestPhone = String(request.customer_phone || '').trim()

  return (
    <article className={`service-request-card status-${request.status || 'new'}`}>
      <div className="service-card-top">
        <div>
          <span>{request.request_code || 'Request'}</span>
          <h3>{requestLabel}</h3>
        </div>

        <ServiceStatusPill status={request.status} />
      </div>

      <div className="service-table-line">
        <Table2 size={18} />
        <strong>{request.table_name || 'Table'}</strong>
        <span>{formatServiceDate(request.created_at)}</span>
      </div>

      {(request.customer_name || requestPhone) && (
        <div className="service-customer-box">
          <span>{request.customer_name || 'Customer'}</span>
          {requestPhone && (
            <a href={`tel:${requestPhone}`}>
              <Phone size={15} />
              {requestPhone}
            </a>
          )}
        </div>
      )}

      {request.message && <p className="service-message">{request.message}</p>}

      <div className="service-action-row">
        {request.status === 'new' && (
          <button
            type="button"
            onClick={() => onUpdateStatus(request, 'acknowledged')}
            disabled={saving}
          >
            <Clock3 size={16} />
            Acknowledge
          </button>
        )}

        {!['completed', 'cancelled'].includes(request.status) && (
          <button
            type="button"
            className="complete"
            onClick={() => onUpdateStatus(request, 'completed')}
            disabled={saving}
          >
            <CheckCircle2 size={16} />
            Complete
          </button>
        )}

        {request.status !== 'cancelled' && request.status !== 'completed' && (
          <button
            type="button"
            className="cancel"
            onClick={() => onUpdateStatus(request, 'cancelled')}
            disabled={saving}
          >
            <XCircle size={16} />
            Cancel
          </button>
        )}
      </div>
    </article>
  )
}

function ServiceStatusPill({ status }) {
  if (status === 'acknowledged') return <span className="service-status-pill acknowledged">Acknowledged</span>
  if (status === 'completed') return <span className="service-status-pill completed">Completed</span>
  if (status === 'cancelled') return <span className="service-status-pill cancelled">Cancelled</span>
  return <span className="service-status-pill new">New</span>
}

function formatServiceDate(value) {
  if (!value) return 'Just now'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Just now'
  }
}

export default ServiceRequestsManagement
