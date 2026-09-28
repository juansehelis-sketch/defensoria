/**
 * Estadísticas de la defensoría, generadas solas a partir del trabajo cargado
 * (con gráficos y cualquier período: ver components/Estadisticas.jsx), más la
 * grilla de asignación, la carga del equipo, la auditoría y las copias.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, API_BASE, obtenerToken } from '../utils/api'
import { confirmar, avisar } from '../ui'
import Icono from '../components/Icono'
import { fechaHora } from '../utils/format'
import Estadisticas from '../components/Estadisticas'

export default function Reportes() {
  const navigate = useNavigate()
  const [sinMovimiento, setSinMovimiento] = useState(null)
  const [dias, setDias] = useState(30)
  const [cargando, setCargando] = useState(true)
  const [backups, setBackups] = useState([])
  const [nube, setNube] = useState(false)
  const [haciendoBackup, setHaciendoBackup] = useState(false)
  const [carga, setCarga] = useState([])
  const [auditoria, setAuditoria] = useState([])
  async function cargarBackups() {
    try { const r = await api('/api/reportes/backups'); setBackups(r.backups || []); setNube(!!r.nube) } catch { /* sin copias locales */ }
  }
  async function hacerBackup() {
    setHaciendoBackup(true)
    try { await api('/api/reportes/backup', { method: 'POST' }); await cargarBackups() }
    catch (e) { avisar('No se pudo: ' + e.message, 'error') } finally { setHaciendoBackup(false) }
  }
  function descargarBackup(nombre) {
    fetch(`${API_BASE}/api/reportes/backups/descargar/${encodeURIComponent(nombre)}`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then((r) => r.blob()).then((blob) => {
        const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = nombre
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u)
      })
  }
  async function restaurarBackup(nombre) {
    if (!(await confirmar({ titulo: 'Restaurar copia', mensaje: `¿Restaurar la base desde "${nombre}"? Se reemplaza la base actual (se hace una copia de resguardo antes). Después reiniciá la app.`, ok: 'Restaurar', peligro: true }))) return
    try { await api('/api/reportes/backups/restaurar', { method: 'POST', body: { nombre } }); avisar('Restaurado. Cerrá y volvé a abrir la app para usar la copia restaurada.') }
    catch (e) { avisar('No se pudo: ' + e.message, 'error') }
  }

  async function cargarSinMovimiento(n) {
    try {
      const r = await api('/api/reportes/sin-movimiento', { params: { dias: n } })
      setSinMovimiento(r)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    Promise.all([
      cargarSinMovimiento(dias), cargarBackups(),
      api('/api/reportes/carga-equipo').then(setCarga).catch(() => {}),
      api('/api/reportes/auditoria').then(setAuditoria).catch(() => {}),
    ]).finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="loading-center"><span className="spin" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Estadísticas</div>
          <div className="page-sub">Se generan solas a partir del trabajo cargado</div>
        </div>
      </div>

      <Estadisticas />

      {/* Grilla de asignación */}
      <GrillaAsignacion />

      {/* Carga del equipo */}
      <div className="card">
        <div className="card-header"><span className="card-title">Carga del equipo</span><span className="tl-meta">pendientes de cada integrante</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {carga.length === 0 ? <div className="empty">Sin datos.</div> : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Persona</th><th>Rol</th><th>Recibidos a resolver</th><th>Propios pendientes</th><th>Expedientes activos</th></tr></thead>
                <tbody>
                  {carga.map((f) => (
                    <tr key={f.persona}>
                      <td>{f.persona}</td>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{f.rol}</td>
                      <td className="mono">{f.recibidos_pendientes}</td>
                      <td className="mono">{f.enviados_pendientes}</td>
                      <td className="mono">{f.expedientes_activos ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Historial de cambios (auditoría) */}
      <div className="card">
        <div className="card-header"><span className="card-title">Historial de cambios (auditoría)</span><span className="tl-meta">quién hizo qué y cuándo</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {auditoria.length === 0 ? <div className="empty">Sin movimientos registrados todavía.</div> : (
            <div className="table-scroll" style={{ maxHeight: 320 }}>
              <table className="data">
                <thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Qué</th><th>Detalle</th></tr></thead>
                <tbody>
                  {auditoria.map((a, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fechaHora(a.fecha)}</td>
                      <td>{a.usuario || '—'}</td>
                      <td><span className="badge badge-archivo">{a.accion}</span></td>
                      <td className="muted">{a.entidad}</td>
                      <td className="muted" style={{ maxWidth: 340 }}>{a.detalle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sin movimiento */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Expedientes sin movimiento</span>
          <div className="row">
            <span className="tl-meta">Días:</span>
            {[15, 30, 60, 90].map((n) => (
              <button key={n} className={'btn btn-sm ' + (dias === n ? 'btn-navy' : 'btn-ghost')} onClick={() => { setDias(n); cargarSinMovimiento(n) }}>{n}</button>
            ))}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {!sinMovimiento || sinMovimiento.total === 0 ? (
            <div className="empty">No hay expedientes sin movimiento en {dias} días.</div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Expediente</th><th>Carátula</th><th>Juzgado</th><th>Días sin movimiento</th></tr></thead>
                <tbody>
                  {sinMovimiento.expedientes.map((e) => (
                    <tr key={e.id} onClick={() => navigate(`/expedientes/${e.id}`)}>
                      <td className="mono">{e.numero}</td>
                      <td style={{ maxWidth: 420 }}>{e.caratula}</td>
                      <td className="mono">{e.juzgado}</td>
                      <td><span className="badge badge-apelacion">{e.dias_sin_movimiento} días</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Copias de seguridad (solo si hay algo que mostrar) */}
      {(backups.length > 0 || nube) && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Icono nombre="candado" size={14} color="var(--teal)" /> Copias de seguridad</span>
            <button className="btn btn-ghost btn-sm" onClick={hacerBackup} disabled={haciendoBackup}>
              {haciendoBackup ? <span className="spin" /> : 'Hacer copia ahora'}
            </button>
          </div>
          <div className="card-body">
            <div className="tl-meta" style={{ marginBottom: 5 }}>
              Se hacen solas al abrir la app y cada 6 horas.
            </div>
            <div className="tl-meta" style={{ marginBottom: 12 }}>
              Respaldo en la nube: <strong style={{ color: nube ? 'var(--green)' : 'var(--muted)' }}>{nube ? 'activo' : 'inactivo'}</strong>
            </div>
            {backups.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>Todavía no hay copias.</div>
            ) : (
              backups.slice(0, 8).map((b) => (
                <div key={b.nombre} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf0f5' }}>
                  <span className="mono" style={{ fontSize: 13, minWidth: 0 }}>{b.nombre} <span className="tl-meta">· {b.kb} KB</span></span>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => descargarBackup(b.nombre)}>Descargar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => restaurarBackup(b.nombre)}>Restaurar</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grilla de asignación (objetos de proceso × integrantes) ────
function GrillaAsignacion() {
  const [g, setG] = useState(null)
  const [guardado, setGuardado] = useState('')
  const timer = useRef(null)

  useEffect(() => {
    api('/api/reportes/grilla').then((r) => setG(r.datos)).catch(() => {})
  }, [])

  function actualizar(nuevo) {
    setG(nuevo)
    setGuardado('...')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try { await api('/api/reportes/grilla', { method: 'PUT', body: { datos: nuevo } }); setGuardado('Guardado') }
      catch (e) { setGuardado(''); avisar('No se pudo guardar la grilla: ' + e.message, 'error') }
    }, 900)
  }

  function setCelda(fi, nombre, valor) {
    const filas = g.filas.map((f, i) => i === fi ? { ...f, celdas: { ...f.celdas, [nombre]: valor } } : f)
    actualizar({ ...g, filas })
  }
  function setObjeto(fi, valor) {
    const filas = g.filas.map((f, i) => i === fi ? { ...f, objeto: valor } : f)
    actualizar({ ...g, filas })
  }
  function agregarFila() {
    actualizar({ ...g, filas: [...g.filas, { objeto: '', celdas: {} }] })
  }
  async function borrarFila(fi) {
    const f = g.filas[fi]
    if (!(await confirmar({ mensaje: `¿Sacar la fila "${f.objeto || '(sin nombre)'}" de la grilla?`, ok: 'Sacar', peligro: true }))) return
    actualizar({ ...g, filas: g.filas.filter((_, i) => i !== fi) })
  }

  if (!g) return null

  const celdaInput = { width: '100%', minWidth: 62, border: '1px solid transparent', borderRadius: 5, padding: '4px 5px', fontSize: 12.5, textAlign: 'center', fontFamily: 'inherit', background: 'transparent' }

  return (
    <div className="card">
      <div className="card-header">
        <input
          value={g.titulo || ''}
          onChange={(e) => actualizar({ ...g, titulo: e.target.value })}
          style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 15, color: 'var(--navy)', fontFamily: 'inherit', flex: 1, minWidth: 0 }}
        />
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          {guardado && <span className="tl-meta">{guardado}</span>}
          <button className="btn btn-ghost btn-sm" onClick={agregarFila}><Icono nombre="agregar" size={13} /> Fila</button>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--navy)', zIndex: 2, minWidth: 190 }}>Objeto</th>
                {g.columnas.map((c) => (
                  <th key={c.nombre} style={{ textAlign: 'center', minWidth: 68 }}>
                    {c.nombre}<br /><span style={{ fontWeight: 400, fontSize: 10, opacity: .8 }}>{c.cargo}</span>
                  </th>
                ))}
                <th style={{ width: 34 }}></th>
              </tr>
            </thead>
            <tbody>
              {g.filas.map((f, fi) => (
                <tr key={fi} style={{ cursor: 'default' }}>
                  <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid var(--border)' }}>
                    <textarea
                      value={f.objeto}
                      onChange={(e) => setObjeto(fi, e.target.value)}
                      rows={Math.max(1, Math.ceil((f.objeto || '').length / 28))}
                      style={{ width: '100%', minWidth: 175, border: '1px solid transparent', borderRadius: 5, padding: '3px 5px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', resize: 'none', background: 'transparent' }}
                    />
                  </td>
                  {g.columnas.map((c) => (
                    <td key={c.nombre} style={{ padding: '3px 3px' }}>
                      <input
                        value={f.celdas?.[c.nombre] || ''}
                        onChange={(e) => setCelda(fi, c.nombre, e.target.value)}
                        style={celdaInput}
                        onFocus={(e) => { e.target.style.border = '1px solid var(--teal)' }}
                        onBlur={(e) => { e.target.style.border = '1px solid transparent' }}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => borrarFila(fi)} title="Sacar esta fila" style={{ padding: '3px 6px' }}>
                      <Icono nombre="borrar" size={12} color="var(--red)" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tl-meta" style={{ padding: '8px 14px' }}>
          Los números son las terminaciones del expediente. Se guarda solo al escribir.
        </div>
      </div>
    </div>
  )
}
