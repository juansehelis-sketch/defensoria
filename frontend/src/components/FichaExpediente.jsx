/**
 * Ficha "Historia Social" del expediente: la estructura del modelo en Word,
 * pero editable directamente en pantalla (sin descargar archivos).
 *  - Campos sueltos arriba (fecha de inicio, tutor, etc.): se agregan y quitan.
 *  - Secciones de tabla (datos del niño, familia, medidas...): filas que se
 *    agregan y quitan, celdas que se editan con un clic.
 *  - Secciones de texto (reseña, situación problema).
 *  - Seguimiento: entradas cronológicas (una por mes o cuando haga falta).
 * Todo se guarda solo unos segundos después de cada cambio.
 */

import { useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'
import { confirmar } from '../ui'
import Icono from './Icono'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const inputCell = {
  width: '100%', border: '1px solid transparent', background: 'transparent',
  padding: '4px 6px', borderRadius: 4, fontFamily: 'inherit', fontSize: 13,
}

export default function FichaExpediente({ expedienteId }) {
  const [ficha, setFicha] = useState(null)
  const [abierta, setAbierta] = useState(false)
  const [estado, setEstado] = useState('') // '' | 'guardando' | 'ok' | 'error'
  const timer = useRef(null)
  const primera = useRef(true)

  useEffect(() => {
    api(`/api/expedientes/${expedienteId}/ficha`).then((f) => { primera.current = true; setFicha(f) }).catch(() => {})
  }, [expedienteId])

  // Autoguardado con retardo tras cada cambio.
  useEffect(() => {
    if (!ficha) return
    if (primera.current) { primera.current = false; return }
    setEstado('guardando')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        await api(`/api/expedientes/${expedienteId}/ficha`, { method: 'PUT', body: ficha })
        setEstado('ok')
        setTimeout(() => setEstado(''), 2500)
      } catch { setEstado('error') }
    }, 900)
    return () => clearTimeout(timer.current)
  }, [ficha])

  if (!ficha) return null

  // Helpers de actualización inmutable
  const setCampo = (i, k, v) => setFicha((f) => ({ ...f, campos: f.campos.map((c, ci) => ci === i ? { ...c, [k]: v } : c) }))
  const setSec = (i, cambio) => setFicha((f) => ({ ...f, secciones: f.secciones.map((s, si) => si === i ? { ...s, ...cambio } : s) }))

  function agregarCampo() {
    const etiqueta = window.prompt('Nombre del dato (ej: DNI en trámite, Obra social...):', '')
    if (etiqueta === null || !etiqueta.trim()) return
    setFicha((f) => ({ ...f, campos: [...f.campos, { etiqueta: etiqueta.trim(), valor: '' }] }))
  }
  function quitarCampo(i) {
    setFicha((f) => ({ ...f, campos: f.campos.filter((_, ci) => ci !== i) }))
  }
  async function agregarSeccion() {
    const nombre = window.prompt('Título de la sección nueva:', '')
    if (nombre === null || !nombre.trim()) return
    const tipo = (await confirmar({ titulo: 'Tipo de sección', mensaje: '¿La sección nueva es una TABLA?', ok: 'Tabla', cancelar: 'Texto libre' })) ? 'tabla' : 'texto'
    let sec
    if (tipo === 'tabla') {
      const cols = window.prompt('Nombres de las columnas, separados por coma:', 'Dato, Observaciones')
      if (cols === null) return
      const columnas = cols.split(',').map((c) => c.trim()).filter(Boolean)
      if (!columnas.length) return
      sec = { titulo: nombre.trim(), tipo: 'tabla', columnas, filas: [] }
    } else {
      sec = { titulo: nombre.trim(), tipo: 'texto', texto: '' }
    }
    setFicha((f) => ({ ...f, secciones: [...f.secciones, sec] }))
  }
  async function quitarSeccion(i) {
    if (!(await confirmar({ mensaje: `¿Eliminar la sección "${ficha.secciones[i].titulo}" y su contenido?`, ok: 'Eliminar', peligro: true }))) return
    setFicha((f) => ({ ...f, secciones: f.secciones.filter((_, si) => si !== i) }))
  }

  return (
    <div className="card">
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setAbierta((v) => !v)}>
        <span className="card-title"><Icono nombre="resumen" size={16} color="var(--teal)" /> Ficha · Historia Social</span>
        <div className="row" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()}>
          {estado === 'guardando' && <span className="tl-meta">guardando…</span>}
          {estado === 'ok' && <span className="tl-meta" style={{ color: '#15803d' }}>✓ guardado</span>}
          {estado === 'error' && <span className="tl-meta" style={{ color: 'var(--red)' }}>no se pudo guardar</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => setAbierta((v) => !v)}>{abierta ? 'Ocultar' : 'Abrir ficha'}</button>
        </div>
      </div>

      {abierta && (
        <div className="card-body">
          {/* Campos del encabezado */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            {ficha.campos.map((c, i) => (
              <div key={i} className="row" style={{ gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', background: '#fafbfd' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{c.etiqueta}:</span>
                <input value={c.valor} onChange={(e) => setCampo(i, 'valor', e.target.value)} placeholder="—"
                  style={{ border: 'none', background: 'transparent', fontSize: 13, minWidth: 90 }} />
                <button onClick={() => quitarCampo(i)} title="Quitar este dato"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>×</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={agregarCampo}><Icono nombre="agregar" size={13} /> Agregar dato</button>
          </div>

          {/* Secciones */}
          {ficha.secciones.map((s, si) => (
            <Seccion key={si} sec={s} onCambio={(cambio) => setSec(si, cambio)} onQuitar={() => quitarSeccion(si)} />
          ))}

          <button className="btn btn-ghost btn-sm" onClick={agregarSeccion} style={{ marginTop: 4 }}>
            <Icono nombre="agregar" size={14} /> Agregar sección
          </button>
        </div>
      )}
    </div>
  )
}

function Seccion({ sec, onCambio, onQuitar }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif', fontSize: 15 }}>{sec.titulo}</div>
        <button className="btn btn-ghost btn-sm" onClick={onQuitar} title="Eliminar sección" style={{ color: 'var(--muted)' }}>
          <Icono nombre="borrar" size={13} />
        </button>
      </div>

      {sec.tipo === 'texto' && (
        <textarea value={sec.texto || ''} onChange={(e) => onCambio({ texto: e.target.value })}
          placeholder="Escribí acá..." style={{ width: '100%', minHeight: 90, fontSize: 13.5, lineHeight: 1.6 }} />
      )}

      {sec.tipo === 'tabla' && <TablaSec sec={sec} onCambio={onCambio} />}

      {sec.tipo === 'entradas' && <Entradas sec={sec} onCambio={onCambio} />}
    </div>
  )
}

function TablaSec({ sec, onCambio }) {
  const setCelda = (fi, ci, v) => onCambio({ filas: sec.filas.map((f, i) => i === fi ? f.map((c, j) => j === ci ? v : c) : f) })
  const agregarFila = () => onCambio({ filas: [...sec.filas, sec.columnas.map(() => '')] })
  const quitarFila = (fi) => onCambio({ filas: sec.filas.filter((_, i) => i !== fi) })

  return (
    <div className="table-scroll">
      <table className="data" style={{ tableLayout: 'auto' }}>
        <thead>
          <tr>{sec.columnas.map((c, i) => <th key={i}>{c}</th>)}<th style={{ width: 30 }}></th></tr>
        </thead>
        <tbody>
          {sec.filas.map((fila, fi) => (
            <tr key={fi} style={{ cursor: 'default' }}>
              {fila.map((celda, ci) => (
                <td key={ci} style={{ padding: '2px 4px' }}>
                  <input value={celda} onChange={(e) => setCelda(fi, ci, e.target.value)} style={inputCell}
                    onFocus={(e) => { e.target.style.border = '1.5px solid var(--teal)'; e.target.style.background = '#fff' }}
                    onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent' }} />
                </td>
              ))}
              <td><button onClick={() => quitarFila(fi)} title="Quitar fila" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }}>×</button></td>
            </tr>
          ))}
          <tr>
            <td colSpan={sec.columnas.length + 1} style={{ padding: '4px 6px' }}>
              <button className="btn btn-ghost btn-sm" onClick={agregarFila}><Icono nombre="agregar" size={12} /> Agregar fila</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Entradas({ sec, onCambio }) {
  const entradas = sec.entradas || []
  const setEntrada = (i, k, v) => onCambio({ entradas: entradas.map((e, ei) => ei === i ? { ...e, [k]: v } : e) })
  const quitar = async (i) => { if (await confirmar({ mensaje: '¿Eliminar esta entrada del seguimiento?', ok: 'Eliminar', peligro: true })) onCambio({ entradas: entradas.filter((_, ei) => ei !== i) }) }
  function agregar() {
    const hoy = new Date()
    onCambio({ entradas: [...entradas, { titulo: `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`, texto: '' }] })
  }

  return (
    <div>
      {entradas.map((e, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderLeft: '4px solid var(--teal)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: '#fafbfd' }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <input value={e.titulo} onChange={(ev) => setEntrada(i, 'titulo', ev.target.value)}
              style={{ fontWeight: 700, color: 'var(--navy)', border: 'none', background: 'transparent', fontSize: 14, minWidth: 160 }} />
            <button onClick={() => quitar(i)} title="Eliminar entrada" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
          </div>
          <textarea value={e.texto} onChange={(ev) => setEntrada(i, 'texto', ev.target.value)}
            placeholder="Qué pasó en este período..." style={{ width: '100%', minHeight: 70, fontSize: 13.5, lineHeight: 1.6, border: '1px solid var(--border)', borderRadius: 6 }} />
        </div>
      ))}
      <button className="btn btn-teal btn-sm" onClick={agregar}><Icono nombre="agregar" size={13} /> Nueva entrada de seguimiento</button>
    </div>
  )
}
