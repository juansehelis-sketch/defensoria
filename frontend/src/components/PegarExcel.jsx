/**
 * Pegar filas desde Excel/Sheets: el usuario copia filas (Ctrl+C) y las pega
 * acá; se parsea (tabulado), se mapean las columnas y se cargan al listado de
 * una vez. Mantiene todas las automatizaciones (crea expediente, asignación, etc.).
 */
import { useState, useMemo } from 'react'
import { api } from '../utils/api'
import Modal from './Modal'

const CAMPOS = [
  { v: '', t: '— Ignorar —' },
  { v: 'fecha', t: 'Fecha' },
  { v: 'juzgado', t: 'Juzgado' },
  { v: 'numero_expediente', t: 'N° Expediente' },
  { v: 'autos', t: 'Autos / Carátula' },
  { v: 'asignacion', t: 'Asignación' },
  { v: 'pase_firma', t: 'Pase a la firma' },
  { v: 'subido_lex', t: 'Subido al Lex' },
  { v: 'observaciones', t: 'Observaciones' },
]
const DEFAULT_MAP = ['juzgado', 'numero_expediente', 'autos', 'asignacion', 'pase_firma', 'subido_lex', 'observaciones']

function adivinar(headers) {
  const n = (s) => (s || '').toLowerCase()
  return headers.map((h) => {
    const x = n(h)
    if (x.includes('juzg')) return 'juzgado'
    if (x.includes('exped') || x.includes('nro') || x.includes('n°') || x.includes('autos n')) return 'numero_expediente'
    if (x.includes('auto') || x.includes('carat') || x.includes('carát')) return 'autos'
    if (x.includes('asign') || x.includes('despach')) return 'asignacion'
    if (x.includes('firma') || x.includes('pase')) return 'pase_firma'
    if (x.includes('lex') || x.includes('subido')) return 'subido_lex'
    if (x.includes('observ')) return 'observaciones'
    if (x.includes('fecha')) return 'fecha'
    return ''
  })
}

export default function PegarExcel({ fechaDefault, onClose, onListo }) {
  const [texto, setTexto] = useState('')
  const [conEncabezado, setConEncabezado] = useState(true)
  const [mapa, setMapa] = useState(DEFAULT_MAP)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const filas = useMemo(
    () => texto.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => l.split('\t')),
    [texto],
  )

  function onPaste(t) {
    setTexto(t)
    const f = t.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => l.split('\t'))
    if (f.length) {
      const cols = Math.max(...f.map((r) => r.length))
      const guess = adivinar(f[0])
      setConEncabezado(guess.some(Boolean))
      setMapa(Array.from({ length: cols }, (_, i) => guess[i] || DEFAULT_MAP[i] || ''))
    }
  }

  const datos = filas.slice(conEncabezado ? 1 : 0)

  async function confirmar() {
    setError('')
    const rows = datos.map((celdas) => {
      const obj = {}
      mapa.forEach((campo, i) => { if (campo) obj[campo] = (celdas[i] || '').trim() })
      if (!obj.fecha) obj.fecha = fechaDefault
      return obj
    }).filter((o) => o.autos || o.numero_expediente)
    if (rows.length === 0) { setError('No hay filas para cargar.'); return }
    setGuardando(true)
    try {
      const r = await api('/api/entrada-salida/bulk', { method: 'POST', body: rows })
      onListo(r.creados)
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo="Pegar desde Excel" ancho={920} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-teal" onClick={confirmar} disabled={guardando || datos.length === 0}>
          {guardando ? <span className="spin" /> : `Cargar ${datos.length} fila(s)`}
        </button>
      </>}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="tl-meta" style={{ marginBottom: 8 }}>
        Copiá las filas en tu Excel/Sheet (Ctrl+C) y pegalas acá (Ctrl+V). Después revisá que cada columna esté bien asignada en los desplegables.
      </div>
      <textarea value={texto} onChange={(e) => onPaste(e.target.value)} placeholder="Pegá acá las filas copiadas de Excel..."
        style={{ width: '100%', minHeight: 110, fontFamily: 'monospace', fontSize: 12 }} autoFocus />
      <label className="row" style={{ gap: 8, margin: '8px 0', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={conEncabezado} onChange={(e) => setConEncabezado(e.target.checked)} style={{ width: 'auto' }} />
        La primera fila es el encabezado (no cargarla)
      </label>
      {filas.length > 0 && (
        <div className="table-scroll" style={{ maxHeight: 300, marginTop: 4 }}>
          <table className="data">
            <thead>
              <tr>{mapa.map((campo, i) => (
                <th key={i}>
                  <select value={campo} onChange={(e) => { const m = [...mapa]; m[i] = e.target.value; setMapa(m) }}
                    style={{ fontFamily: 'inherit', fontSize: 11, padding: '2px 4px', maxWidth: 130 }}>
                    {CAMPOS.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
                  </select>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {datos.slice(0, 8).map((celdas, ri) => (
                <tr key={ri}>{mapa.map((_, ci) => (
                  <td key={ci} style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{celdas[ci] || ''}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
          {datos.length > 8 && <div className="tl-meta" style={{ padding: '6px 2px' }}>… y {datos.length - 8} fila(s) más.</div>}
        </div>
      )}
    </Modal>
  )
}
