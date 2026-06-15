/**
 * Tabla del listado con edición inline (tipo Excel): hacés click en una celda,
 * la editás y se guarda sola. Cambiar "Pase a la firma" o "Subido al Lex" repinta
 * la fila (amarillo / verde). Un botón por fila abre el "mundo del expediente".
 *
 * Se usa en la solapa Expedientes y en Inicio.
 */

import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { fechaCorta, colorFila } from '../utils/format'

const inputStyle = {
  width: '100%', padding: '4px 6px', border: '1.5px solid var(--teal)',
  borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff',
}

function Celda({ valor, tipo = 'text', opciones, onGuardar, render }) {
  const [edit, setEdit] = useState(false)
  const [val, setVal] = useState(valor ?? '')
  useEffect(() => { setVal(valor ?? '') }, [valor])

  function commit() {
    setEdit(false)
    const limpio = val === '' ? null : val
    if ((limpio ?? '') !== (valor ?? '')) onGuardar(limpio)
  }

  if (!edit) {
    return (
      <div onClick={(e) => { e.stopPropagation(); setEdit(true) }} title="Click para editar"
        style={{ cursor: 'text', minHeight: 18, minWidth: 28 }}>
        {valor ? (render ? render(valor) : valor) : <span className="dash">—</span>}
      </div>
    )
  }
  if (tipo === 'select') {
    return (
      <select autoFocus value={val} onClick={(e) => e.stopPropagation()}
        onChange={(e) => setVal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()} style={inputStyle}>
        <option value="">— sin asignar —</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  return (
    <input autoFocus type={tipo} value={val} onClick={(e) => e.stopPropagation()}
      onChange={(e) => setVal(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(valor ?? ''); setEdit(false) } }}
      style={inputStyle} />
  )
}

export default function TablaListado({ registros, despachantes = [], mostrarFecha = false, mostrarUrgente = false, onCambio, onAbrir }) {
  const nombres = despachantes.map((d) => d.nombre)

  async function set(id, campo, valor) {
    try {
      await api(`/api/entrada-salida/${id}`, { method: 'PUT', body: { [campo]: valor } })
      onCambio?.()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
  }

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
              {mostrarFecha && <td className="mono"><Celda valor={r.fecha} tipo="date" render={fechaCorta} onGuardar={(v) => set(r.id, 'fecha', v)} /></td>}
              <td className="mono" style={{ minWidth: 60 }}><Celda valor={r.juzgado} onGuardar={(v) => set(r.id, 'juzgado', v)} /></td>
              <td className="mono">{r.numero_expediente || '—'}</td>
              <td style={{ minWidth: 260 }}><Celda valor={r.autos} onGuardar={(v) => set(r.id, 'autos', v)} /></td>
              <td style={{ minWidth: 90 }}><Celda valor={r.asignacion} tipo="select" opciones={nombres} onGuardar={(v) => set(r.id, 'asignacion', v)} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={r.pase_firma} tipo="date" render={fechaCorta} onGuardar={(v) => set(r.id, 'pase_firma', v)} /></td>
              <td className="mono" style={{ minWidth: 110 }}><Celda valor={r.subido_lex} tipo="date" render={fechaCorta} onGuardar={(v) => set(r.id, 'subido_lex', v)} /></td>
              <td className="muted" style={{ minWidth: 160 }}><Celda valor={r.observaciones} onGuardar={(v) => set(r.id, 'observaciones', v)} /></td>
              <td>{r.expediente_id && <button className="btn btn-ghost btn-sm" onClick={() => onAbrir(r.expediente_id)} title="Abrir el expediente">↗</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
