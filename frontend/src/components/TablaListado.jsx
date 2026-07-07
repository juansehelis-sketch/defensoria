/**
 * Tabla del listado con edición inline tipo Excel:
 *  - Click (o empezar a escribir) edita la celda; se guarda sola.
 *  - Tab / Shift+Tab: celda siguiente / anterior.
 *  - Enter: baja a la celda de abajo. Escape: cancela.
 *  - Última fila siempre VACÍA (si se pasa fechaNueva): escribir ahí crea la
 *    fila sola, como en Excel. Sin botón ni formulario.
 *  - Borrar es UN clic, sin cartel: aparece "Deshacer" unos segundos y además
 *    queda copia en la papelera.
 * Cambiar "Pase a la firma" o "Subido al Lex" repinta la fila (amarillo / verde).
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../utils/api'
import { avisar } from '../ui'
import { fechaCorta, colorFila } from '../utils/format'
import Icono from './Icono'

const inputStyle = {
  width: '100%', padding: '4px 6px', border: '1.5px solid var(--teal)',
  borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff',
}

function Celda({ valor, tipo = 'text', opciones, render, activa, onActivar, onGuardar, onNav }) {
  const [val, setVal] = useState(valor ?? '')
  const guardado = useRef(false)

  // Al activarse, reinicia el valor editable y la bandera de guardado.
  useEffect(() => { if (activa) { setVal(valor ?? ''); guardado.current = false } }, [activa])

  function commit() {
    if (guardado.current) return       // evita doble guardado (blur + tecla)
    guardado.current = true
    const limpio = val === '' ? null : val
    if ((limpio ?? '') !== (valor ?? '')) onGuardar(limpio)
  }

  function onBlur(e) {
    commit()
    // Si el foco salió de la tabla, desactivar (mostrar el valor, no el input).
    const tabla = e.currentTarget.closest('table')
    setTimeout(() => { if (!tabla || !tabla.contains(document.activeElement)) onActivar(null) }, 0)
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); onNav('abajo') }
    else if (e.key === 'Tab') { e.preventDefault(); commit(); onNav(e.shiftKey ? 'izquierda' : 'derecha') }
    else if (e.key === 'Escape') { setVal(valor ?? ''); guardado.current = true; onActivar(null) }
  }

  if (!activa) {
    return (
      <div onClick={(e) => { e.stopPropagation(); onActivar() }} title="Click para editar (Tab/Enter para moverte)"
        style={{ cursor: 'text', minHeight: 18, minWidth: 28 }}>
        {valor ? (render ? render(valor) : valor) : <span className="dash">—</span>}
      </div>
    )
  }
  if (tipo === 'select') {
    return (
      <select autoFocus value={val} onClick={(e) => e.stopPropagation()}
        onChange={(e) => setVal(e.target.value)} onBlur={onBlur} onKeyDown={onKey} style={inputStyle}>
        <option value="">— sin asignar —</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  return (
    <input autoFocus type={tipo} value={val} onClick={(e) => e.stopPropagation()}
      onChange={(e) => setVal(e.target.value)} onBlur={onBlur} onKeyDown={onKey} style={inputStyle} />
  )
}

const NUEVA = '__nueva__' // id virtual de la fila vacía del final

export default function TablaListado({ registros, despachantes = [], mostrarFecha = false, mostrarUrgente = false, fechaNueva = null, onCambio, onAbrir }) {
  const nombres = despachantes.map((d) => d.nombre)
  const COLS = useMemo(
    () => [...(mostrarFecha ? ['fecha'] : []), 'juzgado', 'autos', 'asignacion', 'pase_firma', 'subido_lex', 'observaciones'],
    [mostrarFecha],
  )
  // La fila nueva tiene además la celda del N° de expediente.
  const NCOLS = useMemo(
    () => [...(mostrarFecha ? ['fecha'] : []), 'juzgado', 'numero_expediente', 'autos', 'asignacion', 'pase_firma', 'subido_lex', 'observaciones'],
    [mostrarFecha],
  )
  const [activa, setActiva] = useState(null)
  const [nuevo, setNuevo] = useState({})
  const [borrada, setBorrada] = useState(null) // última fila borrada (para Deshacer)
  const timerRef = useRef(null)

  const esActiva = (id, campo) => activa && activa.fila === id && activa.campo === campo

  function navegar(id, campo, dir) {
    const ri = registros.findIndex((r) => r.id === id)
    const ci = COLS.indexOf(campo)
    let nri = ri, nci = ci
    if (dir === 'abajo') nri = ri + 1
    else if (dir === 'derecha') { nci = ci + 1; if (nci >= COLS.length) { nci = 0; nri = ri + 1 } }
    else if (dir === 'izquierda') { nci = ci - 1; if (nci < 0) { nci = COLS.length - 1; nri = ri - 1 } }
    if (nri < 0) { setActiva(null); return }
    if (nri >= registros.length) {
      // Bajar desde la última fila → entrar a la fila vacía (si está habilitada)
      setActiva(fechaNueva ? { fila: NUEVA, campo: COLS[nci] } : null)
      return
    }
    setActiva({ fila: registros[nri].id, campo: COLS[nci] })
  }

  async function set(id, campo, valor) {
    try {
      await api(`/api/entrada-salida/${id}`, { method: 'PUT', body: { [campo]: valor } })
      onCambio?.()
    } catch (e) { avisar('No se pudo guardar: ' + e.message, 'error') }
  }

  // ── Borrar en un clic + Deshacer ─────────────────────────────
  async function borrar(r) {
    try {
      await api(`/api/entrada-salida/${r.id}`, { method: 'DELETE' })
      if (timerRef.current) clearTimeout(timerRef.current)
      setBorrada(r)
      timerRef.current = setTimeout(() => setBorrada(null), 8000)
      onCambio?.()
    } catch (e) { avisar('No se pudo borrar: ' + e.message, 'error') }
  }

  async function deshacer() {
    const r = borrada
    if (!r) return
    setBorrada(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await api('/api/entrada-salida/', {
        method: 'POST',
        body: {
          fecha: r.fecha, juzgado: r.juzgado || '', autos: r.autos || '',
          asignacion: r.asignacion || '', numero_expediente: r.numero_expediente || null,
          pase_firma: r.pase_firma || null, subido_lex: r.subido_lex || null,
          observaciones: r.observaciones || null, urgente: !!r.urgente,
        },
      })
      onCambio?.()
    } catch (e) { avisar('No se pudo deshacer: ' + e.message, 'error') }
  }

  // ── Fila nueva (siempre vacía al final): escribir ahí crea la fila ──
  function navegarNueva(campo, dir) {
    const ci = NCOLS.indexOf(campo)
    if (dir === 'derecha') { const n = NCOLS[ci + 1]; setActiva(n ? { fila: NUEVA, campo: n } : null); return }
    if (dir === 'izquierda') {
      if (ci > 0) { setActiva({ fila: NUEVA, campo: NCOLS[ci - 1] }); return }
      if (registros.length) { setActiva({ fila: registros[registros.length - 1].id, campo: COLS[COLS.length - 1] }); return }
      setActiva(null); return
    }
    setActiva(null) // abajo desde la fila nueva: no hay más filas
  }

  async function guardarNueva(campo, valor) {
    const upd = { ...nuevo, [campo]: valor }
    setNuevo(upd)
    // La fila se crea sola apenas hay carátula o número de expediente.
    if (!(upd.autos || '').trim() && !(upd.numero_expediente || '').trim()) return
    try {
      const creado = await api('/api/entrada-salida/', {
        method: 'POST',
        body: {
          fecha: upd.fecha || fechaNueva, juzgado: upd.juzgado || '', autos: upd.autos || '',
          asignacion: upd.asignacion || '', numero_expediente: (upd.numero_expediente || '').trim() || null,
          pase_firma: upd.pase_firma || null, subido_lex: upd.subido_lex || null,
          observaciones: upd.observaciones || null,
        },
      })
      setNuevo({})
      onCambio?.()
      // Seguir escribiendo en la fila recién creada, en la columna siguiente.
      const sig = NCOLS[NCOLS.indexOf(campo) + 1]
      const campoSig = sig === 'numero_expediente' ? 'autos' : sig
      setActiva(creado?.id && campoSig ? { fila: creado.id, campo: campoSig } : null)
    } catch (e) { avisar('No se pudo agregar la fila: ' + e.message, 'error') }
  }

  const cpN = (campo) => ({
    activa: esActiva(NUEVA, campo),
    onActivar: (v) => setActiva(v === null ? null : { fila: NUEVA, campo }),
    onNav: (dir) => navegarNueva(campo, dir),
    onGuardar: (v) => guardarNueva(campo, v),
  })

  // Props comunes de cada celda editable.
  const cp = (r, campo) => ({
    activa: esActiva(r.id, campo),
    onActivar: (v) => setActiva(v === null ? null : { fila: r.id, campo }),
    onNav: (dir) => navegar(r.id, campo, dir),
    onGuardar: (v) => set(r.id, campo, v),
  })

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            {mostrarUrgente && <th></th>}
            {mostrarFecha && <th>Fecha</th>}
            <th>Juzgado</th><th>Expediente</th><th>Autos</th><th>Asignación</th>
            <th>Pase a la firma</th><th>Subido al Lex</th><th>Observaciones</th><th></th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} style={{ background: r.urgente && mostrarUrgente ? 'var(--red-lt)' : colorFila(r) }}>
              {mostrarUrgente && <td>{r.urgente && <span className="badge" style={{ background: 'var(--red)', color: '#fff' }}>URGENTE</span>}</td>}
              {mostrarFecha && <td className="mono"><Celda valor={r.fecha} tipo="date" render={fechaCorta} {...cp(r, 'fecha')} /></td>}
              <td className="mono" style={{ minWidth: 60 }}><Celda valor={r.juzgado} {...cp(r, 'juzgado')} /></td>
              <td className="mono">{r.numero_expediente || '—'}</td>
              <td style={{ minWidth: 260 }}>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <div style={{ flex: 1, minWidth: 0 }}><Celda valor={r.autos} {...cp(r, 'autos')} /></div>
                  {r.urgente && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>— URGENTE</span>}
                </div>
              </td>
              <td style={{ minWidth: 90 }}><Celda valor={r.asignacion} tipo="select" opciones={nombres} {...cp(r, 'asignacion')} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={r.pase_firma} tipo="date" render={fechaCorta} {...cp(r, 'pase_firma')} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={r.subido_lex} tipo="date" render={fechaCorta} {...cp(r, 'subido_lex')} /></td>
              <td className="muted" style={{ minWidth: 160 }}><Celda valor={r.observaciones} {...cp(r, 'observaciones')} /></td>
              <td>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  {r.expediente_id && <button className="btn btn-ghost btn-sm" onClick={() => onAbrir(r.expediente_id)} title="Abrir el expediente"><Icono nombre="abrir" size={15} /></button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => borrar(r)} title="Borrar fila (se puede deshacer)"><Icono nombre="borrar" size={15} color="var(--red)" /></button>
                </div>
              </td>
            </tr>
          ))}

          {/* Fila vacía permanente: escribir acá agrega, como en Excel */}
          {fechaNueva && (
            <tr style={{ background: '#fbfcfe' }}>
              {mostrarUrgente && <td></td>}
              {mostrarFecha && <td className="mono"><Celda valor={nuevo.fecha ?? fechaNueva} tipo="date" render={fechaCorta} {...cpN('fecha')} /></td>}
              <td className="mono" style={{ minWidth: 60 }}><Celda valor={nuevo.juzgado} {...cpN('juzgado')} /></td>
              <td className="mono" style={{ minWidth: 90 }}><Celda valor={nuevo.numero_expediente} {...cpN('numero_expediente')} /></td>
              <td style={{ minWidth: 260 }}><Celda valor={nuevo.autos} {...cpN('autos')} /></td>
              <td style={{ minWidth: 90 }}><Celda valor={nuevo.asignacion} tipo="select" opciones={nombres} {...cpN('asignacion')} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={nuevo.pase_firma} tipo="date" render={fechaCorta} {...cpN('pase_firma')} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={nuevo.subido_lex} tipo="date" render={fechaCorta} {...cpN('subido_lex')} /></td>
              <td className="muted" style={{ minWidth: 160 }}><Celda valor={nuevo.observaciones} {...cpN('observaciones')} /></td>
              <td><span className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' }}>+ fila nueva</span></td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Aviso de borrado con Deshacer */}
      {borrada && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, background: 'var(--navy)', color: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.25)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13.5 }}>Fila borrada{borrada.numero_expediente ? ` (${borrada.numero_expediente})` : ''}.</span>
          <button onClick={deshacer} style={{ background: '#fff', color: 'var(--navy)', border: 'none', borderRadius: 6, padding: '5px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Deshacer</button>
          <button onClick={() => setBorrada(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 15 }} title="Cerrar">×</button>
        </div>
      )}
    </div>
  )
}
