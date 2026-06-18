/**
 * Biblioteca de la Defensoría, compartida por todos y guardada en la base:
 *  - Modelos        → escritos con variables @ (por tipo de proceso). Se "arman"
 *                     sobre un expediente y las @ se rellenan solas.
 *  - Jurisprudencia → fallos por temática.
 *  - Doctrina       → doctrina por temática.
 *  - Dictámenes     → dictámenes viejos de ejemplo, por tipo de proceso.
 */

import { useEffect, useState, useRef } from 'react'
import { api, obtenerToken, API_BASE } from '../utils/api'
import Modal from '../components/Modal'
import PreviewArchivo from '../components/PreviewArchivo'
import ArmarEscrito from '../components/ArmarEscrito'
import Icono from '../components/Icono'
import { fechaCorta } from '../utils/format'

const CATEGORIAS = [
  { id: 'modelos', label: 'Formularios de intervenciones', sub: 'Formularios con variables @, por tipo de proceso', divide: 'tipo de proceso', item: 'formulario', arroba: true },
  { id: 'dictamenes', label: 'Dictámenes', sub: 'Dictámenes de ejemplo (con variables @), por tipo de proceso', divide: 'tipo de proceso', item: 'dictamen', arroba: true },
  { id: 'jurisprudencia', label: 'Jurisprudencia', sub: 'Fallos ordenados por temática', divide: 'temática', item: 'fallo', arroba: false },
  { id: 'doctrina', label: 'Doctrina', sub: 'Doctrina ordenada por temática', divide: 'temática', item: 'texto', arroba: false },
]

