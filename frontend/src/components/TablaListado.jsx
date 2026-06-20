/**
 * Tabla del listado con edición inline tipo Excel:
 *  - Click (o empezar a escribir) edita la celda; se guarda sola.
 *  - Tab / Shift+Tab: celda siguiente / anterior.
 *  - Enter: baja a la celda de abajo. Escape: cancela.
 * Cambiar "Pase a la firma" o "Subido al Lex" repinta la fila (amarillo / verde).
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../utils/api'
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

export default function TablaListado({ registros, despachantes = [], mostrarFecha = false, mostrarUrgente = false, onCambio, onAbrir }) {
  const nombres = despachantes.map((d) => d.nombre)
  const COLS = useMemo(
    () => [...(mostrarFecha ? ['fecha'] : []), 'juzgado', 'autos', 'asignacion', 'pase_firma', 'subido_lex', 'observaciones'],
    [mostrarFecha],
  )
  const [activa, setActiva] = useState(null)

  const esActiva = (id, campo) => activa && activa.fila === id && activa.campo === campo

  function navegar(id, campo, dir) {
    const ri = registros.findIndex((r) => r.id === id)
    const ci = COLS.indexOf(campo)
    let nri = ri, nci = ci
    if (dir === 'abajo') nri = ri + 1
    else if (dir === 'derecha') { nci = ci + 1; if (nci >= COLS.length) { nci = 0; nri = ri + 1 } }
    else if (dir === 'izquierda') { nci = ci - 1; if (nci < 0) { nci = COLS.length - 1; nri = ri - 1 } }
    if (nri < 0 || nri >= registros.length) { setActiva(null); return }
    setActiva({ fila: registros[nri].id, campo: COLS[nci] })
  }

  async function set(id, campo, valor) {
    try {
      await api(`/api/entrada-salida/${id}`, { method: 'PUT', body: { [campo]: valor } })
      onCambio?.()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
  }

  async function borrar(id) {
    if (!confirm('¿Borrar esta fila del listado?\nQueda guardada en la papelera por las dudas.')) return
    try {
      await api(`/api/entrada-salida/${id}`, { method: 'DELETE' })
      onCambio?.()
    } catch (e) { alert('No se pudo borrar: ' + e.message) }
  }

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
              <td style={{ minWidth: 260 }}><Celda valor={r.autos} {...cp(r, 'autos')} /></td>
              <td style={{ minWidth: 90 }}><Celda valor={r.asignacion} tipo="select" opciones={nombres} {...cp(r, 'asignacion')} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={r.pase_firma} tipo="date" render={fechaCorta} {...cp(r, 'pase_firma')} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={r.subido_lex} tipo="date" render={fechaCorta} {...cp(r, 'subido_lex')} /></td>
              <td className="muted" style={{ minWidth: 160 }}><Celda valor={r.observaciones} {...cp(r, 'observaciones')} /></td>
              <td>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  {r.expediente_id && <button className="btn btn-ghost btn-sm" onClick={() => onAbrir(r.expediente_id)} title="Abrir el expediente"><Icono nombre="abrir" size={15} /></button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => borrar(r.id)} title="Borrar fila"><Icono nombre="borrar" size={15} color="var(--red)" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
