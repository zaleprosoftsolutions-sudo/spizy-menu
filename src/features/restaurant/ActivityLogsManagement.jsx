import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarDays,
  Clock3,
  DatabaseZap,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './ActivityLogsManagement.css'

const rangeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

const actionOptions = [
  { value: 'all', label: 'All actions' },
  { value: 'insert', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
]

function ActivityLogsManagement({ restaurant }) {
  const { showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [rangeFilter, setRangeFilter] = useState('7d')
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')

  const loadLogs = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    let query = supabase
      .from('restaurant_activity_logs')
      .select(
        `
          id,
          restaurant_id,
          actor_id,
          action_type,
          entity_type,
          entity_id,
          title,
          description,
          metadata,
          created_at
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(300)

    const dateFrom = getDateFromRange(rangeFilter)

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString())
    }

    if (actionFilter !== 'all') {
      query = query.eq('action_type', actionFilter)
    }

    if (entityFilter !== 'all') {
      query = query.eq('entity_type', entityFilter)
    }

    const { data, error } = await query

    setLoading(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Activity loading failed',
        message: error.message,
      })
      setLogs([])
      return
    }

    setLogs(data || [])
  }, [actionFilter, entityFilter, rangeFilter, restaurant?.id, showToast])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (!restaurant?.id) return undefined

    const channel = supabase
      .channel(`restaurant-activity-${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'restaurant_activity_logs',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          setLogs((current) => [payload.new, ...current].slice(0, 300))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant?.id])

  const entityOptions = useMemo(() => {
    const uniqueEntities = Array.from(
      new Set(logs.map((log) => log.entity_type).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))

    return [
      { value: 'all', label: 'All modules' },
      ...uniqueEntities.map((entity) => ({
        value: entity,
        label: formatEntity(entity),
      })),
    ]
  }, [logs])

  const visibleLogs = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return logs

    return logs.filter((log) =>
      [
        log.title,
        log.description,
        log.entity_type,
        log.action_type,
        log.metadata?.label,
        log.metadata?.order_code,
        log.metadata?.customer_name,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      ),
    )
  }, [logs, search])

  const stats = useMemo(() => {
    const created = logs.filter((log) => log.action_type === 'insert').length
    const updated = logs.filter((log) => log.action_type === 'update').length
    const deleted = logs.filter((log) => log.action_type === 'delete').length
    const modules = new Set(logs.map((log) => log.entity_type)).size

    return {
      total: logs.length,
      created,
      updated,
      deleted,
      modules,
    }
  }, [logs])

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
    <section className="activity-logs-screen">
      <div className="activity-logs-hero">
        <div>
          <p className="pricing-label">Admin audit trail</p>
          <h2>Activity Logs</h2>
          <span>
            Track important changes across orders, menu, staff, payments,
            inventory, settings and daily operations.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadLogs}
          disabled={loading}
        >
          <RefreshCw size={18} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="activity-stat-grid">
        <ActivityStatCard
          icon={<ShieldCheck size={22} />}
          label="Tracked logs"
          value={stats.total}
          text="Latest 300 records"
        />
        <ActivityStatCard
          icon={<DatabaseZap size={22} />}
          label="Created"
          value={stats.created}
          text="New records"
        />
        <ActivityStatCard
          icon={<Activity size={22} />}
          label="Updated"
          value={stats.updated}
          text="Changed records"
        />
        <ActivityStatCard
          icon={<Filter size={22} />}
          label="Modules"
          value={stats.modules}
          text="Touched areas"
        />
      </div>

      <div className="activity-filter-card">
        <div className="activity-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search activity, order, module, customer..."
          />
        </div>

        <select
          value={rangeFilter}
          onChange={(event) => setRangeFilter(event.target.value)}
        >
          {rangeOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
        >
          {actionOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={(event) => setEntityFilter(event.target.value)}
        >
          {entityOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="activity-log-card">
        <div className="activity-log-head">
          <div>
            <h3>Timeline</h3>
            <span>
              {visibleLogs.length} visible record
              {visibleLogs.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="activity-live-pill">
            <span />
            Live tracking
          </div>
        </div>

        {loading ? (
          <div className="activity-empty-state">Loading activity logs...</div>
        ) : visibleLogs.length === 0 ? (
          <div className="activity-empty-state">
            No activity logs found for this filter. New actions will appear here
            automatically after the SQL trigger is active.
          </div>
        ) : (
          <div className="activity-timeline">
            {visibleLogs.map((log) => (
              <ActivityTimelineRow log={log} key={log.id} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ActivityStatCard({ icon, label, value, text }) {
  return (
    <article className="activity-stat-card">
      <div className="activity-stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{text}</small>
    </article>
  )
}

function ActivityTimelineRow({ log }) {
  return (
    <article className={`activity-row action-${log.action_type || 'update'}`}>
      <div className="activity-row-dot" />

      <div className="activity-row-main">
        <div className="activity-row-top">
          <div>
            <span className="activity-row-module">
              {formatEntity(log.entity_type)}
            </span>
            <h4>{log.title || 'Activity recorded'}</h4>
          </div>

          <ActionPill action={log.action_type} />
        </div>

        {log.description && <p>{log.description}</p>}

        <div className="activity-row-meta">
          <span>
            <Clock3 size={14} />
            {formatActivityDate(log.created_at)}
          </span>
          <span>
            <CalendarDays size={14} />
            {timeAgo(log.created_at)}
          </span>
          <span>
            <UserRound size={14} />
            {log.actor_id ? 'Logged-in user' : 'System / public action'}
          </span>
        </div>
      </div>
    </article>
  )
}

function ActionPill({ action }) {
  return <span className={`activity-action-pill ${action}`}>{formatAction(action)}</span>
}

function getDateFromRange(range) {
  const now = new Date()

  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  return null
}

function formatEntity(value) {
  return String(value || 'activity')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatAction(value) {
  if (value === 'insert') return 'Created'
  if (value === 'delete') return 'Deleted'
  if (value === 'update') return 'Updated'
  return 'Activity'
}

function formatActivityDate(value) {
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

function timeAgo(value) {
  const date = value ? new Date(value) : new Date()
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0)

  if (diffMinutes < 1) return 'Now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export default ActivityLogsManagement
