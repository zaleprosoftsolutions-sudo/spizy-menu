import { Users } from 'lucide-react'

function CustomerDashboard({ profile }) {
  return (
    <div className="dashboard-hero">
      <div>
        <p className="pricing-label">Customer Account</p>
        <h1>Welcome, {profile?.full_name || 'Customer'}</h1>
        <p>
          Customer ordering, saved restaurants, rewards and profile management
          will be added in the customer phase.
        </p>
      </div>

      <div className="dashboard-icon">
        <Users size={42} />
      </div>
    </div>
  )
}

export default CustomerDashboard