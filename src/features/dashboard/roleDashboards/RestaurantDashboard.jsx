import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProductsManagement from '../../restaurant/ProductsManagement'
import RestaurantOverview from '../../restaurant/RestaurantOverview'
import RestaurantPlaceholder from '../../restaurant/RestaurantPlaceholder'
import RestaurantSidebar from '../../restaurant/RestaurantSidebar'
import NewOrderPOS from '../../restaurant/NewOrderPOS'
import OrdersManagement from '../../restaurant/OrdersManagement'
import KitchenDisplay from '../../restaurant/KitchenDisplay'
import DeliveryManagement from '../../restaurant/DeliveryManagement'
import InventoryManagement from '../../restaurant/InventoryManagement'
import PurchasesManagement from '../../restaurant/PurchasesManagement'
import ExpensesManagement from '../../restaurant/ExpensesManagement'
import FinanceManagement from '../../restaurant/FinanceManagement'
import TablesQRManagement from '../../restaurant/TablesQRManagement'
import CustomersManagement from '../../restaurant/CustomersManagement'
import DiscountsManagement from '../../restaurant/DiscountsManagement'
import CampaignsManagement from '../../restaurant/CampaignsManagement'
import ReviewsManagement from '../../restaurant/ReviewsManagement'
import ReportsManagement from '../../restaurant/ReportsManagement'
import StaffManagement from '../../restaurant/StaffManagement'
import SettingsManagement from '../../restaurant/SettingsManagement'

const restaurantSections = [
  'overview',
  'pos',
  'orders',
  'kitchen',
  'delivery',
  'products',
  'menu',
  'categories',
  'qr',
  'inventory',
  'purchases',
  'expenses',
  'finance',
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
          <TablesQRManagement restaurant={restaurant} />
        )}

        {activeSection === 'orders' && (
          <OrdersManagement restaurant={restaurant} />
        )}

        {activeSection === 'inventory' && (
          <InventoryManagement restaurant={restaurant} />
        )}

        {activeSection === 'purchases' && (
          <PurchasesManagement restaurant={restaurant} />
        )}

        {activeSection === 'expenses' && (
          <ExpensesManagement restaurant={restaurant} />
        )}

        {activeSection === 'finance' && (
          <FinanceManagement restaurant={restaurant} />
        )}

        {activeSection === 'kitchen' && (
          <KitchenDisplay restaurant={restaurant} />
        )}

        {activeSection === 'delivery' && (
          <DeliveryManagement restaurant={restaurant} />
        )}

        {activeSection === 'customers' && (
          <CustomersManagement restaurant={restaurant} />
        )}

        {activeSection === 'discounts' && (
          <DiscountsManagement restaurant={restaurant} />
        )}

        {activeSection === 'campaigns' && (
          <CampaignsManagement restaurant={restaurant} />
        )}

        {activeSection === 'staff' && <StaffManagement restaurant={restaurant} />}

        {activeSection === 'reviews' && (
          <ReviewsManagement restaurant={restaurant} />
        )}

        {activeSection === 'reports' && (
          <ReportsManagement restaurant={restaurant} />
        )}

        {activeSection === 'settings' && (
          <SettingsManagement restaurant={restaurant} />
        )}
      </div>
    </div>
  )
}

export default RestaurantDashboard
