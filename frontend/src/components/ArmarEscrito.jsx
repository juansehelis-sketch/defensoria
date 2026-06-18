/**
 * "Armar escrito": toma un modelo con variables @ y un expediente, rellena las
 * variables con los datos reales y deja editar, copiar y descargar en Word.
 * - Desde un expediente: se le pasa expedienteId y arma directo.
 * - Desde Modelos: muestra un buscador para elegir el expediente.
 */
import { useState, useEffect } from 'react'
import { api, API_BASE, obtenerToken } from '../utils/api'
import Modal from './Modal'
import Icono from './Icono'

export default function ArmarEscrito({ plantilla, expedienteId = null, onClose }) {
  const [texto, setTexto] = useState('')
  const [faltantes, setFaltantes] = useState([])
  const [armado, setArmado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  // Buscador de expediente (cuando no viene dado).
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => { if (expedienteId) armar(expedienteId) }, [expedienteId])

  async function armar(id) {
    setCargando(true); setError('')
    try {
      const r = await api(`/api/modelos/plantillas/${plantilla.id}/armar`, {
        method: 'POST', body: { expediente_id: id },
      })
      setTexto(r.texto); setFaltantes(r.faltantes || []); setArmado(true)
    } catch (e) { setError(e.message) } finally { setCargando(false) }
  }

  async function buscar() {
    if (!busqueda.trim()) return
    setBuscando(true); setError('')
    try {
      setResultados(await api('/api/expedientes/', { params: { busqueda: busqueda.trim(), limit: 10 } }) || [])
    } catch (e) { setError(e.message) } finally { setBuscando(false) }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 1800) } catch {}
  }

  async function descargarWord() {
    setError('')
    try {
      const resp = await fetch(API_BASE + '/api/modelos/exportar-docx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, nombre: plantilla.nombre }),
      })
      if (!resp.ok) throw new Error('No se pudo generar el Word')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${plantilla.nombre}.docx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal
      titulo={`Armar escrito · ${plantilla.nombre}`}
      ancho={780}
      onClose={onClose}
      footer={armado ? (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-ghost" onClick={copiar}><Icono nombre="clip" size={14} />{copiado ? '¡Copiado!' : 'Copiar texto'}</button>
          <button className="btn btn-teal" onClick={descargarWord}><Icono nombre="exportar" size={14} />Descargar Word</button>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      )}
    >
      {error && <div className="alert alert-red">{error}</div>}

      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : !armado ? (
        <div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>¿Para qué expediente?</label>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Número o carátula..." autoFocus
                onKeyDown={(e) => e.key === 'Enter' && buscar()} />
              <button className="btn btn-teal" onClick={buscar} disabled={buscando}>{buscando ? <span className="spin" /> : 'Buscar'}</button>
            </div>
          </div>
          {resultados.map((e) => (
            <div key={e.id} className="row" style={{ justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', marginBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontWeight: 600 }}>{e.numero}</div>
                <div className="tl-meta" style={{ fontSize: 12 }}>{(e.caratula || '').slice(0, 70)}</div>
              </div>
              <button className="btn btn-teal btn-sm" onClick={() => armar(e.id)}>Usar este</button>
            </div>
          ))}
          {!resultados.length && busqueda && !buscando && <div className="empty" style={{ padding: 18 }}>Sin resultados. Probá con el número de expediente.</div>}
        </div>
      ) : (
        <div>
          {faltantes.length > 0 && (
            <div className="alert alert-warn">
              Faltan datos en el expediente: <strong>{faltantes.join(', ')}</strong>. Quedaron como <code>[completar: ...]</code> en el texto. Cargalos en el expediente para que salgan solos la próxima vez.
            </div>
          )}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Escrito (podés editarlo antes de copiar o descargar)</label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
              style={{ minHeight: 380, fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.6 }} />
          </div>
        </div>
      )}
    </Modal>
  )
}
