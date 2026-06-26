import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProductsManagement from '../../restaurant/ProductsManagement'
import RestaurantOverview from '../../restaurant/RestaurantOverview'
import RestaurantPlaceholder from '../../restaurant/RestaurantPlaceholder'
import RestaurantSidebar from '../../restaurant/RestaurantSidebar'
import NewOrderPOS from '../../restaurant/NewOrderPOS'
import OrdersManagement from '../../restaurant/OrdersManagement'
import TableFloorManagement from '../../restaurant/TableFloorManagement'
import NotificationsCenter from '../../restaurant/NotificationsCenter'
import KitchenDisplay from '../../restaurant/KitchenDisplay'
import DeliveryManagement from '../../restaurant/DeliveryManagement'
import ReservationsManagement from '../../restaurant/ReservationsManagement'
import ServiceRequestsManagement from '../../restaurant/ServiceRequestsManagement'
import InventoryManagement from '../../restaurant/InventoryManagement'
import RecipesManagement from '../../restaurant/RecipesManagement'
import ModifierGroupsManagement from '../../restaurant/ModifierGroupsManagement'
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
import StaffAttendanceManagement from '../../restaurant/StaffAttendanceManagement'
import PayrollManagement from '../../restaurant/PayrollManagement'
import SettingsManagement from '../../restaurant/SettingsManagement'
import PrintSettingsManagement from '../../restaurant/PrintSettingsManagement'

const restaurantSections = [
  'overview',
  'pos',
  'alerts',
  'orders',
  'floor',
  'kitchen',
  'delivery',
  'reservations',
  'service-requests',
  'products',
  'menu',
  'categories',
  'qr',
  'inventory',
  'recipes',
  'modifiers',
  'purchases',
  'expenses',
  'finance',
  'customers',
  'discounts',
  'campaigns',
  'staff',
  'attendance',
  'payroll',
  'reviews',
  'reports',
  'printers',
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

        {activeSection === 'alerts' && (
          <NotificationsCenter
            restaurant={restaurant}
            onOpenSection={handleSectionChange}
          />
        )}

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

        {activeSection === 'floor' && (
          <TableFloorManagement restaurant={restaurant} onOpenSection={handleSectionChange} />
        )}

        {activeSection === 'inventory' && (
          <InventoryManagement restaurant={restaurant} />
        )}

        {activeSection === 'recipes' && (
          <RecipesManagement restaurant={restaurant} />
        )}

        {activeSection === 'modifiers' && (
          <ModifierGroupsManagement restaurant={restaurant} />
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

        {activeSection === 'reservations' && (
          <ReservationsManagement restaurant={restaurant} />
        )}

        {activeSection === 'service-requests' && (
          <ServiceRequestsManagement restaurant={restaurant} />
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

        {activeSection === 'attendance' && (
          <StaffAttendanceManagement restaurant={restaurant} />
        )}

        {activeSection === 'payroll' && (
          <PayrollManagement restaurant={restaurant} />
        )}

        {activeSection === 'reviews' && (
          <ReviewsManagement restaurant={restaurant} />
        )}

        {activeSection === 'reports' && (
          <ReportsManagement restaurant={restaurant} />
        )}

        {activeSection === 'printers' && (
          <PrintSettingsManagement restaurant={restaurant} />
        )}

        {activeSection === 'settings' && (
          <SettingsManagement restaurant={restaurant} />
        )}
      </div>
    </div>
  )
}

export default RestaurantDashboard
