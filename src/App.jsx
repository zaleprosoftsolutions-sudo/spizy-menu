import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PublicMenuPage from './pages/PublicMenuPage'
import PaymentResultPage from './pages/PaymentResultPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/gcc" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/menu/:restaurantSlug" element={<PublicMenuPage />} />
      <Route path="/payment/success" element={<PaymentResultPage resultType="success" />} />
      <Route path="/payment/failed" element={<PaymentResultPage resultType="failed" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
