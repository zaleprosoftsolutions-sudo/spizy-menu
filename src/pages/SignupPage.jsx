import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import {
  createRestaurantSlug,
  getLeadContext,
  resolvePartnerByCode,
  resolveSalesChannel,
} from '../utils/leadTracking'

function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    restaurantName: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const leadContext = getLeadContext()

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
          phone: form.phone.trim(),
          role: 'restaurant_owner',
        },
      },
    })

    if (signupError) {
      setLoading(false)
      setMessage(signupError.message)
      return
    }

    if (!signupData.session) {
      setLoading(false)
      setMessage(
        'Account created. Please check your email to verify, then login to continue.',
      )
      return
    }

    const userId = signupData.user.id
    const salesChannel = await resolveSalesChannel(
      supabase,
      leadContext.salesChannelSlug,
    )
    const partner = await resolvePartnerByCode(supabase, leadContext.refCode)

    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .insert({
        owner_id: userId,
        name: form.restaurantName.trim(),
        slug: createRestaurantSlug(form.restaurantName),
        phone: form.phone.trim(),
        email: form.email.trim(),
        currency: 'AED',
        sales_channel_id: salesChannel?.id || null,
        referred_by_partner_id: partner?.id || null,
        source_url: leadContext.sourceUrl,
        subscription_status: 'trialing',
      })
      .select('id')
      .single()

    if (restaurantError) {
      setLoading(false)
      setMessage(restaurantError.message)
      return
    }

    await supabase.from('lead_attributions').insert({
      visitor_id: leadContext.visitorId,
      partner_id: partner?.id || null,
      sales_channel_id: salesChannel?.id || null,
      restaurant_id: restaurant.id,
      ref_code: leadContext.refCode || null,
      source_url: leadContext.sourceUrl,
      landing_path: leadContext.landingPath,
      utm_source: leadContext.utmSource || null,
      utm_campaign: leadContext.utmCampaign || null,
      signup_started_at: new Date().toISOString(),
      converted_to_trial_at: new Date().toISOString(),
    })

    setLoading(false)
    navigate('/dashboard')
  }

  return (
    <main className="auth-page">
      <section className="auth-card wide">
        <Link to="/" className="auth-back">
          <ArrowLeft size={18} />
          Back to website
        </Link>

        <div className="auth-logo">
          <img src="/spizy-logo.png" alt="Spizy Menu logo" />
        </div>

        <div className="auth-heading">
          <p>Start 7 Days Free</p>
          <h1>Create your restaurant QR menu</h1>
          <span>
            No card required. Your trial starts instantly after restaurant
            signup.
          </span>
        </div>

        <form className="auth-form" onSubmit={handleSignup}>
          <div className="form-grid">
            <label>
              Owner name
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => updateForm('fullName', event.target.value)}
                required
                placeholder="Your full name"
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => updateForm('phone', event.target.value)}
                required
                placeholder="+971..."
              />
            </label>
          </div>

          <label>
            Restaurant name
            <input
              type="text"
              value={form.restaurantName}
              onChange={(event) =>
                updateForm('restaurantName', event.target.value)
              }
              required
              placeholder="Example: Royal Taste Restaurant"
            />
          </label>

          <div className="form-grid">
            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                required
                placeholder="owner@restaurant.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateForm('password', event.target.value)}
                required
                minLength={6}
                placeholder="Minimum 6 characters"
              />
            </label>
          </div>

          {message && <div className="auth-message">{message}</div>}

          <button type="submit" className="primary-button" disabled={loading}>
            <Store size={18} />
            {loading ? 'Creating restaurant...' : 'Create Restaurant'}
          </button>
        </form>

        <p className="auth-footer-text">
          Already registered? <Link to="/login">Login here</Link>
        </p>
      </section>
    </main>
  )
}

export default SignupPage