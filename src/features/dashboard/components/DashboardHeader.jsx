import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'

function DashboardHeader({ profile, onLogout }) {
  return (
    <div className="dashboard-top">
      <Link to="/" className="brand-block">
        <div className="brand-mark logo-mark">
          <img src="/spizy-logo.png" alt="Spizy Menu logo" />
        </div>
        <div>
          <p className="brand-name">SPIZY</p>
          <p className="brand-subtitle">Menu</p>
        </div>
      </Link>

      <div className="dashboard-user-actions">
        <div className="dashboard-user-pill">
          <span>{profile?.role?.replaceAll('_', ' ') || 'User'}</span>
          <strong>{profile?.full_name || profile?.email || 'Spizy User'}</strong>
        </div>

        <button type="button" className="secondary-button" onClick={onLogout}>
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  )
}

export default DashboardHeader