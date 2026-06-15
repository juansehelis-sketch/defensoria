/**
 * Reportes:
 * - Expedientes por juzgado
 * - Expedientes sin movimiento en X días
 * - Intervenciones por despachante
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'

export default function Reportes() {
  const navigate = useNavigate()
  const [porJuzgado, setPorJuzgado] = useState([])
  const [porDespachante, setPorDespachante] = useState([])
  const [sinMovimiento, setSinMovimiento] = useState(null)
  const [dias, setDias] = useState(30)
  const [cargando, setCargando] = useState(true)

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
    Promise.all([cargarBase(), cargarSinMovimiento(dias)]).finally(() => setCargando(false))
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
            <div className="empty">No hay expedientes sin movimiento en {dias} días. 🎉</div>
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
