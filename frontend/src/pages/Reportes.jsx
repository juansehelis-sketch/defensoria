/**
 * Estadísticas de la defensoría, generadas solas a partir del trabajo cargado:
 * vistas, demoras, personas, tipos de proceso, juzgados, audiencias, proyectos
 * y la grilla de asignación de expedientes (editable).
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, API_BASE, obtenerToken } from '../utils/api'
import { confirmar, avisar } from '../ui'
import Icono from '../components/Icono'
import { fechaHora } from '../utils/format'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Reportes() {
  const navigate = useNavigate()
  const [sinMovimiento, setSinMovimiento] = useState(null)
  const [dias, setDias] = useState(30)
  const [cargando, setCargando] = useState(true)
  const [backups, setBackups] = useState([])
  const [nube, setNube] = useState(false)
  const [haciendoBackup, setHaciendoBackup] = useState(false)
  const ahora = new Date()
  const [periodo, setPeriodo] = useState({ anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 })
  const [stats, setStats] = useState(null)
  const [carga, setCarga] = useState([])
  const [auditoria, setAuditoria] = useState([])
  async function cargarStats() {
    try { setStats(await api('/api/reportes/estadisticas', { params: periodo })) } catch (e) { console.error(e) }
  }
  useEffect(() => { cargarStats() }, [periodo])

  function descargarExcel() {
    const url = `${API_BASE}/api/reportes/mensual/excel?anio=${periodo.anio}&mes=${periodo.mes}`
    fetch(url, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u; a.download = `reporte_${periodo.anio}_${String(periodo.mes).padStart(2, '0')}.xlsx`
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u)
      })
  }

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

  const v = stats?.vistas
  const dem = stats?.demoras
  const maxTipo = Math.max(1, ...(stats?.por_tipo || []).map((x) => x.cantidad))
  const maxJuzgado = Math.max(1, ...(stats?.por_juzgado || []).map((x) => x.cantidad))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Estadísticas</div>
          <div className="page-sub">Se generan solas a partir del trabajo cargado</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <select value={periodo.mes} onChange={(e) => setPeriodo((p) => ({ ...p, mes: Number(e.target.value) }))} style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontFamily: 'inherit' }}>
            <option value={0}>Todo el año</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={periodo.anio} onChange={(e) => setPeriodo((p) => ({ ...p, anio: Number(e.target.value) }))} style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontFamily: 'inherit' }}>
            {[0, 1, 2].map((d) => { const y = ahora.getFullYear() - d; return <option key={y} value={y}>{y}</option> })}
          </select>
          {periodo.mes > 0 && <button className="btn btn-teal btn-sm" onClick={descargarExcel}><Icono nombre="exportar" size={14} />Excel</button>}
        </div>
      </div>

      {/* Números principales del período */}
      {v && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="stat-card"><div className="stat-num">{v.ingresadas}</div><div className="stat-label">Vistas ingresadas</div></div>
          <div className="stat-card"><div className="stat-num">{v.resueltas}</div><div className="stat-label">Subidas al Lex</div></div>
          <div className="stat-card"><div className="stat-num">{v.pendientes}</div><div className="stat-label">Pendientes hoy</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: v.urgentes ? 'var(--red)' : undefined }}>{v.urgentes}</div><div className="stat-label">Urgentes</div></div>
          <div className="stat-card"><div className="stat-num">{v.repetidas}</div><div className="stat-label">Vistas repetidas</div></div>
          <div className="stat-card"><div className="stat-num">{dem?.total ?? '—'}</div><div className="stat-label">Demora promedio (días)</div></div>
        </div>
      )}

      {/* Demoras del circuito */}
      {dem && (dem.total != null || dem.hasta_firma != null || dem.proyectos != null) && (
        <div className="card">
          <div className="card-header"><span className="card-title">Demoras promedio del período (días corridos)</span></div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <FilaDato k="De que entra la vista a subirla al Lex" v={dem.total ?? '—'} />
            <FilaDato k="De que entra al pase a la firma" v={dem.hasta_firma ?? '—'} />
            <FilaDato k="De la firma a subirla al Lex" v={dem.firma_a_lex ?? '—'} />
            <FilaDato k="Del envío del proyecto a su subida" v={dem.proyectos ?? '—'} />
          </div>
        </div>
      )}

      {/* Vistas por persona */}
      <div className="card">
        <div className="card-header"><span className="card-title">Vistas por persona</span><span className="tl-meta">del período elegido</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {!stats || stats.por_persona.length === 0 ? <div className="empty">Sin vistas en el período.</div> : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Persona</th><th>Ingresadas</th><th>Subidas al Lex</th><th>Pendientes</th><th>Urgentes</th><th>Enviadas a la firma</th></tr></thead>
                <tbody>
                  {stats.por_persona.map((f) => (
                    <tr key={f.persona}>
                      <td>{f.persona}</td>
                      <td className="mono">{f.ingresadas}</td>
                      <td className="mono">{f.resueltas}</td>
                      <td className="mono">{f.pendientes}</td>
                      <td>{f.urgentes > 0 ? <span className="badge" style={{ background: 'var(--red)', color: '#fff' }}>{f.urgentes}</span> : <span className="dash">—</span>}</td>
                      <td className="mono">{f.a_la_firma}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
        {/* Por tipo de proceso */}
        <div className="card">
          <div className="card-header"><span className="card-title">Vistas por tipo de proceso</span><span className="tl-meta">según la carátula</span></div>
          <div className="card-body">
            {!stats || stats.por_tipo.length === 0 ? <div className="empty">Sin datos en el período.</div> : stats.por_tipo.map((x) => (
              <BarraReporte key={x.tipo} etiqueta={x.tipo} valor={x.cantidad} max={maxTipo} />
            ))}
          </div>
        </div>

        {/* Por juzgado */}
        <div className="card">
          <div className="card-header"><span className="card-title">Vistas por juzgado</span></div>
          <div className="card-body">
            {!stats || stats.por_juzgado.length === 0 ? <div className="empty">Sin datos en el período.</div> : stats.por_juzgado.map((x) => (
              <BarraReporte key={x.juzgado} etiqueta={x.juzgado === 'Sin dato' ? 'Sin dato' : `Juzgado ${x.juzgado}`} valor={x.cantidad} max={maxJuzgado} color="var(--navy)" />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
        {/* Audiencias */}
        <div className="card">
          <div className="card-header"><span className="card-title">Audiencias del período</span></div>
          <div className="card-body">
            {!stats ? null : (<>
              <FilaDato k="Total" v={stats.audiencias.total} />
              {Object.entries(stats.audiencias.por_modalidad).map(([k, c]) => <FilaDato key={k} k={k} v={c} />)}
              {Object.keys(stats.audiencias.por_persona).length > 0 && <div className="card-title" style={{ margin: '12px 0 6px' }}>Quién asiste</div>}
              {Object.entries(stats.audiencias.por_persona).map(([k, c]) => <FilaDato key={k} k={k} v={c} />)}
            </>)}
          </div>
        </div>

        {/* A la firma */}
        <div className="card">
          <div className="card-header"><span className="card-title">A la firma (período)</span></div>
          <div className="card-body">
            {!stats ? null : (<>
              <FilaDato k="Proyectos enviados" v={stats.proyectos.enviados} />
              <FilaDato k="Dictámenes subidos" v={stats.proyectos.subidos} />
              <FilaDato k="En corrección ahora" v={stats.proyectos.en_correccion} />
              <div className="card-title" style={{ margin: '12px 0 6px' }}>Totales generales</div>
              <FilaDato k="Expedientes activos" v={stats.totales.expedientes_activos} />
              <FilaDato k="Expedientes archivados" v={stats.totales.expedientes_archivados} />
              <FilaDato k="Expedientes nuevos en el período" v={stats.totales.expedientes_nuevos_periodo} />
              <FilaDato k="Legajos" v={stats.totales.legajos} />
              <FilaDato k="Instituciones en el mapa" v={stats.totales.instituciones} />
              <FilaDato k="Personas alojadas registradas" v={stats.totales.personas_alojadas} />
            </>)}
          </div>
        </div>
      </div>

      {/* Evolución mensual */}
      <div className="card">
        <div className="card-header"><span className="card-title">Evolución de los últimos 12 meses</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {!stats ? null : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Mes</th>{stats.evolucion.map((e) => <th key={`${e.anio}-${e.mes}`} style={{ textAlign: 'center' }}>{MESES[e.mes - 1].slice(0, 3)} {String(e.anio).slice(2)}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={{ fontWeight: 600 }}>Ingresadas</td>{stats.evolucion.map((e) => <td key={`i${e.anio}-${e.mes}`} className="mono" style={{ textAlign: 'center' }}>{e.ingresadas}</td>)}</tr>
                  <tr><td style={{ fontWeight: 600 }}>Subidas al Lex</td>{stats.evolucion.map((e) => <td key={`r${e.anio}-${e.mes}`} className="mono" style={{ textAlign: 'center' }}>{e.resueltas}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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

function BarraReporte({ etiqueta, valor, max, color = 'var(--teal)' }) {
  const pct = Math.round((valor / max) * 100)
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span>{etiqueta}</span>
        <strong>{valor}</strong>
      </div>
      <div style={{ height: 8, background: '#eef0f4', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

function FilaDato({ k, v }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', fontSize: 13.5, padding: '4px 0', borderBottom: '1px solid #f1eef0' }}>
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  )
}
