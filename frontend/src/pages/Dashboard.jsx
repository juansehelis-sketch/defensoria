/**
 * Pantalla de inicio.
 * - Novedades (notificaciones) arriba.
 * - Tabla 1: pendientes SIN enviar a la firma.
 * - Tabla 2: enviados a la firma (esperando que se suba el dictamen).
 * Al enviar un proyecto, la fila pasa sola de la tabla 1 a la tabla 2.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { fechaCorta } from '../utils/format'
import TablaListado from '../components/TablaListado'

export default function Dashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [pendientes, setPendientes] = useState([])
  const [enviados, setEnviados] = useState([])
  const [resumen, setResumen] = useState(null)
  const [notificaciones, setNotificaciones] = useState([])
  const [despachantes, setDespachantes] = useState([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    try {
      const [p, e, r, n] = await Promise.all([
        api('/api/panel/pendientes'),
        api('/api/panel/enviados-firma'),
        api('/api/panel/resumen'),
        api('/api/panel/notificaciones'),
      ])
      setPendientes(p)
      setEnviados(e)
      setResumen(r)
      setNotificaciones(n)
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    api('/api/usuarios/').then(setDespachantes).catch(() => {})
  }, [])

  if (cargando) return <div className="loading-center"><span className="spin" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Hola, {usuario?.nombre}</div>
          <div className="page-sub">Tu panel de pendientes y novedades.</div>
        </div>
      </div>

      {/* Estadísticas rápidas */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-num">{pendientes.length}</div>
          <div className="stat-label">Pendientes de enviar</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{enviados.length}</div>
          <div className="stat-label">Enviados a la firma</div>
        </div>
        {(usuario?.rol === 'secretaria' || usuario?.rol === 'defensora' || usuario?.rol === 'admin') && (
          <div className="stat-card">
            <div className="stat-num">{resumen?.proyectos_para_revisar ?? 0}</div>
            <div className="stat-label">Proyectos para revisar</div>
          </div>
        )}
      </div>

      {/* Novedades (arriba) */}
      <div className="card">
        <div className="card-header"><span className="card-title">Novedades recientes</span></div>
        <div className="card-body">
          {notificaciones.length ? (
            notificaciones.slice(0, 12).map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '10px 0', borderBottom: '1px solid #edf0f5', fontSize: 13,
                  opacity: n.leida ? 0.6 : 1, cursor: n.expediente_id ? 'pointer' : 'default',
                }}
                onClick={() => n.expediente_id && navigate(`/expedientes/${n.expediente_id}`)}
              >
                <div className="row" style={{ gap: 6 }}>
                  {n.tipo === 'expediente_urgente' && <span className="badge" style={{ background: 'var(--red)', color: '#fff' }}>URGENTE</span>}
                  <span>{n.contenido}</span>
                </div>
                <div className="tl-meta" style={{ marginTop: 3 }}>{fechaCorta(n.fecha_creacion)}</div>
              </div>
            ))
          ) : (
            <div className="empty">Sin novedades.</div>
          )}
        </div>
      </div>

      {/* Tabla 1: pendientes de enviar a la firma */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Pendientes de enviar a la firma</span>
          <span className="tl-meta">{pendientes.length}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {pendientes.length === 0 ? (
            <div className="empty">No tenés expedientes pendientes de enviar. 🎉</div>
          ) : (
            <TablaListado registros={pendientes} despachantes={despachantes} mostrarFecha mostrarUrgente onCambio={cargar} onAbrir={(eid) => navigate(`/expedientes/${eid}`)} />
          )}
        </div>
      </div>

      {/* Tabla 2: enviados a la firma */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Enviados a la firma (esperando)</span>
          <span className="tl-meta">{enviados.length}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {enviados.length === 0 ? (
            <div className="empty">No tenés expedientes esperando en la firma.</div>
          ) : (
            <TablaListado registros={enviados} despachantes={despachantes} mostrarFecha onCambio={cargar} onAbrir={(eid) => navigate(`/expedientes/${eid}`)} />
          )}
        </div>
      </div>
    </div>
  )
}
