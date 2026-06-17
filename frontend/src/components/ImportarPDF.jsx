/**
 * Importación de expedientes desde PDF.
 * 1) Sube el PDF → el backend lo parsea y devuelve preview con asignación automática.
 * 2) El usuario revisa las alertas y confirma → se crean los expedientes.
 */

import { useState } from 'react'
import { api, obtenerToken, API_BASE } from '../utils/api'
import Modal from './Modal'

export default function ImportarPDF({ onClose, onImportado }) {
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Subir el PDF y obtener preview (sin guardar todavía)
  async function analizar() {
    if (!archivo) return
    setError('')
    setCargando(true)
    setPreview(null)
    setResultado(null)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      // Llamamos directo con fetch para enviar FormData con el token
      const resp = await fetch(API_BASE + '/api/expedientes/parsear-pdf/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}` },
        body: fd,
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d.detail || 'Error al analizar el PDF')
      }
      setPreview(await resp.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  // Confirmar: crear los expedientes en la base
  async function confirmar() {
    if (!archivo) return
    setError('')
    setCargando(true)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      const resp = await fetch(API_BASE + '/api/expedientes/bulk-from-pdf/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}` },
        body: fd,
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d.detail || 'Error al crear los expedientes')
      }
      setResultado(await resp.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const alertasGlobales = preview?.expedientes?.flatMap((e) => e.alertas || []) || []

  return (
    <Modal
      titulo="Importar expedientes desde PDF"
      ancho={760}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {preview && !resultado && (
            <button className="btn btn-teal" onClick={confirmar} disabled={cargando || !preview.expedientes.length}>
              {cargando ? <span className="spin" /> : `Crear ${preview.total} expediente(s)`}
            </button>
          )}
        </>
      }
    >
      {error && <div className="alert alert-red">{error}</div>}

      {!resultado && (
        <>
          <div className="field">
            <label>Archivo PDF del listado de pases</label>
            <input type="file" accept=".pdf" onChange={(e) => { setArchivo(e.target.files[0]); setPreview(null) }} />
          </div>
          <button className="btn btn-navy btn-sm" onClick={analizar} disabled={!archivo || cargando}>
            {cargando && !preview ? <span className="spin" /> : 'Analizar PDF'}
          </button>
          <p className="tl-meta" style={{ marginTop: 8 }}>
            Se aplican automáticamente las reglas de asignación (Art. 42, Violencia Familiar en 3/9/7, etc.).
            Revisá las alertas antes de confirmar.
          </p>
        </>
      )}

      {/* Preview */}
      {preview && !resultado && (
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>{preview.total} expediente(s) detectado(s)</strong>
            {preview.juzgado && <span className="tl-meta">· Juzgado {preview.juzgado}</span>}
          </div>

          {alertasGlobales.map((a, i) => (
            <div key={i} className={`alert ${a.tipo === 'red' ? 'alert-red' : 'alert-warn'}`}>
              {a.msg.split('\n').map((linea, j) => <div key={j}>{linea}</div>)}
            </div>
          ))}

          <div className="table-scroll" style={{ marginTop: 10, maxHeight: 320, overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Expediente</th><th>Carátula</th><th>Asignado a</th></tr>
              </thead>
              <tbody>
                {preview.expedientes.map((e, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td className="mono">{e.numero}</td>
                    <td>{e.caratula || <span className="dash">—</span>}</td>
                    <td>{e.asignacion_final || <span className="dash">sin asignar</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultado de la creación */}
      {resultado && (
        <div>
          <div className="alert alert-ok">
            ✓ Se crearon {resultado.total_creados} expediente(s).
            {resultado.total_errores > 0 && ` ${resultado.total_errores} omitido(s).`}
          </div>
          {resultado.errores?.length > 0 && (
            <div className="table-scroll" style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table className="data">
                <thead><tr><th>Expediente</th><th>Motivo</th></tr></thead>
                <tbody>
                  {resultado.errores.map((er, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td className="mono">{er.numero}</td>
                      <td className="muted">{er.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn btn-teal" style={{ marginTop: 14 }} onClick={onImportado}>
            Listo, ver expedientes
          </button>
        </div>
      )}
    </Modal>
  )
}
