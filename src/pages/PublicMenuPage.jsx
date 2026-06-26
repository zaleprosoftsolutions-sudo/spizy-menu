import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { QrCode, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './PublicMenuPage.css'

function PublicMenuPage() {
  const { restaurantSlug } = useParams()
  const [searchParams] = useSearchParams()
  const tableToken = searchParams.get('table')
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState(null)
  const [table, setTable] = useState(null)

  useEffect(() => {
    async function loadPublicMenu() {
      setLoading(true)

      const { data: restaurantData } = await supabase
        .from('restaurants')
        .select('id, name, slug, logo_url, phone, address, currency, is_active')
        .eq('slug', restaurantSlug)
        .maybeSingle()

      setRestaurant(restaurantData || null)

      if (restaurantData?.id && tableToken) {
        const { data: tableData } = await supabase
          .from('restaurant_tables')
          .select('id, table_name, table_number, qr_token, is_active')
          .eq('restaurant_id', restaurantData.id)
          .eq('qr_token', tableToken)
          .maybeSingle()

        setTable(tableData || null)
      }

      setLoading(false)
    }

    loadPublicMenu()
  }, [restaurantSlug, tableToken])

  if (loading) {
    return (
      <main className="public-menu-page">
        <div className="public-menu-card">
          <div className="public-menu-loader">Loading menu...</div>
        </div>
      </main>
    )
  }

  if (!restaurant || !restaurant.is_active) {
    return (
      <main className="public-menu-page">
        <div className="public-menu-card">
          <Store size={42} />
          <h1>Menu not available</h1>
          <p>This restaurant menu is not active right now.</p>
          <Link to="/">Back to Spizy</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="public-menu-page">
      <div className="public-menu-card">
        <div className="public-menu-logo">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt={restaurant.name} />
          ) : (
            restaurant.name.slice(0, 2).toUpperCase()
          )}
        </div>

        <p className="public-menu-label">Spizy Menu</p>
        <h1>{restaurant.name}</h1>

        {table && (
          <div className="public-table-pill">
            <QrCode size={18} />
            {table.table_name}
            {table.table_number ? ` • ${table.table_number}` : ''}
          </div>
        )}

        <p>
          QR opened successfully. Customer menu ordering screen will be connected
          in the next build.
        </p>

        <div className="public-menu-coming">
          Products, cart, table order and delivery order flow coming next.
        </div>
      </div>
    </main>
  )
}

export default PublicMenuPage