/**
 * Etiquetas libres de los expedientes ("esperando informe", "internación"...).
 * - <ChipEtiqueta texto /> : la marquita de color (el color sale del texto, así
 *   una misma etiqueta siempre tiene el mismo color).
 * - <EditorEtiquetas expediente onCambio /> : agregar y quitar etiquetas.
 */

import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import { avisar } from '../ui'

const COLORES = [
  ['#f6e3ea', '#8a2a4c'], ['#e3ecf8', '#1f4e8c'], ['#e2f3e8', '#1d6b3c'], ['#efe6f7', '#5b3a8c'],
  ['#fcecdc', '#9a4d0c'], ['#e4f4f4', '#1d6d6d'], ['#f9f1d6', '#7a5d00'], ['#ececf1', '#474b5c'],
]

export function colorEtiqueta(texto) {
  let h = 0
  for (const c of (texto || '').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORES[h % COLORES.length]
}

export function ChipEtiqueta({ texto, onQuitar, onClick, activa }) {
  const [fondo, color] = colorEtiqueta(texto)
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, background: fondo, color,
        border: `1px solid ${activa ? color : 'transparent'}`, borderRadius: 999, padding: '1px 9px',
        fontSize: 11.5, fontWeight: 600, lineHeight: 1.6, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {texto}
      {onQuitar && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onQuitar() }} aria-label={`Quitar ${texto}`}
          style={{ border: 'none', background: 'none', color, cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
      )}
    </span>
  )
}

export function EditorEtiquetas({ expediente, onCambio, claro = false }) {
  const [lista, setLista] = useState(expediente.etiquetas || [])
  const [nueva, setNueva] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [existentes, setExistentes] = useState([])

  useEffect(() => { setLista(expediente.etiquetas || []) }, [expediente.id, expediente.etiquetas])
  useEffect(() => {
    if (agregando) api('/api/expedientes/etiquetas').then((l) => setExistentes(l.map((x) => x.etiqueta))).catch(() => {})
  }, [agregando])

  async function guardar(nuevas) {
    try {
      const e = await api(`/api/expedientes/${expediente.id}/etiquetas`, { method: 'PUT', body: { etiquetas: nuevas } })
      setLista(e.etiquetas || [])
      onCambio && onCambio(e.etiquetas || [])
    } catch (err) { avisar(err.message, 'error') }
  }

  function agregar() {
    const t = nueva.trim()
    if (!t) { setAgregando(false); return }
    setNueva('')
    setAgregando(false)
    if (!lista.some((x) => x.toLowerCase() === t.toLowerCase())) guardar([...lista, t])
  }

  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {lista.map((t) => <ChipEtiqueta key={t} texto={t} onQuitar={() => guardar(lista.filter((x) => x !== t))} />)}
      {agregando ? (
        <>
          <input autoFocus list="etiquetas-existentes" value={nueva} onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') agregar(); if (e.key === 'Escape') { setNueva(''); setAgregando(false) } }}
            onBlur={agregar} placeholder="Ej: esperando informe" maxLength={30}
            style={{ width: 180, padding: '3px 8px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', color: '#222' }} />
          <datalist id="etiquetas-existentes">{existentes.filter((x) => !lista.includes(x)).map((x) => <option key={x} value={x} />)}</datalist>
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAgregando(true)}
          style={claro ? { color: '#fff', borderColor: 'rgba(255,255,255,.35)', padding: '2px 10px' } : { padding: '2px 10px' }}>
          + Etiqueta
        </button>
      )}
    </div>
  )
}
