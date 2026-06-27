import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import ProductsManagement from '../../restaurant/ProductsManagement'
import RestaurantOverview from '../../restaurant/RestaurantOverview'
import RestaurantPlaceholder from '../../restaurant/RestaurantPlaceholder'
import RestaurantSidebar from '../../restaurant/RestaurantSidebar'
import NewOrderPOS from '../../restaurant/NewOrderPOS'
import OrdersManagement from '../../restaurant/OrdersManagement'
import CustomerPaymentsManagement from '../../restaurant/CustomerPaymentsManagement'
import DayClosingManagement from '../../restaurant/DayClosingManagement'
import TableFloorManagement from '../../restaurant/TableFloorManagement'
import NotificationsCenter from '../../restaurant/NotificationsCenter'
import KitchenDisplay from '../../restaurant/KitchenDisplay'
import DeliveryManagement from '../../restaurant/DeliveryManagement'
import DeliveryZonesManagement from '../../restaurant/DeliveryZonesManagement'
import ReservationsManagement from '../../restaurant/ReservationsManagement'
import ServiceRequestsManagement from '../../restaurant/ServiceRequestsManagement'
import InventoryManagement from '../../restaurant/InventoryManagement'
import BranchStockTransfersManagement from '../../restaurant/BranchStockTransfersManagement'
import RecipesManagement from '../../restaurant/RecipesManagement'
import ModifierGroupsManagement from '../../restaurant/ModifierGroupsManagement'
import PurchasesManagement from '../../restaurant/PurchasesManagement'
import SupplierPaymentsManagement from '../../restaurant/SupplierPaymentsManagement'
import ExpensesManagement from '../../restaurant/ExpensesManagement'
import FinanceManagement from '../../restaurant/FinanceManagement'
import CashBankManagement from '../../restaurant/CashBankManagement'
import TaxInvoicesManagement from '../../restaurant/TaxInvoicesManagement'
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
import ActivityLogsManagement from '../../restaurant/ActivityLogsManagement'
import DataExportManagement from '../../restaurant/DataExportManagement'
import DataImportManagement from '../../restaurant/DataImportManagement'
import BranchesManagement from '../../restaurant/BranchesManagement'
import '../../restaurant/StaffAccessGuard.css'


const fullAccessRoles = new Set([
  'super_admin',
  'partner_admin',
  'restaurant_owner',
])

const defaultStaffPermissions = {
  pos: false,
  orders: false,
  menu: false,
  customers: false,
  reports: false,
  settings: false,
}

const sectionPermissionMap = {
  overview: ['always'],
  alerts: ['pos', 'orders', 'menu', 'customers', 'reports', 'settings'],
  pos: ['pos'],
  floor: ['pos', 'orders'],
  orders: ['orders'],
  'customer-payments': ['orders', 'customers'],
  'day-closing': ['orders', 'reports'],
  kitchen: ['orders'],
  delivery: ['orders'],
  'delivery-zones': ['menu', 'settings'],
  reservations: ['orders'],
  'service-requests': ['orders'],
  products: ['menu'],
  menu: ['menu'],
  categories: ['menu'],
  qr: ['menu'],
  inventory: ['menu'],
  'branch-stock': ['menu'],
  recipes: ['menu'],
  modifiers: ['menu'],
  purchases: ['menu'],
  'supplier-payments': ['menu', 'reports'],
  expenses: ['reports'],
  finance: ['reports'],
  'cash-bank': ['reports'],
  'tax-invoices': ['reports'],
  customers: ['customers'],
  discounts: ['customers'],
  campaigns: ['customers'],
  reviews: ['customers'],
  reports: ['reports'],
  staff: ['settings'],
  attendance: ['settings'],
  payroll: ['settings'],
  printers: ['settings'],
  'activity-logs': ['reports', 'settings'],
  'data-export': ['reports', 'settings'],
  'data-import': ['settings'],
  branches: ['settings'],
  settings: ['settings'],
}

