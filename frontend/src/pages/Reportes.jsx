/**
 * Reportes:
 * - Expedientes por juzgado
 * - Expedientes sin movimiento en X días
 * - Intervenciones por despachante
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import Icono from '../components/Icono'

export default function Reportes() {
  const navigate = useNavigate()
  const [porJuzgado, setPorJuzgado] = useState([])
  const [porDespachante, setPorDespachante] = useState([])
  const [sinMovimiento, setSinMovimiento] = useState(null)
  const [dias, setDias] = useState(30)
  const [cargando, setCargando] = useState(true)
  const [backups, setBackups] = useState([])
  const [haciendoBackup, setHaciendoBackup] = useState(false)

  async function cargarBackups() {
    try { const r = await api('/api/reportes/backups'); setBackups(r.backups || []) } catch { /* web sin SQLite */ }
  }
  async function hacerBackup() {
    setHaciendoBackup(true)
    try { await api('/api/reportes/backup', { method: 'POST' }); await cargarBackups() }
    catch (e) { alert('No se pudo: ' + e.message) } finally { setHaciendoBackup(false) }
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
    Promise.all([cargarBase(), cargarSinMovimiento(dias), cargarBackups()]).finally(() => setCargando(false))
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
          <div className="tl-meta" style={{ marginBottom: 10 }}>
            Se hacen solas al abrir la app y cada 6 horas. Se guardan las últimas 20 en la carpeta <code>backups/</code> de tu PC.
          </div>
          {backups.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>Todavía no hay copias (o estás en la versión web, que respalda Supabase).</div>
          ) : (
            backups.slice(0, 6).map((b) => (
              <div key={b.nombre} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #edf0f5' }}>
                <span className="mono">{b.nombre}</span>
                <span className="tl-meta">{b.kb} KB</span>
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
