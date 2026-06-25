import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    })

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    navigate('/dashboard')
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link to="/" className="auth-back">
          <ArrowLeft size={18} />
          Back to website
        </Link>

        <div className="auth-logo">
          <img src="/spizy-logo.png" alt="Spizy Menu logo" />
        </div>

        <div className="auth-heading">
          <p>Restaurant Login</p>
          <h1>Welcome back to Spizy Menu</h1>
          <span>Manage your QR menu, orders, items and restaurant growth.</span>
        </div>

        <form className="auth-form" onSubmit={handleLogin}>
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
              placeholder="Enter your password"
            />
          </label>

          {message && <div className="auth-message">{message}</div>}

          <button type="submit" className="primary-button" disabled={loading}>
            <LockKeyhole size={18} />
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="auth-footer-text">
          New restaurant? <Link to="/signup">Start 7 days free</Link>
        </p>
      </section>
    </main>
  )
}

export default LoginPage