/**
 * "Armar escrito" sobre un expediente. Dos modos:
 *  - Modelo de TEXTO (con @): rellena, muestra el texto editable, copiar / Word.
 *  - Modelo con plantilla WORD (.docx): rellena las @ conservando el formato
 *    (membrete, tablas) y descarga el .docx listo.
 * Se usa desde el expediente (con expedienteId) o desde la biblioteca (buscador).
 */
import { useState, useEffect } from 'react'
import { api, API_BASE, obtenerToken } from '../utils/api'
import Modal from './Modal'
import Icono from './Icono'

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export default function ArmarEscrito({ plantilla, expedienteId = null, onClose }) {
  const esDocx = !plantilla.contenido && /\.docx$/i.test(plantilla.archivo_url || '')
  const [expId, setExpId] = useState(expedienteId)
  const [texto, setTexto] = useState('')
  const [faltantes, setFaltantes] = useState([])
  const [listo, setListo] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => { if (expedienteId) elegir(expedienteId) }, [expedienteId])

  async function elegir(id) {
    setExpId(id)
    if (esDocx) { setListo(true); return }
    setCargando(true); setError('')
    try {
      const r = await api(`/api/modelos/plantillas/${plantilla.id}/armar`, { method: 'POST', body: { expediente_id: id } })
      setTexto(r.texto); setFaltantes(r.faltantes || []); setListo(true)
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

  async function descargarWordTexto() {
    setError('')
    try {
      const resp = await fetch(API_BASE + '/api/modelos/exportar-docx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, nombre: plantilla.nombre }),
      })
      if (!resp.ok) throw new Error('No se pudo generar el Word')
      descargarBlob(await resp.blob(), `${plantilla.nombre}.docx`)
    } catch (e) { setError(e.message) }
  }

  async function descargarDocx() {
    setCargando(true); setError('')
    try {
      const resp = await fetch(API_BASE + `/api/modelos/plantillas/${plantilla.id}/armar-docx`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expediente_id: expId }),
      })
      if (!resp.ok) throw new Error('No se pudo armar el Word')
      const falt = resp.headers.get('X-Faltantes') || ''
      setFaltantes(falt ? falt.split(',').map((s) => s.trim()).filter(Boolean) : [])
      descargarBlob(await resp.blob(), `${plantilla.nombre}.docx`)
    } catch (e) { setError(e.message) } finally { setCargando(false) }
  }

  const footer = !listo ? (
    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
  ) : esDocx ? (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-teal" onClick={descargarDocx} disabled={cargando}>
        {cargando ? <span className="spin" /> : <><Icono nombre="exportar" size={14} />Descargar Word rellenado</>}
      </button>
    </>
  ) : (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-ghost" onClick={copiar}><Icono nombre="clip" size={14} />{copiado ? '¡Copiado!' : 'Copiar texto'}</button>
      <button className="btn btn-teal" onClick={descargarWordTexto}><Icono nombre="exportar" size={14} />Descargar Word</button>
    </>
  )

  return (
    <Modal titulo={`Armar escrito · ${plantilla.nombre}`} ancho={780} onClose={onClose} footer={footer}>
      {error && <div className="alert alert-red">{error}</div>}

      {cargando && !listo ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : !listo ? (
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
              <button className="btn btn-teal btn-sm" onClick={() => elegir(e.id)}>Usar este</button>
            </div>
          ))}
          {!resultados.length && busqueda && !buscando && <div className="empty" style={{ padding: 18 }}>Sin resultados. Probá con el número de expediente.</div>}
        </div>
      ) : esDocx ? (
        <div>
          {faltantes.length > 0 && (
            <div className="alert alert-warn">
              Faltan datos en el expediente: <strong>{faltantes.join(', ')}</strong>. En el Word quedan como <code>[completar: ...]</code> para que los completes.
            </div>
          )}
          <div className="empty" style={{ padding: 24 }}>
            <Icono nombre="doc" size={26} color="var(--teal)" /><br />
            Este modelo es un <strong>Word con formato</strong> (membrete y tablas).<br />
            Tocá <strong>"Descargar Word rellenado"</strong>: se completan las @ con los datos del expediente y bajás el .docx listo para revisar y enviar a visar.
          </div>
        </div>
      ) : (
        <div>
          {faltantes.length > 0 && (
            <div className="alert alert-warn">
              Faltan datos en el expediente: <strong>{faltantes.join(', ')}</strong>. Quedaron como <code>[completar: ...]</code> en el texto.
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
