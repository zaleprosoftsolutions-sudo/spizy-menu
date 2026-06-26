import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProductsManagement from '../../restaurant/ProductsManagement'
import RestaurantOverview from '../../restaurant/RestaurantOverview'
import RestaurantPlaceholder from '../../restaurant/RestaurantPlaceholder'
import RestaurantSidebar from '../../restaurant/RestaurantSidebar'
import NewOrderPOS from '../../restaurant/NewOrderPOS'

const restaurantSections = [
  'overview',
  'pos',
  'orders',
  'products',
  'menu',
  'categories',
  'qr',
  'customers',
  'discounts',
  'campaigns',
  'staff',
  'reviews',
  'reports',
  'settings',
]

function getSafeSection(section) {
  if (!section) return 'overview'

  return restaurantSections.includes(section) ? section : 'overview'
}

function RestaurantDashboard({ profile, restaurant }) {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlSection = useMemo(
    () => getSafeSection(searchParams.get('section')),
    [searchParams],
  )

  const [activeSection, setActiveSection] = useState(urlSection)

  useEffect(() => {
    setActiveSection(urlSection)
  }, [urlSection])

  const handleSectionChange = (section) => {
    const safeSection = getSafeSection(section)

    setActiveSection(safeSection)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', safeSection)

    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="restaurant-layout">
      <RestaurantSidebar
        restaurant={restaurant}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />

      <div className="restaurant-workspace">
        {activeSection === 'overview' && (
          <RestaurantOverview
            profile={profile}
            restaurant={restaurant}
            onOpenSection={handleSectionChange}
          />
        )}

        {activeSection === 'pos' && <NewOrderPOS restaurant={restaurant} />}

        {(activeSection === 'products' ||
          activeSection === 'menu' ||
          activeSection === 'categories') && (
          <ProductsManagement restaurant={restaurant} />
        )}

        {activeSection === 'qr' && (
          <RestaurantPlaceholder
            label="Tables & QR"
            title="Live site QR and table QR"
            text="Manage restaurant public menu link, live QR download and unlimited table-wise QR codes."
          />
        )}

        {activeSection === 'orders' && (
          <RestaurantPlaceholder
            label="Orders"
            title="Table and delivery orders"
            text="Manage order received, preparing, processed, served, out for delivery and completed statuses."
          />
        )}

        {activeSection === 'customers' && (
          <RestaurantPlaceholder
            label="Customers"
            title="Customer list and rewards"
            text="Track customers, repeat orders, rewards, points and customer activity."
          />
        )}

        {activeSection === 'discounts' && (
          <RestaurantPlaceholder
            label="Discounts"
            title="Coupons and offers"
            text="Create restaurant discounts with validity, minimum order amount, usage limit and customer limit."
          />
        )}

        {activeSection === 'campaigns' && (
          <RestaurantPlaceholder
            label="Campaigns"
            title="Banner and countdown campaigns"
            text="Upload promotional banners and show countdown offers on the customer QR menu."
          />
        )}

        {activeSection === 'staff' && (
          <RestaurantPlaceholder
            label="Staff"
            title="Staff access and permissions"
            text="Manage staff users, table assignment and permission-based dashboard access."
          />
        )}

        {activeSection === 'reviews' && (
          <RestaurantPlaceholder
            label="Reviews"
            title="Customer reviews and replies"
            text="View customer reviews, ratings and reply from restaurant dashboard."
          />
        )}

        {activeSection === 'reports' && (
          <RestaurantPlaceholder
            label="Reports"
            title="Sales analytics"
            text="Track sales, best-selling items, orders, customers, discounts and net performance."
          />
        )}

        {activeSection === 'settings' && (
          <RestaurantPlaceholder
            label="Settings"
            title="Restaurant settings"
            text="Manage restaurant profile, logo, delivery fee, currency, outside orders, payment options and schedule."
          />
        )}
      </div>
    </div>
  )
}

export default RestaurantDashboard