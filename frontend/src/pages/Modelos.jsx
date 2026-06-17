/**
 * Solapa "Modelos": carpetas por tipo de proceso, con sus modelos de documento.
 * Se pueden crear carpetas y agregar modelos (texto y/o archivo) adentro.
 * (Próximo paso: formularios que autocompleten los datos del expediente.)
 */

import { useEffect, useState } from 'react'
import { api, obtenerToken } from '../utils/api'
import Modal from '../components/Modal'
import PreviewArchivo from '../components/PreviewArchivo'
import Icono from '../components/Icono'
import { fechaCorta } from '../utils/format'

export default function Modelos() {
  const [carpetas, setCarpetas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false)
  const [nombreCarpeta, setNombreCarpeta] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      setCarpetas(await api('/api/modelos/carpetas'))
    } catch (e) { console.error(e) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  async function crearCarpeta() {
    if (!nombreCarpeta.trim()) return
    await api('/api/modelos/carpetas', { method: 'POST', body: { nombre: nombreCarpeta.trim() } })
    setNombreCarpeta('')
    setNuevaCarpeta(false)
    cargar()
  }

  async function eliminarCarpeta(id) {
    if (!confirm('¿Eliminar esta carpeta y todos sus modelos?')) return
    await api(`/api/modelos/carpetas/${id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Modelos</div>
          <div className="page-sub">Plantillas de documentos organizadas por tipo de proceso</div>
        </div>
        <button className="btn btn-teal" onClick={() => setNuevaCarpeta(true)}>+ Nueva carpeta</button>
      </div>

      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : carpetas.length === 0 ? (
        <div className="card"><div className="empty">No hay carpetas todavía.<br />Creá una por tipo de proceso (ej. "Sucesiones", "Violencia familiar") y agregá tus modelos.</div></div>
      ) : (
        carpetas.map((c) => <Carpeta key={c.id} carpeta={c} onCambio={cargar} onEliminar={() => eliminarCarpeta(c.id)} />)
      )}

      {nuevaCarpeta && (
        <Modal
          titulo="Nueva carpeta (tipo de proceso)"
          onClose={() => setNuevaCarpeta(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setNuevaCarpeta(false)}>Cancelar</button>
              <button className="btn btn-teal" onClick={crearCarpeta}>Crear</button>
            </>
          }
        >
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Nombre</label>
            <input value={nombreCarpeta} onChange={(e) => setNombreCarpeta(e.target.value)} placeholder="Ej: Sucesiones, Violencia familiar, Alimentos..." autoFocus
              onKeyDown={(e) => e.key === 'Enter' && crearCarpeta()} />
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Carpeta (acordeón) ─────────────────────────────────────────
function Carpeta({ carpeta, onCambio, onEliminar }) {
  const [abierta, setAbierta] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  return (
    <div className="card">
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setAbierta((v) => !v)}>
        <span className="card-title"><Icono nombre="archivo" size={15} color="var(--teal)" /> {carpeta.nombre} <span className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>({carpeta.plantillas.length})</span></span>
        <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAbierta(true); setMostrarForm(true) }}>+ Agregar modelo</button>
          <button className="btn btn-ghost btn-sm" onClick={onEliminar}>✕</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAbierta((v) => !v)}>{abierta ? '▲' : '▼'}</button>
        </div>
      </div>

      {abierta && (
        <div className="card-body">
          {mostrarForm && <FormModelo carpetaId={carpeta.id} onClose={() => setMostrarForm(false)} onGuardado={() => { setMostrarForm(false); onCambio() }} />}

          {carpeta.plantillas.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>Sin modelos en esta carpeta.</div>
          ) : (
            carpeta.plantillas.map((p) => <ModeloItem key={p.id} plantilla={p} onCambio={onCambio} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Item de modelo ─────────────────────────────────────────────
function ModeloItem({ plantilla, onCambio }) {
  const [verContenido, setVerContenido] = useState(false)

  async function eliminar() {
    if (!confirm('¿Eliminar este modelo?')) return
    await api(`/api/modelos/plantillas/${plantilla.id}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}><Icono nombre="doc" size={14} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 5 }} />{plantilla.nombre}</div>
          <div className="tl-meta">Agregado el {fechaCorta(plantilla.fecha_creacion)}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {plantilla.contenido && <button className="btn btn-ghost btn-sm" onClick={() => setVerContenido((v) => !v)}>{verContenido ? 'Ocultar texto' : 'Ver texto'}</button>}
          <button className="btn btn-ghost btn-sm" onClick={eliminar}>✕</button>
        </div>
      </div>
      {verContenido && plantilla.contenido && (
        <div style={{ marginTop: 10, background: '#fafbfc', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>
          {plantilla.contenido}
        </div>
      )}
      {plantilla.archivo_url && (
        <div style={{ marginTop: 10 }}>
          <PreviewArchivo archivo={{ nombre: plantilla.nombre, url: plantilla.archivo_url }} alturaPdf={420} abiertoInicial={false} />
        </div>
      )}
    </div>
  )
}

// ── Form para agregar un modelo ────────────────────────────────
function FormModelo({ carpetaId, onClose, onGuardado }) {
  const [nombre, setNombre] = useState('')
  const [contenido, setContenido] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!nombre.trim()) { setError('Poné un nombre al modelo.'); return }
    if (!contenido.trim() && !archivo) { setError('Agregá el texto del modelo o un archivo.'); return }
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('carpeta_id', carpetaId)
      fd.append('nombre', nombre)
      fd.append('contenido', contenido)
      if (archivo) fd.append('archivo', archivo)
      const resp = await fetch('/api/modelos/plantillas', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}` },
        body: fd,
      })
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || 'Error') }
      onGuardado()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field"><label>Nombre del modelo *</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Dictamen sucesión - vista inicial" /></div>
      <div className="field">
        <label>Texto del modelo</label>
        <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder="Pegá o escribí el modelo. Más adelante vas a poder usar variables como {{numero}}, {{caratula}}, {{juzgado}}..." style={{ minHeight: 140 }} />
      </div>
      <div className="field"><label>O adjuntar un archivo (Word/PDF)</label><input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArchivo(e.target.files[0])} /></div>
      <div className="row">
        <button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar modelo'}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
