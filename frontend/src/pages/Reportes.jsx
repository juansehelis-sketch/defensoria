/**
 * Reportes:
 * - Expedientes por juzgado
 * - Expedientes sin movimiento en X días
 * - Intervenciones por despachante
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, API_BASE, obtenerToken } from '../utils/api'
import Icono from '../components/Icono'
import { fechaHora } from '../utils/format'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Reportes() {
  const navigate = useNavigate()
  const [porJuzgado, setPorJuzgado] = useState([])
  const [porDespachante, setPorDespachante] = useState([])
  const [sinMovimiento, setSinMovimiento] = useState(null)
  const [dias, setDias] = useState(30)
  const [cargando, setCargando] = useState(true)
  const [backups, setBackups] = useState([])
  const [nube, setNube] = useState(false)
  const [haciendoBackup, setHaciendoBackup] = useState(false)
  const ahora = new Date()
  const [periodo, setPeriodo] = useState({ anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 })
  const [mensual, setMensual] = useState(null)
  const [carga, setCarga] = useState([])
  const [auditoria, setAuditoria] = useState([])

  async function cargarMensual() {
    try { setMensual(await api('/api/reportes/mensual', { params: periodo })) } catch (e) { console.error(e) }
  }
  useEffect(() => { cargarMensual() }, [periodo])

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
    try { const r = await api('/api/reportes/backups'); setBackups(r.backups || []); setNube(!!r.nube) } catch { /* web sin SQLite */ }
  }
  async function hacerBackup() {
    setHaciendoBackup(true)
    try { await api('/api/reportes/backup', { method: 'POST' }); await cargarBackups() }
    catch (e) { alert('No se pudo: ' + e.message) } finally { setHaciendoBackup(false) }
  }
  function descargarBackup(nombre) {
    fetch(`${API_BASE}/api/reportes/backups/descargar/${encodeURIComponent(nombre)}`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then((r) => r.blob()).then((blob) => {
        const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = nombre
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u)
      })
  }
  async function restaurarBackup(nombre) {
    if (!confirm(`¿Restaurar la base desde "${nombre}"?\nSe reemplaza la base actual (se hace una copia de resguardo antes). Después reiniciá la app.`)) return
    try { await api('/api/reportes/backups/restaurar', { method: 'POST', body: { nombre } }); alert('Restaurado. Cerrá y volvé a abrir la app para usar la copia restaurada.') }
    catch (e) { alert('No se pudo: ' + e.message) }
  }

  async function cargarBase() {
    try {
      const [j, d] = await Promise.all([
        api('/api/reportes/por-juzgado'),
        api('/api/reportes/intervenciones-por-despachante'),
      ])
      setPorJuzgado(j)
      setPorDespachante(d)
    } catch (e) { console.error(e) }
  }

  async function cargarSinMovimiento(n) {
    try {
      const r = await api('/api/reportes/sin-movimiento', { params: { dias: n } })
      setSinMovimiento(r)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    Promise.all([
      cargarBase(), cargarSinMovimiento(dias), cargarBackups(),
      api('/api/reportes/carga-equipo').then(setCarga).catch(() => {}),
      api('/api/reportes/auditoria').then(setAuditoria).catch(() => {}),
    ]).finally(() => setCargando(false))
  }, [])

  const maxJuzgado = Math.max(1, ...porJuzgado.map((x) => x.cantidad))
  const maxDesp = Math.max(1, ...porDespachante.map((x) => x.intervenciones))

  if (cargando) return <div className="loading-center"><span className="spin" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Reportes</div>
          <div className="page-sub">Estadísticas de la Defensoría</div>
        </div>
      </div>

      {/* Reporte mensual (para elevar a la Defensoría General) */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Reporte mensual</span>
          <div className="row" style={{ gap: 6 }}>
            <select value={periodo.mes} onChange={(e) => setPeriodo((p) => ({ ...p, mes: Number(e.target.value) }))} style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontFamily: 'inherit' }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={periodo.anio} onChange={(e) => setPeriodo((p) => ({ ...p, anio: Number(e.target.value) }))} style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontFamily: 'inherit' }}>
              {[0, 1, 2].map((d) => { const y = ahora.getFullYear() - d; return <option key={y} value={y}>{y}</option> })}
            </select>
            <button className="btn btn-teal btn-sm" onClick={descargarExcel}><Icono nombre="exportar" size={14} />Excel</button>
          </div>
        </div>
        <div className="card-body">
          {!mensual ? <div className="empty">Sin datos.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="dash-grid">
              <div>
                <div className="card-title" style={{ marginBottom: 8 }}>Intervenciones por tipo</div>
                {mensual.intervenciones_por_tipo.length === 0 ? <div className="tl-meta">Sin intervenciones este mes.</div>
                  : mensual.intervenciones_por_tipo.map((x) => <FilaDato key={x.tipo} k={x.tipo} v={x.cantidad} />)}
                <div className="card-title" style={{ margin: '14px 0 8px' }}>Audiencias</div>
                <FilaDato k="Total del mes" v={mensual.audiencias.total} />
                {Object.entries(mensual.audiencias.por_modalidad).map(([k, v]) => <FilaDato key={k} k={k} v={v} />)}
              </div>
              <div>
                <div className="card-title" style={{ marginBottom: 8 }}>Productividad</div>
                {mensual.productividad.length === 0 ? <div className="tl-meta">Sin datos.</div>
                  : mensual.productividad.map((x) => <FilaDato key={x.persona} k={x.persona} v={x.intervenciones} />)}
                <div className="card-title" style={{ margin: '14px 0 8px' }}>Proyectos a la firma</div>
                <FilaDato k="Enviados" v={mensual.proyectos.enviados} />
                <FilaDato k="Dictámenes subidos" v={mensual.proyectos.subidos} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Carga del equipo */}
      <div className="card">
        <div className="card-header"><span className="card-title">Carga del equipo</span><span className="tl-meta">qué tiene cada uno y qué está demorado</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {carga.length === 0 ? <div className="empty">Sin datos.</div> : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Persona</th><th>Rol</th><th>Recibidos a resolver</th><th>Propios pendientes</th><th>Demorados (+7 días)</th><th>Expedientes activos</th></tr></thead>
                <tbody>
                  {carga.map((f) => (
                    <tr key={f.persona}>
                      <td>{f.persona}</td>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{f.rol}</td>
                      <td className="mono">{f.recibidos_pendientes}</td>
                      <td className="mono">{f.enviados_pendientes}</td>
                      <td>{f.demorados > 0 ? <span className="badge" style={{ background: 'var(--red)', color: '#fff' }}>{f.demorados}</span> : <span className="dash">—</span>}</td>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
        {/* Por juzgado */}
        <div className="card">
          <div className="card-header"><span className="card-title">Expedientes por juzgado</span></div>
          <div className="card-body">
            {porJuzgado.length === 0 ? <div className="empty">Sin datos.</div> : porJuzgado.map((x) => (
              <BarraReporte key={x.juzgado} etiqueta={`Juzgado ${x.juzgado}`} valor={x.cantidad} max={maxJuzgado} />
            ))}
          </div>
        </div>

        {/* Por despachante */}
        <div className="card">
          <div className="card-header"><span className="card-title">Intervenciones por despachante</span></div>
          <div className="card-body">
            {porDespachante.length === 0 ? <div className="empty">Sin datos.</div> : porDespachante.map((x) => (
              <BarraReporte key={x.despachante} etiqueta={x.despachante} valor={x.intervenciones} max={maxDesp} color="var(--navy)" />
            ))}
          </div>
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

      {/* Copias de seguridad */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Icono nombre="candado" size={14} color="var(--teal)" /> Copias de seguridad (base local)</span>
          <button className="btn btn-ghost btn-sm" onClick={hacerBackup} disabled={haciendoBackup}>
            {haciendoBackup ? <span className="spin" /> : 'Hacer copia ahora'}
          </button>
        </div>
        <div className="card-body">
          <div className="tl-meta" style={{ marginBottom: 5 }}>
            Se hacen solas al abrir la app y cada 6 horas (últimas 20 en <code>backups/</code>).
          </div>
          <div className="tl-meta" style={{ marginBottom: 12 }}>
            Respaldo en la nube (Supabase): <strong style={{ color: nube ? 'var(--green)' : 'var(--muted)' }}>{nube ? 'activo' : 'inactivo'}</strong>
          </div>
          {backups.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>Todavía no hay copias (o estás en la versión web).</div>
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
      <span style={{ textTransform: 'capitalize' }}>{k}</span>
      <strong>{v}</strong>
    </div>
  )
}
