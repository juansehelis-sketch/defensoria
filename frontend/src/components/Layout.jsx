/**
 * Layout principal: header con navegación + área de contenido (Outlet).
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Solapas visibles para todos los roles.
const TABS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/expedientes', label: 'Expedientes' },
  { to: '/a-la-firma', label: 'A la firma' },
  { to: '/audiencias', label: 'Audiencias' },
  { to: '/modelos', label: 'Modelos' },
  { to: '/reportes', label: 'Reportes' },
]

export default function Layout() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <header className="app-header">
        <div
          className="header-logo"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <img src="/logo.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg' }} alt="MPD" style={{ height: 34, width: 'auto', background: '#fff', borderRadius: 6, padding: 2 }} />
          <span>Defensoría · MPD</span>
        </div>

        <nav className="main-nav">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => 'nav-tab' + (isActive ? ' active' : '')}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-user">
          <span>{usuario?.nombre}</span>
          <span className="header-badge">{usuario?.rol}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>
            Salir
          </button>
        </div>
      </header>

      <Outlet />
    </>
  )
}