function normalizeStaffPermissions(value) {
  if (!value || typeof value !== 'object') return defaultStaffPermissions

  return {
    ...defaultStaffPermissions,
    ...value,
  }
}

function shouldLimitByStaffPermissions(profile) {
  if (fullAccessRoles.has(profile?.role)) return false

  return profile?.role === 'restaurant_staff'
}

function hasSectionPermission(section, accessState) {
  if (!accessState?.isLimited) return true

  if (section === 'overview') return true
  if (!accessState?.staff?.is_active) return false

  const requiredPermissions = sectionPermissionMap[section] || ['settings']

  if (requiredPermissions.includes('always')) return true

  return requiredPermissions.some(
    (permissionKey) => accessState.permissions?.[permissionKey] === true,
  )
}

const restaurantSections = [
  'overview',
  'pos',
  'alerts',
  'orders',
  'customer-payments',
  'day-closing',
  'floor',
  'kitchen',
  'delivery',
  'delivery-zones',
  'reservations',
  'service-requests',
  'products',
  'menu',
  'categories',
  'qr',
  'inventory',
  'branch-stock',
  'recipes',
  'modifiers',
  'purchases',
  'supplier-payments',
  'expenses',
  'finance',
  'cash-bank',
  'tax-invoices',
  'customers',
  'discounts',
  'campaigns',
  'staff',
  'attendance',
  'payroll',
  'reviews',
  'reports',
  'printers',
  'activity-logs',
  'data-export',
  'data-import',
  'branches',
  'settings',
]

function getSafeSection(section) {
  if (!section) return 'overview'

  return restaurantSections.includes(section) ? section : 'overview'
}