export default function Modelos() {
  const [cat, setCat] = useState('modelos')
  const [carpetas, setCarpetas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false)
  const [nombreCarpeta, setNombreCarpeta] = useState('')
  const [variables, setVariables] = useState([])

  const conf = CATEGORIAS.find((c) => c.id === cat)

  async function cargar() {
    setCargando(true)
    try { setCarpetas(await api('/api/modelos/carpetas', { params: { categoria: cat } })) }
    catch (e) { console.error(e) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [cat])
  useEffect(() => { api('/api/modelos/variables').then(setVariables).catch(() => {}) }, [])

  async function crearCarpeta() {
    if (!nombreCarpeta.trim()) return
    await api('/api/modelos/carpetas', { method: 'POST', body: { nombre: nombreCarpeta.trim(), categoria: cat } })
    setNombreCarpeta(''); setNuevaCarpeta(false); cargar()
  }
  async function eliminarCarpeta(id) {
    if (!confirm('¿Eliminar esta carpeta y todo su contenido?')) return
    await api(`/api/modelos/carpetas/${id}`, { method: 'DELETE' }); cargar()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Biblioteca</div>
          <div className="page-sub">{conf.sub}</div>
        </div>
        <button className="btn btn-teal" onClick={() => setNuevaCarpeta(true)}><Icono nombre="agregar" size={15} />Nueva carpeta</button>
      </div>

      <div className="row" style={{ gap: 7, marginBottom: 16 }}>
        {CATEGORIAS.map((c) => (
          <button key={c.id} className={'btn btn-sm ' + (c.id === cat ? 'btn-navy' : 'btn-ghost')} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>

      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : carpetas.length === 0 ? (
        <div className="card"><div className="empty">No hay carpetas en {conf.label} todavía.<br />Creá una por {conf.divide} y agregá su contenido.</div></div>
      ) : (
        carpetas.map((c) => <Carpeta key={c.id} carpeta={c} conf={conf} variables={variables} onCambio={cargar} onEliminar={() => eliminarCarpeta(c.id)} />)
      )}

      {nuevaCarpeta && (
        <Modal titulo={`Nueva carpeta · ${conf.label}`} onClose={() => setNuevaCarpeta(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setNuevaCarpeta(false)}>Cancelar</button><button className="btn btn-teal" onClick={crearCarpeta}>Crear</button></>}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Nombre ({conf.divide})</label>
            <input value={nombreCarpeta} onChange={(e) => setNombreCarpeta(e.target.value)} autoFocus
              placeholder={conf.divide === 'temática' ? 'Ej: Capacidad, Restitución, Alimentos...' : 'Ej: Sucesiones, Alimentos, Violencia familiar...'}
              onKeyDown={(e) => e.key === 'Enter' && crearCarpeta()} />
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Hook: insertar un token @ en el cursor del textarea ────────
function useInsertar(contenido, setContenido) {
  const ref = useRef(null)
  function insertar(token) {
    const ins = '@' + token
    const ta = ref.current
    if (!ta) { setContenido(contenido + ins); return }
    const s = ta.selectionStart ?? contenido.length
    const e = ta.selectionEnd ?? contenido.length
    setContenido(contenido.slice(0, s) + ins + contenido.slice(e))
    requestAnimationFrame(() => { ta.focus(); const pos = s + ins.length; ta.setSelectionRange(pos, pos) })
  }
  return [ref, insertar]
}

// ── Panel de ayuda de variables @ ─────────────────────────────
function VariablesAyuda({ variables, onInsertar }) {
  if (!variables?.length) return null
  const grupos = [...new Set(variables.map((v) => v.grupo))]
  return (
    <div style={{ background: 'var(--teal-lt)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 7 }}>Tocá una variable para insertarla; se rellena sola con los datos del expediente:</div>
      {grupos.map((g) => (
        <div key={g} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>{g}</div>
          <div className="row" style={{ gap: 5 }}>
            {variables.filter((v) => v.grupo === g).map((v) => (
              <button key={v.token} type="button" className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11.5 }} title={v.etiqueta} onClick={() => onInsertar(v.token)}>@{v.token}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Carpeta (acordeón) ─────────────────────────────────────────
function Carpeta({ carpeta, conf, variables, onCambio, onEliminar }) {
  const [abierta, setAbierta] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  return (
    <div className="card">
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setAbierta((v) => !v)}>
        <span className="card-title"><Icono nombre="archivo" size={15} color="var(--teal)" /> {carpeta.nombre} <span className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>({carpeta.plantillas.length})</span></span>
        <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAbierta(true); setMostrarForm(true) }}><Icono nombre="agregar" size={14} />Agregar {conf.item}</button>
          <button className="btn btn-ghost btn-sm" onClick={onEliminar} title="Eliminar carpeta"><Icono nombre="borrar" size={14} color="var(--red)" /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAbierta((v) => !v)}>{abierta ? '▲' : '▼'}</button>
        </div>
      </div>

      {abierta && (
        <div className="card-body">
          {mostrarForm && <FormModelo carpetaId={carpeta.id} conf={conf} variables={variables} onClose={() => setMostrarForm(false)} onGuardado={() => { setMostrarForm(false); onCambio() }} />}
          {carpeta.plantillas.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>Sin {conf.item}s en esta carpeta.</div>
          ) : (
            carpeta.plantillas.map((p) => <ModeloItem key={p.id} plantilla={p} conf={conf} variables={variables} onCambio={onCambio} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Item ───────────────────────────────────────────────────────
function ModeloItem({ plantilla, conf, variables, onCambio }) {
  const [verContenido, setVerContenido] = useState(false)
  const [editar, setEditar] = useState(false)
  const [armar, setArmar] = useState(false)

  async function eliminar() {
    if (!confirm(`¿Eliminar este ${conf.item}?`)) return
    await api(`/api/modelos/plantillas/${plantilla.id}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}><Icono nombre="doc" size={14} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 5 }} />{plantilla.nombre}</div>
          <div className="tl-meta">Agregado el {fechaCorta(plantilla.fecha_creacion)}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {conf.arroba && plantilla.contenido && <button className="btn btn-teal btn-sm" onClick={() => setArmar(true)}><Icono nombre="firma" size={14} />Armar escrito</button>}
          {plantilla.contenido && <button className="btn btn-ghost btn-sm" onClick={() => { setVerContenido((v) => !v); setEditar(false) }}>{verContenido ? 'Ocultar' : 'Ver texto'}</button>}
          {plantilla.contenido && <button className="btn btn-ghost btn-sm" onClick={() => { setEditar((v) => !v); setVerContenido(false) }}>Editar</button>}
          <button className="btn btn-ghost btn-sm" onClick={eliminar} title="Eliminar"><Icono nombre="borrar" size={14} color="var(--red)" /></button>
        </div>
      </div>

      {editar && plantilla.contenido && (
        <EditarTexto plantilla={plantilla} variables={conf.arroba ? variables : []} onClose={() => setEditar(false)} onGuardado={() => { setEditar(false); onCambio() }} />
      )}

      {verContenido && plantilla.contenido && !editar && (
        <div style={{ marginTop: 10, background: '#fafbfc', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{plantilla.contenido}</div>
      )}

      {plantilla.archivo_url && (
        <div style={{ marginTop: 10 }}>
          <PreviewArchivo archivo={{ nombre: plantilla.nombre, url: plantilla.archivo_url }} alturaPdf={420} abiertoInicial={false} />
        </div>
      )}

      {armar && <ArmarEscrito plantilla={plantilla} onClose={() => setArmar(false)} />}
    </div>
  )
}

// ── Form para agregar ──────────────────────────────────────────
function FormModelo({ carpetaId, conf, variables, onClose, onGuardado }) {
  const [nombre, setNombre] = useState('')
  const [contenido, setContenido] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [taRef, insertar] = useInsertar(contenido, setContenido)

  async function guardar() {
    setError('')
    if (!nombre.trim()) { setError('Poné un nombre.'); return }
    if (!contenido.trim() && !archivo) { setError('Agregá el texto o un archivo.'); return }
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('carpeta_id', carpetaId)
      fd.append('nombre', nombre)
      fd.append('contenido', contenido)
      if (archivo) fd.append('archivo', archivo)
      const resp = await fetch(API_BASE + '/api/modelos/plantillas', {
        method: 'POST', headers: { Authorization: `Bearer ${obtenerToken()}` }, body: fd,
      })
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || 'Error') }
      onGuardado()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field"><label>Nombre del {conf.item} *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={conf.arroba ? 'Ej: Dictamen sucesión - vista inicial' : 'Ej: CSJN "García" 2021'} />
      </div>
      {conf.arroba && <VariablesAyuda variables={variables} onInsertar={insertar} />}
      <div className="field">
        <label>Texto {conf.arroba ? '(poné @ donde quieras un dato del expediente)' : '(opcional si subís un archivo)'}</label>
        <textarea ref={taRef} value={contenido} onChange={(e) => setContenido(e.target.value)} style={{ minHeight: 150 }}
          placeholder={conf.arroba ? 'Ej: En @ciudad, @fecha. Autos: "@caratula" (Expte. @numero)...' : 'Pegá o escribí el contenido.'} />
      </div>
      <div className="field"><label>O adjuntar un archivo (Word/PDF)</label>
        <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArchivo(e.target.files[0])} />
      </div>
      <div className="row">
        <button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar'}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Editar texto de un modelo existente ────────────────────────
function EditarTexto({ plantilla, variables, onClose, onGuardado }) {
  const [nombre, setNombre] = useState(plantilla.nombre)
  const [contenido, setContenido] = useState(plantilla.contenido || '')
  const [guardando, setGuardando] = useState(false)
  const [taRef, insertar] = useInsertar(contenido, setContenido)

  async function guardar() {
    setGuardando(true)
    try {
      await api(`/api/modelos/plantillas/${plantilla.id}`, { method: 'PUT', body: { nombre, contenido } })
      onGuardado()
    } catch (e) { alert(e.message) } finally { setGuardando(false) }
  }

  return (
    <div style={{ marginTop: 10, background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div className="field"><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
      {variables.length > 0 && <VariablesAyuda variables={variables} onInsertar={insertar} />}
      <div className="field" style={{ marginBottom: 8 }}><label>Texto</label>
        <textarea ref={taRef} value={contenido} onChange={(e) => setContenido(e.target.value)} style={{ minHeight: 170 }} />
      </div>
      <div className="row">
        <button className="btn btn-teal btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar cambios'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
