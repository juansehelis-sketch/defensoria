/**
 * Estadísticas con gráficos, para cualquier período (desde–hasta).
 *
 * - Períodos rápidos (hoy, esta semana, este mes, mes anterior, últimos 30
 *   días, este año, año anterior) o fechas a elección.
 * - Números principales comparados con el período anterior del mismo largo.
 * - Evolución día por día / por semana / por mes según el largo del período.
 * - Personas, tipos de proceso, juzgados, demoras y antigüedad de lo pendiente.
 * - Cada gráfico se puede ver como tabla. Al pasar el mouse se ve el detalle.
 *
 * Colores validados (contraste y daltonismo): bordó MPD para lo que ENTRA,
 * azul para lo que se SUBE al Lex. Los gráficos de una sola serie van en bordó.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, API_BASE, obtenerToken } from '../utils/api'
import { isoLocal } from '../utils/format'
import Icono from './Icono'

const C_ENTRA = '#8a2a4c'
const C_SUBE = '#2a78d6'
const GRILLA = '#ebebf0'
const TEXTO2 = '#5b5b66'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const SERIES_VISTAS = [
  { clave: 'ingresadas', nombre: 'Ingresadas', color: C_ENTRA },
  { clave: 'resueltas', nombre: 'Subidas al Lex', color: C_SUBE },
]

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'))
const f2 = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const dCorta = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES_C[Number(m) - 1]}` }

// ── Períodos ───────────────────────────────────────────────────
function rango(clave) {
  const h = new Date(); h.setHours(0, 0, 0, 0)
  const d = (x) => isoLocal(x)
  switch (clave) {
    case 'hoy': return [d(h), d(h)]
    case 'semana': { const i = new Date(h); i.setDate(h.getDate() - ((h.getDay() + 6) % 7)); return [d(i), d(h)] }
    case 'mes': return [d(new Date(h.getFullYear(), h.getMonth(), 1)), d(h)]
    case 'mes_ant': return [d(new Date(h.getFullYear(), h.getMonth() - 1, 1)), d(new Date(h.getFullYear(), h.getMonth(), 0))]
    case '30': { const i = new Date(h); i.setDate(h.getDate() - 29); return [d(i), d(h)] }
    case 'anio': return [d(new Date(h.getFullYear(), 0, 1)), d(h)]
    case 'anio_ant': return [d(new Date(h.getFullYear() - 1, 0, 1)), d(new Date(h.getFullYear() - 1, 11, 31))]
    default: return null
  }
}
const PRESETS = [
  ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_ant', 'Mes anterior'],
  ['30', 'Últimos 30 días'], ['anio', 'Este año'], ['anio_ant', 'Año anterior'],
]

// Si el período es un mes calendario completo, se puede bajar el Excel mensual
function mesCompleto(desde, hasta) {
  const [y, m, d] = desde.split('-').map(Number)
  if (d !== 1) return null
  const ultimo = isoLocal(new Date(y, m, 0))
  return hasta === ultimo ? { anio: y, mes: m } : null
}

// ── Utilidades de gráficos ─────────────────────────────────────
function useAncho() {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function marcas(max) {
  if (max <= 0) return [0, 1]
  const bruto = max / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / mag
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
  const tope = Math.ceil(max / paso) * paso
  const out = []
  for (let v = 0; v <= tope + 1e-9; v += paso) out.push(Math.round(v))
  return out
}

function Leyenda({ series }) {
  return (
    <div className="row" style={{ gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: TEXTO2, marginBottom: 8 }}>
      {series.map((s) => (
        <span key={s.clave} className="row" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, display: 'inline-block' }} />
          {s.nombre}
        </span>
      ))}
    </div>
  )
}

function Tooltip({ pos, children }) {
  if (!pos) return null
  return (
    <div style={{
      position: 'absolute', left: pos.x, top: pos.y, transform: pos.izq ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
      background: '#fff', border: '1px solid #dcdce4', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.12)',
      padding: '7px 10px', fontSize: 12.5, pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap', color: '#1f1f27',
    }}>{children}</div>
  )
}

function FilaTooltip({ color, nombre, valor }) {
  return (
    <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
      <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{nombre}</span>
      <strong style={{ marginLeft: 12 }}>{fmt(valor)}</strong>
    </div>
  )
}

// Líneas con cruz y detalle al pasar el mouse (evolución en el tiempo)
function GraficoLineas({ puntos, series, etiquetaX, tituloPunto }) {
  const [ref, w] = useAncho()
  const [hover, setHover] = useState(null)
  const alto = 250
  const m = { t: 12, r: 14, b: 30, l: 46 }
  const iw = w - m.l - m.r
  const ih = alto - m.t - m.b
  const max = Math.max(1, ...puntos.flatMap((p) => series.map((s) => p[s.clave] || 0)))
  const tk = marcas(max)
  const tope = tk[tk.length - 1]
  const x = (i) => m.l + (puntos.length <= 1 ? iw / 2 : (i * iw) / (puntos.length - 1))
  const y = (v) => m.t + ih - (v / tope) * ih
  const cadaCuanto = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor(iw / 70))))

  function mover(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = puntos.length <= 1 ? 0 : Math.round(((px - m.l) / iw) * (puntos.length - 1))
    setHover(Math.max(0, Math.min(puntos.length - 1, i)))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Leyenda series={series} />
      <svg width={w} height={alto} onMouseMove={mover} onMouseLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}
        onTouchStart={(e) => mover(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)}>
        {tk.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={GRILLA} strokeWidth="1" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={TEXTO2}>{fmt(v)}</text>
          </g>
        ))}
        {puntos.map((p, i) => (i % cadaCuanto === 0 || i === puntos.length - 1) && (
          <text key={i} x={x(i)} y={alto - 8} textAnchor={i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle'} fontSize="11" fill={TEXTO2}>{etiquetaX(p)}</text>
        ))}
        {series.map((s, k) => {
          const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[s.clave] || 0)}`).join('')
          return (
            <g key={s.clave}>
              {k === 0 && puntos.length > 1 && (
                <path d={`${d}L${x(puntos.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} opacity="0.1" />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} stroke="#b9b9c4" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.clave} cx={x(hover)} cy={y(puntos[hover][s.clave] || 0)} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip pos={{ x: x(hover) + (x(hover) > w / 2 ? -10 : 10), y: 34, izq: x(hover) > w / 2 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tituloPunto(puntos[hover])}</div>
          {series.map((s) => <FilaTooltip key={s.clave} color={s.color} nombre={s.nombre} valor={puntos[hover][s.clave]} />)}
        </Tooltip>
      )}
    </div>
  )
}

// Barras horizontales (una o dos series por fila), valor en la punta
function BarrasH({ filas, series, etiqueta, maxFilas = 12 }) {
  const [hover, setHover] = useState(null)
  const visibles = filas.slice(0, maxFilas)
  const max = Math.max(1, ...visibles.flatMap((f) => series.map((s) => f[s.clave] || 0)))
  return (
    <div style={{ position: 'relative' }}>
      {series.length > 1 && <Leyenda series={series} />}
      {visibles.map((f, i) => (
        <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 36%) 1fr', gap: 10, alignItems: 'center', padding: '4px 0', borderRadius: 6, background: hover === i ? '#f6f6f9' : undefined }}>
          <div title={etiqueta(f)} style={{ fontSize: 12.5, color: '#2a2a33', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiqueta(f)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {series.map((s) => {
              const v = f[s.clave] || 0
              return (
                <div key={s.clave} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <div style={{ height: series.length > 1 ? 10 : 14, width: `${Math.max(v ? 1.5 : 0, (v / max) * 82)}%`, background: s.color, borderRadius: '0 4px 4px 0' }} />
                  <span style={{ fontSize: 11.5, color: TEXTO2, fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {filas.length > maxFilas && <div className="tl-meta" style={{ marginTop: 6 }}>Y {filas.length - maxFilas} más (ver la tabla).</div>}
    </div>
  )
}

// Columnas (una o dos series), para tramos o meses
function Columnas({ datos, series, etiqueta, alto = 190 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...datos.flatMap((d) => series.map((s) => d[s.clave] || 0)))
  const tk = marcas(max)
  const tope = tk[tk.length - 1]
  return (
    <div style={{ position: 'relative' }}>
      {series.length > 1 && <Leyenda series={series} />}
      <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr', gap: 6 }}>
        <div style={{ position: 'relative', height: alto }}>
          {tk.map((v) => (
            <div key={v} style={{ position: 'absolute', right: 0, bottom: `${(v / tope) * 100}%`, transform: 'translateY(50%)', fontSize: 11, color: TEXTO2 }}>{fmt(v)}</div>
          ))}
        </div>
        <div>
          <div style={{ position: 'relative', height: alto, display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: `1px solid ${GRILLA}` }}>
            {tk.map((v) => <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(v / tope) * 100}%`, borderTop: `1px solid ${GRILLA}` }} />)}
            {datos.map((d, i) => (
              <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, position: 'relative', background: hover === i ? 'rgba(0,0,0,.03)' : undefined, borderRadius: 4 }}>
                {series.map((s) => (
                  <div key={s.clave} style={{ width: series.length > 1 ? '38%' : '56%', maxWidth: 24, height: `${((d[s.clave] || 0) / tope) * 100}%`, background: s.color, borderRadius: '4px 4px 0 0', position: 'relative' }}>
                    {series.length === 1 && (d[s.clave] || 0) > 0 && (
                      <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: TEXTO2, paddingBottom: 2 }}>{fmt(d[s.clave])}</span>
                    )}
                  </div>
                ))}
                {hover === i && series.length > 1 && (
                  <Tooltip pos={{ x: '50%', y: -6, izq: false }}>
                    <div style={{ transform: 'translateX(-50%)' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{etiqueta(d)}</div>
                      {series.map((s) => <FilaTooltip key={s.clave} color={s.color} nombre={s.nombre} valor={d[s.clave]} />)}
                    </div>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            {datos.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: TEXTO2, lineHeight: 1.2 }}>{etiqueta(d)}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

// Tarjeta con opción de ver los datos como tabla
function Tarjeta({ titulo, sub, columnas, filas, children }) {
  const [tabla, setTabla] = useState(false)
  return (
    <div className="card">
      <div className="card-header">
        <span>
          <span className="card-title">{titulo}</span>
          {sub && <span className="tl-meta" style={{ marginLeft: 8 }}>{sub}</span>}
        </span>
        {columnas && <button className="btn btn-ghost btn-sm" onClick={() => setTabla((t) => !t)}>{tabla ? 'Ver gráfico' : 'Ver tabla'}</button>}
      </div>
      <div className="card-body">
        {tabla ? (
          <div className="table-scroll" style={{ maxHeight: 360 }}>
            <table className="data">
              <thead><tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{filas.map((f, i) => <tr key={i} style={{ cursor: 'default' }}>{f.map((c, j) => <td key={j} className={j ? 'mono' : ''}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : children}
      </div>
    </div>
  )
}

// Número principal con comparación contra el período anterior
function Numero({ etiqueta, valor, anterior, subeBueno = true, sufijo = '', nota }) {
  let delta = null
  if (anterior != null && valor != null) {
    if (anterior === 0) delta = valor === 0 ? { txt: 'igual que el período anterior', neutro: true } : null
    else if (anterior < 5 || Math.abs((valor - anterior) / anterior) > 5) {
      // Con muy pocos datos antes, el porcentaje no dice nada: se muestra el número
      delta = { txt: `período anterior: ${fmt(anterior)}${sufijo}`, neutro: true }
    } else {
      const pct = Math.round(((valor - anterior) / anterior) * 100)
      const bueno = pct === 0 || subeBueno === null ? null : (pct > 0) === subeBueno
      delta = { txt: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% vs. período anterior (${fmt(anterior)}${sufijo})`, bueno, neutro: bueno === null }
    }
  }
  return (
    <div className="stat-card" style={{ textAlign: 'left' }}>
      <div className="stat-label" style={{ marginBottom: 4 }}>{etiqueta}</div>
      <div className="stat-num" style={{ fontFamily: 'inherit' }}>{fmt(valor)}{valor != null && sufijo}</div>
      {delta && (
        <div style={{ fontSize: 11.5, marginTop: 4, color: delta.neutro ? TEXTO2 : delta.bueno ? '#1d6b3c' : '#9b1c1c' }}>{delta.txt}</div>
      )}
      {nota && <div style={{ fontSize: 11.5, marginTop: 4, color: TEXTO2 }}>{nota}</div>}
    </div>
  )
}

// ── Pantalla ───────────────────────────────────────────────────
export default function Estadisticas() {
  const [preset, setPreset] = useState('mes')
  const [desde, setDesde] = useState(() => rango('mes')[0])
  const [hasta, setHasta] = useState(() => rango('mes')[1])
  const [stats, setStats] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!desde || !hasta || hasta < desde) return
    let vivo = true
    setCargando(true); setError('')
    api('/api/reportes/estadisticas', { params: { desde, hasta } })
      .then((s) => { if (vivo) setStats(s) })
      .catch((e) => { if (vivo) setError(e.message) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [desde, hasta])

  function elegir(clave) {
    const r = rango(clave)
    setPreset(clave); setDesde(r[0]); setHasta(r[1])
  }

  const mes = mesCompleto(desde, hasta)
  function descargarExcel() {
    fetch(`${API_BASE}/api/reportes/mensual/excel?anio=${mes.anio}&mes=${mes.mes}`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const u = URL.createObjectURL(blob); const a = document.createElement('a')
        a.href = u; a.download = `reporte_${mes.anio}_${String(mes.mes).padStart(2, '0')}.xlsx`
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u)
      })
  }

  const etiquetaPunto = useMemo(() => {
    if (!stats) return () => ''
    if (stats.paso === 'dia') return (p) => dCorta(p.inicio)
    if (stats.paso === 'semana') return (p) => dCorta(p.inicio)
    return (p) => { const [y, m] = p.inicio.split('-'); return `${MESES_C[Number(m) - 1]} ${y.slice(2)}` }
  }, [stats])
  const tituloPunto = (p) => {
    if (stats.paso === 'dia') return f2(p.inicio)
    if (stats.paso === 'semana') return `Semana del ${f2(p.inicio)} al ${f2(p.fin)}`
    const [y, m] = p.inicio.split('-'); return `${MESES[Number(m) - 1]} ${y}`
  }

  const v = stats?.vistas
  const ant = stats?.anterior
  const dem = stats?.demoras
  const personas = (stats?.por_persona || []).filter((p) => p.ingresadas || p.resueltas)

  return (
    <div>
      {/* Período: una sola fila arriba de todo */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body" style={{ padding: '12px 14px' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {PRESETS.map(([k, t]) => (
              <button key={k} className={'btn btn-sm ' + (preset === k ? 'btn-navy' : 'btn-ghost')} onClick={() => elegir(k)}>{t}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Desde</span>
            <input type="date" value={desde} max={hasta} onChange={(e) => { setPreset(''); setDesde(e.target.value) }} style={{ width: 160 }} />
            <span style={{ fontSize: 13 }}>hasta</span>
            <input type="date" value={hasta} min={desde} onChange={(e) => { setPreset(''); setHasta(e.target.value) }} style={{ width: 160 }} />
            {cargando && <span className="spin" />}
            <span className="spacer" />
            {mes && <button className="btn btn-teal btn-sm" onClick={descargarExcel}><Icono nombre="exportar" size={14} />Excel del mes</button>}
          </div>
          {stats && (
            <div className="tl-meta" style={{ marginTop: 8 }}>
              {f2(stats.desde)} al {f2(stats.hasta)} ({fmt(stats.dias)} {stats.dias === 1 ? 'día' : 'días'}) · se compara con {f2(ant.desde)} al {f2(ant.hasta)}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-red">{error}</div>}
      {!stats ? <div className="loading-center"><span className="spin" /></div> : (
        <div style={{ opacity: cargando ? 0.55 : 1, transition: 'opacity .15s' }}>
          {/* Números principales */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Numero etiqueta="Vistas ingresadas" valor={v.ingresadas} anterior={ant.ingresadas} subeBueno={null} />
            <Numero etiqueta="Subidas al Lex" valor={v.resueltas} anterior={ant.resueltas} />
            <Numero etiqueta="Demora promedio" valor={dem.total} anterior={ant.demora_total} subeBueno={false} sufijo=" días" nota="de que entra a que se sube al Lex" />
            <Numero etiqueta="Proyectos enviados a la firma" valor={stats.proyectos.enviados} anterior={ant.proyectos} />
            <Numero etiqueta="Pendientes hoy" valor={v.pendientes} nota={`${fmt(v.urgentes)} urgentes · ${fmt(v.repetidas)} repetidas en el período`} />
          </div>

          {/* Evolución en el tiempo */}
          <Tarjeta
            titulo="Vistas ingresadas y subidas al Lex"
            sub={stats.paso === 'dia' ? 'por día' : stats.paso === 'semana' ? 'por semana' : 'por mes'}
            columnas={[stats.paso === 'dia' ? 'Día' : stats.paso === 'semana' ? 'Semana' : 'Mes', 'Ingresadas', 'Subidas al Lex']}
            filas={stats.serie.map((p) => [tituloPunto(p), fmt(p.ingresadas), fmt(p.resueltas)])}
          >
            {stats.serie.every((p) => !p.ingresadas && !p.resueltas)
              ? <div className="empty">Sin movimientos en el período.</div>
              : <GraficoLineas puntos={stats.serie} series={SERIES_VISTAS} etiquetaX={etiquetaPunto} tituloPunto={tituloPunto} />}
          </Tarjeta>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
            <Tarjeta
              titulo="Por persona"
              sub="según la asignación de la vista"
              columnas={['Persona', 'Ingresadas', 'Subidas al Lex', 'Pendientes hoy', 'Urgentes', 'Enviadas a la firma']}
              filas={(stats.por_persona || []).map((p) => [p.persona, fmt(p.ingresadas), fmt(p.resueltas), fmt(p.pendientes), fmt(p.urgentes), fmt(p.a_la_firma)])}
            >
              {personas.length === 0 ? <div className="empty">Sin vistas en el período.</div>
                : <BarrasH filas={personas} series={SERIES_VISTAS} etiqueta={(f) => f.persona} maxFilas={14} />}
            </Tarjeta>

            <Tarjeta
              titulo="Por tipo de proceso"
              sub="según la carátula"
              columnas={['Tipo de proceso', 'Vistas']}
              filas={(stats.por_tipo || []).map((t) => [t.tipo, fmt(t.cantidad)])}
            >
              {(stats.por_tipo || []).length === 0 ? <div className="empty">Sin datos en el período.</div>
                : <BarrasH filas={stats.por_tipo} series={[{ clave: 'cantidad', nombre: 'Vistas', color: C_ENTRA }]} etiqueta={(f) => f.tipo} maxFilas={13} />}
            </Tarjeta>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
            <Tarjeta
              titulo="¿Cuánto tardan en subirse al Lex?"
              sub="vistas subidas en el período, días corridos"
              columnas={['Demora', 'Vistas']}
              filas={stats.distribucion_demora.map((d) => [d.tramo, fmt(d.cantidad)])}
            >
              {stats.distribucion_demora.every((d) => !d.cantidad) ? <div className="empty">Sin vistas subidas en el período.</div> : (
                <>
                  <Columnas datos={stats.distribucion_demora} series={[{ clave: 'cantidad', nombre: 'Vistas', color: C_ENTRA }]} etiqueta={(d) => d.tramo} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 14, fontSize: 12.5 }}>
                    <div><span style={{ color: TEXTO2 }}>Hasta el pase a la firma</span><br /><strong>{dem.hasta_firma ?? '—'}</strong> días promedio</div>
                    <div><span style={{ color: TEXTO2 }}>De la firma al Lex</span><br /><strong>{dem.firma_a_lex ?? '—'}</strong> días promedio</div>
                    <div><span style={{ color: TEXTO2 }}>Proyectos: del envío a la subida</span><br /><strong>{dem.proyectos ?? '—'}</strong> días promedio</div>
                  </div>
                </>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="Antigüedad de lo pendiente"
              sub="hoy, desde que entró la vista"
              columnas={['Antigüedad', 'Vistas pendientes']}
              filas={stats.antiguedad_pendientes.map((d) => [d.tramo, fmt(d.cantidad)])}
            >
              {stats.antiguedad_pendientes.every((d) => !d.cantidad) ? <div className="empty">No hay vistas pendientes.</div>
                : <Columnas datos={stats.antiguedad_pendientes} series={[{ clave: 'cantidad', nombre: 'Vistas', color: C_ENTRA }]} etiqueta={(d) => d.tramo} />}
            </Tarjeta>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
            <Tarjeta
              titulo="Por juzgado"
              columnas={['Juzgado', 'Vistas']}
              filas={(stats.por_juzgado || []).map((j) => [j.juzgado === 'Sin dato' ? 'Sin dato' : `Juzgado ${j.juzgado}`, fmt(j.cantidad)])}
            >
              {(stats.por_juzgado || []).length === 0 ? <div className="empty">Sin datos en el período.</div>
                : <BarrasH filas={stats.por_juzgado} series={[{ clave: 'cantidad', nombre: 'Vistas', color: C_ENTRA }]} etiqueta={(f) => (f.juzgado === 'Sin dato' ? 'Sin dato' : `Juzgado ${f.juzgado}`)} maxFilas={12} />}
            </Tarjeta>

            <Tarjeta
              titulo="Últimos 12 meses"
              sub="para ver la tendencia"
              columnas={['Mes', 'Ingresadas', 'Subidas al Lex']}
              filas={stats.evolucion.map((e) => [`${MESES[e.mes - 1]} ${e.anio}`, fmt(e.ingresadas), fmt(e.resueltas)])}
            >
              <Columnas datos={stats.evolucion} series={SERIES_VISTAS} etiqueta={(e) => `${MESES_C[e.mes - 1]} ${String(e.anio).slice(2)}`} alto={170} />
            </Tarjeta>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
            <div className="card">
              <div className="card-header"><span className="card-title">Audiencias del período</span></div>
              <div className="card-body">
                <Dato k="Total" v={stats.audiencias.total} />
                {Object.entries(stats.audiencias.por_modalidad).map(([k, c]) => <Dato key={k} k={k} v={c} />)}
                {Object.keys(stats.audiencias.por_persona).length > 0 && <div className="card-title" style={{ margin: '12px 0 6px' }}>Quién asiste</div>}
                {Object.entries(stats.audiencias.por_persona).map(([k, c]) => <Dato key={k} k={k} v={c} />)}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">A la firma y totales</span></div>
              <div className="card-body">
                <Dato k="Proyectos enviados en el período" v={stats.proyectos.enviados} />
                <Dato k="Dictámenes subidos en el período" v={stats.proyectos.subidos} />
                <Dato k="En corrección ahora" v={stats.proyectos.en_correccion} />
                <div className="card-title" style={{ margin: '12px 0 6px' }}>Totales generales</div>
                <Dato k="Expedientes activos" v={stats.totales.expedientes_activos} />
                <Dato k="Expedientes archivados" v={stats.totales.expedientes_archivados} />
                <Dato k="Expedientes nuevos en el período" v={stats.totales.expedientes_nuevos_periodo} />
                <Dato k="Legajos" v={stats.totales.legajos} />
                <Dato k="Instituciones en el mapa" v={stats.totales.instituciones} />
                <Dato k="Personas alojadas registradas" v={stats.totales.personas_alojadas} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Dato({ k, v }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f4', fontSize: 13.5 }}>
      <span>{k}</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</strong>
    </div>
  )
}
