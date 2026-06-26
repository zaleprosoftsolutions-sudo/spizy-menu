import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  MessageSquareReply,
  RefreshCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ReviewsManagement.css'

const ratingFilters = [
  { value: 'all', label: 'All ratings' },
  { value: '5', label: '5 stars' },
  { value: '4', label: '4 stars' },
  { value: '3', label: '3 stars' },
  { value: '2', label: '2 stars' },
  { value: '1', label: '1 star' },
]

function ReviewsManagement({ restaurant }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState('all')
  const [replyReview, setReplyReview] = useState(null)
  const [replyText, setReplyText] = useState('')

  const loadReviews = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data } = await supabase
      .from('restaurant_reviews')
      .select(
        `
          *,
          order:restaurant_orders (
            id,
            order_code,
            public_order_number,
            order_type,
            table_name,
            total_amount,
            currency,
            created_at
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    setReviews(data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  const refreshReviews = async () => {
    setRefreshing(true)
    await loadReviews()
    setRefreshing(false)
  }

  const filteredReviews = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return reviews.filter((review) => {
      if (ratingFilter !== 'all' && Number(review.rating) !== Number(ratingFilter)) {
        return false
      }

      if (visibilityFilter === 'visible' && !review.is_visible) return false
      if (visibilityFilter === 'hidden' && review.is_visible) return false
      if (visibilityFilter === 'replied' && !review.reply) return false
      if (visibilityFilter === 'unreplied' && review.reply) return false

      if (!keyword) return true

      return [
        review.customer_name,
        review.customer_phone,
        review.comment,
        review.reply,
        review.order?.order_code,
        review.order?.public_order_number,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [reviews, ratingFilter, search, visibilityFilter])

  const stats = useMemo(() => {
    const totalReviews = reviews.length
    const visibleReviews = reviews.filter((review) => review.is_visible).length
    const hiddenReviews = reviews.filter((review) => !review.is_visible).length
    const repliedReviews = reviews.filter((review) => review.reply).length
    const averageRating =
      totalReviews > 0
        ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) /
          totalReviews
        : 0

    return {
      totalReviews,
      visibleReviews,
      hiddenReviews,
      repliedReviews,
      averageRating,
    }
  }, [reviews])

  const toggleReviewVisibility = async (review) => {
    setUpdatingId(review.id)

    const { data, error } = await supabase
      .from('restaurant_reviews')
      .update({
        is_visible: !review.is_visible,
        updated_at: new Date().toISOString(),
      })
      .eq('id', review.id)
      .select('*, order:restaurant_orders(id, order_code, public_order_number, order_type, table_name, total_amount, currency, created_at)')
      .single()

    setUpdatingId('')

    if (error) return

    replaceReview(data)
  }

  const openReplyModal = (review) => {
    setReplyReview(review)
    setReplyText(review.reply || '')
  }

  const saveReply = async () => {
    if (!replyReview?.id) return

    setUpdatingId(replyReview.id)

    const { data, error } = await supabase
      .from('restaurant_reviews')
      .update({
        reply: replyText.trim() || null,
        replied_at: replyText.trim() ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', replyReview.id)
      .select('*, order:restaurant_orders(id, order_code, public_order_number, order_type, table_name, total_amount, currency, created_at)')
      .single()

    setUpdatingId('')

    if (error) return

    replaceReview(data)
    setReplyReview(null)
    setReplyText('')
  }

  const deleteReview = async (review) => {
    setUpdatingId(review.id)

    const { error } = await supabase
      .from('restaurant_reviews')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', review.id)

    setUpdatingId('')

    if (error) return

    setReviews((current) => current.filter((item) => item.id !== review.id))
    if (replyReview?.id === review.id) setReplyReview(null)
  }

  const replaceReview = (updatedReview) => {
    setReviews((current) =>
      current.map((review) =>
        review.id === updatedReview.id ? updatedReview : review,
      ),
    )

    setReplyReview((current) =>
      current?.id === updatedReview.id ? updatedReview : current,
    )
  }

  if (loading) {
    return (
      <section className="management-section reviews-screen">
        <div className="reviews-empty-state">
          <Star size={36} />
          <h2>Loading reviews...</h2>
          <p>Please wait while Spizy loads customer feedback.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section reviews-screen">
      <header className="reviews-header">
        <div>
          <p className="section-kicker">Reviews</p>
          <h2>Customer reviews</h2>
          <span>
            Read customer ratings, hide unwanted feedback and reply to reviews.
          </span>
        </div>

        <button
          type="button"
          className="reviews-refresh-button"
          onClick={refreshReviews}
          disabled={refreshing}
        >
          <RefreshCcw size={16} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <div className="reviews-stats-grid">
        <ReviewStat label="Average rating" value={stats.averageRating.toFixed(1)} />
        <ReviewStat label="Total reviews" value={stats.totalReviews} />
        <ReviewStat label="Visible" value={stats.visibleReviews} />
        <ReviewStat label="Hidden" value={stats.hiddenReviews} />
        <ReviewStat label="Replied" value={stats.repliedReviews} />
      </div>

      <div className="reviews-toolbar">
        <div className="reviews-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, phone, order or review..."
          />
        </div>

        <select
          value={ratingFilter}
          onChange={(event) => setRatingFilter(event.target.value)}
        >
          {ratingFilters.map((filter) => (
            <option value={filter.value} key={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>

        <select
          value={visibilityFilter}
          onChange={(event) => setVisibilityFilter(event.target.value)}
        >
          <option value="all">All visibility</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
          <option value="replied">Replied</option>
          <option value="unreplied">Unreplied</option>
        </select>
      </div>

      {filteredReviews.length === 0 ? (
        <div className="reviews-empty-state">
          <Star size={36} />
          <h2>No reviews found</h2>
          <p>
            Completed customer orders can be rated from the customer Orders tab.
          </p>
        </div>
      ) : (
        <div className="reviews-list">
          {filteredReviews.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              updating={updatingId === review.id}
              onReply={openReplyModal}
              onToggleVisibility={toggleReviewVisibility}
              onDelete={deleteReview}
            />
          ))}
        </div>
      )}

      {replyReview && (
        <ReviewReplyModal
          review={replyReview}
          replyText={replyText}
          saving={updatingId === replyReview.id}
          onClose={() => setReplyReview(null)}
          onChange={setReplyText}
          onSave={saveReply}
        />
      )}
    </section>
  )
}

function ReviewStat({ label, value }) {
  return (
    <div className="reviews-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ReviewRow({ review, updating, onReply, onToggleVisibility, onDelete }) {
  return (
    <article className={`review-row ${review.is_visible ? 'visible' : 'hidden'}`}>
      <div className="review-customer-cell">
        <div className="review-avatar">
          {getCustomerInitials(review.customer_name, review.customer_phone)}
        </div>

        <div>
          <strong>{review.customer_name || 'Guest customer'}</strong>
          <span>{review.customer_phone || 'No phone'}</span>
          <small>
            Order #{getPublicOrderNumber(review.order?.public_order_number || review.order?.order_code)}
          </small>
        </div>
      </div>

      <div className="review-rating-cell">
        <StarRating rating={review.rating} />
        <span>{formatDate(review.created_at)}</span>
      </div>

      <div className="review-comment-cell">
        <p>{review.comment || 'No written comment.'}</p>
        {review.reply && (
          <div className="review-reply-preview">
            <strong>Reply:</strong> {review.reply}
          </div>
        )}
      </div>

      <div className="review-status-cell">
        <span className={review.is_visible ? 'active' : 'hidden'}>
          {review.is_visible ? 'Visible' : 'Hidden'}
        </span>
      </div>

      <div className="review-actions-cell">
        <button type="button" onClick={() => onReply(review)} disabled={updating}>
          <MessageSquareReply size={15} />
          Reply
        </button>

        <button
          type="button"
          onClick={() => onToggleVisibility(review)}
          disabled={updating}
        >
          {review.is_visible ? <EyeOff size={15} /> : <Eye size={15} />}
          {review.is_visible ? 'Hide' : 'Show'}
        </button>

        <button
          type="button"
          className="danger"
          onClick={() => onDelete(review)}
          disabled={updating}
        >
          <Trash2 size={15} />
          Delete
        </button>
      </div>
    </article>
  )
}

function ReviewReplyModal({ review, replyText, saving, onClose, onChange, onSave }) {
  return (
    <div className="reviews-modal-overlay" onClick={onClose}>
      <div
        className="reviews-reply-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="reviews-modal-head">
          <div>
            <p className="section-kicker">Reply</p>
            <h2>{review.customer_name || 'Guest customer'}</h2>
            <span>Public reply to customer review.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="reviews-original-box">
          <StarRating rating={review.rating} />
          <p>{review.comment || 'No written comment.'}</p>
        </div>

        <label className="reviews-reply-field">
          Your reply
          <textarea
            value={replyText}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Thank you for your feedback..."
            rows="5"
          />
        </label>

        <button
          type="button"
          className="reviews-save-reply-button"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save reply'}
        </button>
      </div>
    </div>
  )
}

function StarRating({ rating }) {
  const ratingValue = Number(rating || 0)

  return (
    <div className="review-stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          size={16}
          key={star}
          className={star <= ratingValue ? 'filled' : ''}
        />
      ))}
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

function getPublicOrderNumber(orderCode) {
  const value = String(orderCode || '')

  if (!value.includes('-')) return value || 'Order'

  return value.split('-').pop()
}

function formatDate(value) {
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

export default ReviewsManagement