function RestaurantDashboard({ profile, restaurant }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [staffAccess, setStaffAccess] = useState({
    loading: shouldLimitByStaffPermissions(profile),
    isLimited: shouldLimitByStaffPermissions(profile),
    staff: null,
    permissions: defaultStaffPermissions,
    message: '',
  })

  const urlSection = useMemo(
    () => getSafeSection(searchParams.get('section')),
    [searchParams],
  )

  const [activeSection, setActiveSection] = useState(urlSection)

  const allowedSections = useMemo(() => {
    return restaurantSections.filter((section) =>
      hasSectionPermission(section, staffAccess),
    )
  }, [staffAccess])

  const handleSectionChange = (section) => {
    const safeSection = getSafeSection(section)
    const nextSection = allowedSections.includes(safeSection)
      ? safeSection
      : 'overview'

    setActiveSection(nextSection)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextSection)

    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    setActiveSection(urlSection)
  }, [urlSection])

  useEffect(() => {
    let cancelled = false

    async function loadStaffAccess() {
      if (!restaurant?.id || !shouldLimitByStaffPermissions(profile)) {
        if (!cancelled) {
          setStaffAccess({
            loading: false,
            isLimited: false,
            staff: null,
            permissions: {
              pos: true,
              orders: true,
              menu: true,
              customers: true,
              reports: true,
              settings: true,
            },
            message: '',
          })
        }
        return
      }

      if (!cancelled) {
        setStaffAccess((current) => ({
          ...current,
          loading: true,
          isLimited: true,
          message: 'Checking staff access...',
        }))
      }

      const { data: userData } = await supabase.auth.getUser()
      const activeEmail = userData?.user?.email || profile?.email || ''

      if (!activeEmail) {
        if (!cancelled) {
          setStaffAccess({
            loading: false,
            isLimited: true,
            staff: null,
            permissions: defaultStaffPermissions,
            message: 'Staff email was not found. Ask the restaurant owner to add this login email in Staff settings.',
          })
        }
        return
      }

      const { data, error } = await supabase
        .from('restaurant_staffs')
        .select('id, staff_name, email, staff_role, permissions, is_active')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .ilike('email', activeEmail)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setStaffAccess({
          loading: false,
          isLimited: true,
          staff: null,
          permissions: defaultStaffPermissions,
          message:
            error?.message ||
            'No staff profile is linked to this login email. Ask the owner to add this email in Staff settings.',
        })
        return
      }

      setStaffAccess({
        loading: false,
        isLimited: true,
        staff: data,
        permissions: normalizeStaffPermissions(data.permissions),
        message: data.is_active
          ? ''
          : 'This staff profile is inactive. Ask the owner or manager to reactivate access.',
      })
    }

    loadStaffAccess()

    return () => {
      cancelled = true
    }
  }, [profile, restaurant?.id])

  useEffect(() => {
    if (staffAccess.loading) return
    if (allowedSections.includes(activeSection)) return

    handleSectionChange('overview')
  }, [activeSection, allowedSections, staffAccess.loading])

  if (staffAccess.loading) {
    return (
      <div className="restaurant-layout">
        <RestaurantSidebar
          restaurant={restaurant}
          activeSection="overview"
          onSectionChange={() => {}}
          allowedSections={['overview']}
          staffAccess={staffAccess}
        />

        <div className="restaurant-workspace">
          <StaffAccessGuardPanel
            title="Checking staff permissions"
            message="Spizy is loading this staff account permissions."
          />
        </div>
      </div>
    )
  }

  const activeSectionAllowed = allowedSections.includes(activeSection)

  return (
    <div className="restaurant-layout">
      <RestaurantSidebar
        restaurant={restaurant}
        activeSection={activeSectionAllowed ? activeSection : 'overview'}
        onSectionChange={handleSectionChange}
        allowedSections={allowedSections}
        staffAccess={staffAccess}
      />

      <div className="restaurant-workspace">
        {staffAccess.isLimited && staffAccess.message && (
          <StaffAccessGuardPanel
            title="Staff access needs setup"
            message={staffAccess.message}
            compact
          />
        )}

        {!activeSectionAllowed && (
          <StaffAccessGuardPanel
            title="No permission for this module"
            message="This staff account does not have permission to open this section. Ask the owner to enable it from Staff settings."
          />
        )}

        {activeSectionAllowed && (
          <>
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

                  {activeSection === 'customer-payments' && (
                    <CustomerPaymentsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'day-closing' && (
                    <DayClosingManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'floor' && (
                    <TableFloorManagement restaurant={restaurant} onOpenSection={handleSectionChange} />
                  )}

                  {activeSection === 'inventory' && (
                    <InventoryManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'branch-stock' && (
                    <BranchStockTransfersManagement restaurant={restaurant} />
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

                  {activeSection === 'supplier-payments' && (
                    <SupplierPaymentsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'expenses' && (
                    <ExpensesManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'finance' && (
                    <FinanceManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'cash-bank' && (
                    <CashBankManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'tax-invoices' && (
                    <TaxInvoicesManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'kitchen' && (
                    <KitchenDisplay restaurant={restaurant} />
                  )}

                  {activeSection === 'delivery' && (
                    <DeliveryManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'delivery-zones' && (
                    <DeliveryZonesManagement restaurant={restaurant} />
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

                  {activeSection === 'activity-logs' && (
                    <ActivityLogsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'data-export' && (
                    <DataExportManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'data-import' && (
                    <DataImportManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'branches' && (
                    <BranchesManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'settings' && (
                    <SettingsManagement restaurant={restaurant} />
                  )}

          </>
        )}
      </div>
    </div>
  )
}

function StaffAccessGuardPanel({ title, message, compact = false }) {
  return (
    <section className={`staff-access-guard ${compact ? 'compact' : ''}`}>
      <div className="staff-access-lock">🔒</div>
      <div>
        <p className="pricing-label">Staff Permissions</p>
        <h2>{title}</h2>
        <span>{message}</span>
      </div>
    </section>
  )
}

export default RestaurantDashboard
