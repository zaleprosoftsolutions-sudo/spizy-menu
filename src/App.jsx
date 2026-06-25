import {
  ArrowRight,
  BarChart3,
  Building2,
  ChefHat,
  CreditCard,
  Globe2,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Users,
} from 'lucide-react'
import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero-section">
        <nav className="navbar">
          <div className="brand-block">
            <div className="brand-mark">S</div>
            <div>
              <p className="brand-name">SPIZY</p>
              <p className="brand-subtitle">Menu</p>
            </div>
          </div>

          <div className="nav-actions">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#roadmap">Roadmap</a>
            <button type="button" className="nav-button">
              Restaurant Login
            </button>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-content">
            <div className="eyebrow">
              <Sparkles size={16} />
              Smart QR Menu & Ordering System by ZalePro
            </div>

            <h1>
              Build your restaurant’s digital menu, QR ordering, rewards and
              delivery flow in one place.
            </h1>

            <p className="hero-text">
              Spizy Menu helps restaurants create QR menus, manage table orders,
              accept delivery orders, update items instantly, track customers,
              run discounts, collect reviews, and grow with smart analytics.
            </p>

            <div className="hero-buttons">
              <button type="button" className="primary-button">
                Start 7 Days Free
                <ArrowRight size={18} />
              </button>

              <button type="button" className="secondary-button">
                View Live Demo
              </button>
            </div>

            <div className="hero-stats">
              <div>
                <strong>7 Days</strong>
                <span>Free Trial</span>
              </div>
              <div>
                <strong>AED 55</strong>
                <span>Monthly Plan</span>
              </div>
              <div>
                <strong>AED 499</strong>
                <span>Yearly Plan</span>
              </div>
            </div>
          </div>

          <div className="hero-card">
            <div className="phone-preview">
              <div className="phone-top">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div className="restaurant-card">
                <div className="restaurant-icon">
                  <ChefHat size={30} />
                </div>
                <div>
                  <h3>Royal Taste Restaurant</h3>
                  <p>Scan • Order • Enjoy</p>
                </div>
              </div>

              <div className="qr-preview">
                <QrCode size={92} />
                <div>
                  <h4>Table 05</h4>
                  <p>Dine-in QR detected automatically</p>
                </div>
              </div>

              <div className="order-preview">
                <div>
                  <p>New Table Order</p>
                  <strong>AED 82.50</strong>
                </div>
                <span>Preparing</span>
              </div>

              <div className="menu-list">
                <div>
                  <span>🔥</span>
                  <p>Chicken Biryani</p>
                  <strong>AED 24</strong>
                </div>
                <div>
                  <span>🥤</span>
                  <p>Fresh Juice</p>
                  <strong>AED 12</strong>
                </div>
                <div>
                  <span>🍰</span>
                  <p>Dessert Combo</p>
                  <strong>AED 18</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <div className="section-heading">
          <p>Phase 1 Foundation</p>
          <h2>Everything needed to launch Spizy Menu Web + PWA</h2>
        </div>

        <div className="feature-grid">
          <FeatureCard
            icon={<ShieldCheck />}
            title="Super Admin Control"
            text="Manage restaurants, subscriptions, expenses, partner channels, income, profit and platform analytics."
          />
          <FeatureCard
            icon={<Users />}
            title="Partner Sales Tracking"
            text="Track sales from www.spizy.site, partner links, GCC channel URLs and separate dashboards."
          />
          <FeatureCard
            icon={<Store />}
            title="Restaurant Dashboard"
            text="Restaurant owners can manage items, categories, QR menus, orders, staff, reviews and settings."
          />
          <FeatureCard
            icon={<QrCode />}
            title="Live Site & Table QR"
            text="Automatic live menu QR plus unlimited table-wise QR codes with on/off and delete options."
          />
          <FeatureCard
            icon={<CreditCard />}
            title="Card / Apple Pay"
            text="Use Mamo Pay in backend while showing a clean Pay by Card / Apple Pay experience to users."
          />
          <FeatureCard
            icon={<BarChart3 />}
            title="Smart Analytics"
            text="View trials, paid restaurants, revenue, expenses, net profit, customers, orders and conversion rate."
          />
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="pricing-card">
          <div>
            <p className="pricing-label">Launch Pricing</p>
            <h2>Simple pricing for restaurants</h2>
            <p>
              Restaurants get full access during the 7-day free trial. After
              trial, they can continue with monthly or yearly subscription.
            </p>
          </div>

          <div className="plans">
            <div className="plan-card">
              <h3>Monthly</h3>
              <strong>AED 55</strong>
              <span>per month</span>
            </div>
            <div className="plan-card highlight">
              <h3>Yearly</h3>
              <strong>AED 499</strong>
              <span>per year</span>
            </div>
          </div>
        </div>
      </section>

      <section id="roadmap" className="section roadmap-section">
        <div className="section-heading">
          <p>Build Roadmap</p>
          <h2>We will build in the correct order</h2>
        </div>

        <div className="roadmap-grid">
          <RoadmapItem
            number="01"
            icon={<Globe2 />}
            title="Website + PWA"
            text="Super admin, partner admin, restaurant dashboard, live menu, table QR, customer ordering and notifications."
          />
          <RoadmapItem
            number="02"
            icon={<Smartphone />}
            title="Restaurant App"
            text="Android and iOS app for restaurant owners and staff to manage orders, items, reviews and campaigns."
          />
          <RoadmapItem
            number="03"
            icon={<Building2 />}
            title="Customer App"
            text="Customer app with scan, favourites, orders, hub, rewards, profile and referral system."
          />
        </div>
      </section>
    </main>
  )
}

function FeatureCard({ icon, title, text }) {
  return (
    <article className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function RoadmapItem({ number, icon, title, text }) {
  return (
    <article className="roadmap-card">
      <div className="roadmap-top">
        <span>{number}</span>
        <div>{icon}</div>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

export default App