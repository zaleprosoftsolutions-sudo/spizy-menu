import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import ProductsManagement from '../../restaurant/ProductsManagement'
import MenuScheduleManagement from '../../restaurant/MenuScheduleManagement'
import NutritionLabelsManagement from '../../restaurant/NutritionLabelsManagement'
import RestaurantOverview from '../../restaurant/RestaurantOverview'
import RestaurantOnboardingWizard from '../../restaurant/RestaurantOnboardingWizard'
import SubscriptionBillingManagement from '../../restaurant/SubscriptionBillingManagement'
import PWAMobilePolishManagement from '../../restaurant/PWAMobilePolishManagement'
import OfflinePOSQueueManagement from '../../restaurant/OfflinePOSQueueManagement'
import LaunchQAReadinessManagement from '../../restaurant/LaunchQAReadinessManagement'
import DeploymentMigrationCenterManagement from '../../restaurant/DeploymentMigrationCenterManagement'
import ReceiptPrintCenterManagement from '../../restaurant/ReceiptPrintCenterManagement'
import TaxInvoiceCenterManagement from '../../restaurant/TaxInvoiceCenterManagement'
import RestaurantSidebar from '../../restaurant/RestaurantSidebar'
import SubscriptionTrialHeaderBar from '../../restaurant/SubscriptionTrialHeaderBar'
import NewOrderPOS from '../../restaurant/NewOrderPOS'
import OrdersManagement from '../../restaurant/OrdersManagement'
import CustomerPaymentsManagement from '../../restaurant/CustomerPaymentsManagement'
import DayClosingManagement from '../../restaurant/DayClosingManagement'
import TableFloorManagement from '../../restaurant/TableFloorManagement'
import NotificationsCenter from '../../restaurant/NotificationsCenter'
import RestaurantNotificationsManagement from '../../restaurant/RestaurantNotificationsManagement'
import NotificationProviderSettingsManagement from '../../restaurant/NotificationProviderSettingsManagement'
import KitchenDisplay from '../../restaurant/KitchenDisplay'
import DeliveryManagement from '../../restaurant/DeliveryManagement'
import DeliveryZonesManagement from '../../restaurant/DeliveryZonesManagement'
import ReservationsManagement from '../../restaurant/ReservationsManagement'
import ServiceRequestsManagement from '../../restaurant/ServiceRequestsManagement'
import InventoryManagement from '../../restaurant/InventoryManagement'
import BranchStockTransfersManagement from '../../restaurant/BranchStockTransfersManagement'
import RecipesManagement from '../../restaurant/RecipesManagement'
import COGSManagement from '../../restaurant/COGSManagement'
import ModifierGroupsManagement from '../../restaurant/ModifierGroupsManagement'
import PurchasesManagement from '../../restaurant/PurchasesManagement'
import SupplierPaymentsManagement from '../../restaurant/SupplierPaymentsManagement'
import ExpensesManagement from '../../restaurant/ExpensesManagement'
import ExpenseCategoryReportsManagement from '../../restaurant/ExpenseCategoryReportsManagement'
import GatewayRefundAutomationManagement from '../../restaurant/GatewayRefundAutomationManagement'
import FinanceManagement from '../../restaurant/FinanceManagement'
import CashBankManagement from '../../restaurant/CashBankManagement'
import TaxInvoicesManagement from '../../restaurant/TaxInvoicesManagement'
import VATStatutoryManagement from '../../restaurant/VATStatutoryManagement'
import AdvancedSalesReportsManagement from '../../restaurant/AdvancedSalesReportsManagement'
import TablesQRManagement from '../../restaurant/TablesQRManagement'
import CustomersManagement from '../../restaurant/CustomersManagement'
import LoyaltyTiersManagement from '../../restaurant/LoyaltyTiersManagement'
import GiftVouchersManagement from '../../restaurant/GiftVouchersManagement'
import ComboDealsManagement from '../../restaurant/ComboDealsManagement'
import DiscountsManagement from '../../restaurant/DiscountsManagement'
import CampaignsManagement from '../../restaurant/CampaignsManagement'
import MarketingBroadcastManagement from '../../restaurant/MarketingBroadcastManagement'
import CustomerCRMManagement from '../../restaurant/CustomerCRMManagement'
import ReviewsManagement from '../../restaurant/ReviewsManagement'
import ReportsManagement from '../../restaurant/ReportsManagement'
import StaffManagement from '../../restaurant/StaffManagement'
import StaffPermissionsReviewManagement from '../../restaurant/StaffPermissionsReviewManagement'
import StaffAttendanceManagement from '../../restaurant/StaffAttendanceManagement'
import StaffShiftClosingManagement from '../../restaurant/StaffShiftClosingManagement'
import PayrollManagement from '../../restaurant/PayrollManagement'
import SettingsManagement from '../../restaurant/SettingsManagement'
import PrintSettingsManagement from '../../restaurant/PrintSettingsManagement'
import ActivityLogsManagement from '../../restaurant/ActivityLogsManagement'
import DataExportManagement from '../../restaurant/DataExportManagement'
import DataImportManagement from '../../restaurant/DataImportManagement'
import BranchesManagement from '../../restaurant/BranchesManagement'
import { getLaunchVisibleSections, getSpizyLaunchModeLabel } from '../../restaurant/launchMode'
import '../../restaurant/StaffAccessGuard.css'
import '../../restaurant/RestaurantDashboardLaunchFix.css'


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
  onboarding: ['settings'],
  'subscription-billing': ['settings'],
  'pwa-mobile': ['settings', 'reports'],
  'offline-pos': ['pos', 'orders', 'settings'],
  'launch-qa': ['settings', 'reports'],
  'deployment-center': ['settings'],
  'receipt-print': ['orders', 'settings'],
  'tax-invoice-center': ['reports', 'settings'],
  alerts: ['pos', 'orders', 'menu', 'customers', 'reports', 'settings'],
  'notification-center': ['orders', 'reports', 'settings'],
  'notification-providers': ['settings'],
  pos: ['pos'],
  floor: ['pos', 'orders'],
  orders: ['orders'],
  'customer-payments': ['orders', 'customers'],
  'refund-automation': ['orders', 'reports'],
  'day-closing': ['orders', 'reports'],
  kitchen: ['orders'],
  delivery: ['orders'],
  'delivery-zones': ['menu', 'settings'],
  reservations: ['orders'],
  'service-requests': ['orders'],
  products: ['menu'],
  'menu-schedule': ['menu'],
  'nutrition-labels': ['menu'],
  menu: ['menu'],
  categories: ['menu'],
  qr: ['menu'],
  inventory: ['menu'],
  'branch-stock': ['menu'],
  recipes: ['menu'],
  cogs: ['menu', 'reports'],
  modifiers: ['menu'],
  purchases: ['menu'],
  'supplier-payments': ['menu', 'reports'],
  expenses: ['reports'],
  'expense-reports': ['reports'],
  finance: ['reports'],
  'cash-bank': ['reports'],
  'tax-invoices': ['reports'],
  'vat-statutory': ['reports', 'settings'],
  'advanced-reports': ['reports'],
  customers: ['customers'],
  'loyalty-tiers': ['customers'],
  'gift-vouchers': ['customers'],
  'combo-deals': ['customers', 'menu'],
  crm: ['customers'],
  discounts: ['customers'],
  campaigns: ['customers'],
  marketing: ['customers'],
  reviews: ['customers'],
  reports: ['reports'],
  staff: ['settings'],
  'permissions-review': ['settings'],
  attendance: ['settings'],
  'shift-closing': ['orders', 'reports', 'settings'],
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
  'onboarding',
  'subscription-billing',
  'pwa-mobile',
  'offline-pos',
  'launch-qa',
  'deployment-center',
  'receipt-print',
  'tax-invoice-center',
  'pos',
  'alerts',
  'notification-center',
  'notification-providers',
  'orders',
  'customer-payments',
  'refund-automation',
  'day-closing',
  'floor',
  'kitchen',
  'delivery',
  'delivery-zones',
  'reservations',
  'service-requests',
  'products',
  'menu-schedule',
  'nutrition-labels',
  'menu',
  'categories',
  'qr',
  'inventory',
  'branch-stock',
  'recipes',
  'cogs',
  'modifiers',
  'purchases',
  'supplier-payments',
  'expenses',
  'expense-reports',
  'finance',
  'cash-bank',
  'tax-invoices',
  'vat-statutory',
  'advanced-reports',
  'customers',
  'loyalty-tiers',
  'gift-vouchers',
  'combo-deals',
  'crm',
  'discounts',
  'campaigns',
  'marketing',
  'staff',
  'permissions-review',
  'attendance',
  'shift-closing',
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

  const visibleAllowedSections = useMemo(
    () => getLaunchVisibleSections(allowedSections),
    [allowedSections],
  )

  const handleSectionChange = (section) => {
    const safeSection = getSafeSection(section)
    const nextSection = visibleAllowedSections.includes(safeSection)
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
    if (visibleAllowedSections.includes(activeSection)) return

    handleSectionChange('overview')
  }, [activeSection, staffAccess.loading, visibleAllowedSections])

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

  const activeSectionAllowed = visibleAllowedSections.includes(activeSection)

  return (
    <div className="restaurant-launch-dashboard-root">
      <div className="restaurant-layout">
      <RestaurantSidebar
        restaurant={restaurant}
        activeSection={activeSectionAllowed ? activeSection : 'overview'}
        onSectionChange={handleSectionChange}
        allowedSections={visibleAllowedSections}
        staffAccess={staffAccess}
      />

      <div className="restaurant-workspace">
        <SubscriptionTrialHeaderBar
          restaurant={restaurant}
          onSubscribe={() => handleSectionChange('subscription-billing')}
        />

        {staffAccess.isLimited && staffAccess.message && (
          <StaffAccessGuardPanel
            title="Staff access needs setup"
            message={staffAccess.message}
            compact
          />
        )}

        <LaunchModePanel label={getSpizyLaunchModeLabel()} />

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

                  {activeSection === 'onboarding' && (
                    <RestaurantOnboardingWizard
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'subscription-billing' && (
                    <SubscriptionBillingManagement
                      restaurant={restaurant}
                      profile={profile}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'pwa-mobile' && (
                    <PWAMobilePolishManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'offline-pos' && (
                    <OfflinePOSQueueManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'launch-qa' && (
                    <LaunchQAReadinessManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'deployment-center' && (
                    <DeploymentMigrationCenterManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'receipt-print' && (
                    <ReceiptPrintCenterManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'tax-invoice-center' && (
                    <TaxInvoiceCenterManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'pos' && <NewOrderPOS restaurant={restaurant} />}

                  {activeSection === 'alerts' && (
                    <NotificationsCenter
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'notification-center' && (
                    <RestaurantNotificationsManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {activeSection === 'notification-providers' && (
                    <NotificationProviderSettingsManagement
                      restaurant={restaurant}
                      onOpenSection={handleSectionChange}
                    />
                  )}

                  {(activeSection === 'products' ||
                    activeSection === 'menu' ||
                    activeSection === 'categories') && (
                    <ProductsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'menu-schedule' && (
                    <MenuScheduleManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'nutrition-labels' && (
                    <NutritionLabelsManagement restaurant={restaurant} />
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

                  {activeSection === 'refund-automation' && (
                    <GatewayRefundAutomationManagement restaurant={restaurant} />
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

                  {activeSection === 'cogs' && (
                    <COGSManagement restaurant={restaurant} />
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

                  {activeSection === 'expense-reports' && (
                    <ExpenseCategoryReportsManagement restaurant={restaurant} />
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

                  {activeSection === 'vat-statutory' && (
                    <VATStatutoryManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'advanced-reports' && (
                    <AdvancedSalesReportsManagement restaurant={restaurant} />
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

                  {activeSection === 'loyalty-tiers' && (
                    <LoyaltyTiersManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'gift-vouchers' && (
                    <GiftVouchersManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'combo-deals' && (
                    <ComboDealsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'crm' && (
                    <CustomerCRMManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'discounts' && (
                    <DiscountsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'campaigns' && (
                    <CampaignsManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'marketing' && (
                    <MarketingBroadcastManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'staff' && <StaffManagement restaurant={restaurant} />}

                  {activeSection === 'permissions-review' && (
                    <StaffPermissionsReviewManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'attendance' && (
                    <StaffAttendanceManagement restaurant={restaurant} />
                  )}

                  {activeSection === 'shift-closing' && (
                    <StaffShiftClosingManagement restaurant={restaurant} />
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
    </div>
  )
}

function LaunchModePanel({ label }) {
  if (label !== 'Launch-safe mode active') return null

  return (
    <section className="staff-access-guard compact spizy-launch-mode-panel">
      <div className="staff-access-lock">🚀</div>
      <div>
        <p className="pricing-label">Launch Mode</p>
        <h2>{label}</h2>
        <span>Beta/foundation modules are hidden from the sidebar for launch stability. Set VITE_SPIZY_SHOW_BETA_MODULES=true after launch to show every module again.</span>
      </div>
    </section>
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
