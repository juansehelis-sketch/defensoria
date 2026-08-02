/**
 * Layout principal: header con navegación + área de contenido (Outlet).
 */

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'
import Icono from './Icono'
import BuscadorGlobal from './BuscadorGlobal'
import { CambiarMiClave } from '../pages/Usuarios'

// Solapas visibles para todos los roles.
const TABS = [
  { to: '/', label: 'Inicio', icono: 'inicio', end: true },
  { to: '/expedientes', label: 'Expedientes', icono: 'expedientes' },
  { to: '/a-la-firma', label: 'A la firma', icono: 'firma' },
  { to: '/audiencias', label: 'Audiencias', icono: 'audiencias' },
  { to: '/modelos', label: 'Modelos', icono: 'modelos' },
  { to: '/legajos', label: 'Legajos', icono: 'personas' },
  { to: '/mapa', label: 'Mapa', icono: 'mapa' },
  { to: '/reportes', label: 'Reportes', icono: 'reportes' },
  { to: '/chat', label: 'Chat', icono: 'chat' },
]

export default function Layout() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [verClave, setVerClave] = useState(false)
  const [sinLeer, setSinLeer] = useState(0)
  const esAdmin = usuario && ['admin', 'defensora'].includes(usuario.rol)
  const tabs = esAdmin ? [...TABS, { to: '/usuarios', label: 'Usuarios', icono: 'personas' }] : TABS

  // Mensajes del chat sin leer: se consulta cada tanto para el aviso de la solapa.
  useEffect(() => {
    if (!usuario) return
    let vivo = true
    const mirar = () => api('/api/chat/no-leidos')
      .then((d) => { if (vivo) setSinLeer(d.no_leidos || 0) })
      .catch(() => {})
    mirar()
    const t = setInterval(mirar, 15000)
    return () => { vivo = false; clearInterval(t) }
  }, [usuario?.id])

  return (
    <>
      <header className="app-header">
        <div
          className="header-logo"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <img src="/logo-mark.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg' }} alt="MPD" style={{ height: 32, width: 'auto' }} />
          <span>Defensoría · MPD</span>
        </div>

        <nav className="main-nav">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => 'nav-tab' + (isActive ? ' active' : '')}
              style={t.to === '/chat' ? { position: 'relative' } : undefined}
            >
              <Icono nombre={t.icono} size={16} />
              {t.label}
              {t.to === '/chat' && sinLeer > 0 && (
                <span style={{
                  background: 'var(--sol, #e8b84b)', color: '#5a3d00', borderRadius: 99,
                  fontSize: 10, fontWeight: 800, padding: '1px 6px', marginLeft: 2, lineHeight: 1.5,
                }}>
                  {sinLeer > 99 ? '99+' : sinLeer}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <BuscadorGlobal />

        <div className="header-user">
          <span>{usuario?.nombre}</span>
          <span className="header-badge">{usuario?.rol}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setVerClave(true)} style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} title="Cambiar mi contraseña">
            Mi clave
          </button>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>
            Salir
          </button>
        </div>
      </header>

      <Outlet />
      {verClave && <CambiarMiClave onClose={() => setVerClave(false)} />}
    </>
  )
}
