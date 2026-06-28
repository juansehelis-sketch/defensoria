/**
 * Biblioteca de la Defensoría, compartida por todos y guardada en la base.
 * Tres bibliotecas, cada una con carpetas y, dentro, archivos con su información:
 *  - Modelos        → escritos con variables @ (por tipo de proceso). Se "arman"
 *                     sobre un expediente y las @ se rellenan solas.
 *  - Jurisprudencia → fallos por temática.
 *  - Doctrina       → doctrina por temática.
 *
 * Cada archivo guarda nombre, descripción y etiquetas, y el buscador encuentra
 * por cualquiera de esos datos (o por el nombre de la carpeta o el texto).
 */

import { useEffect, useState, useRef } from 'react'
import { api, obtenerToken, API_BASE } from '../utils/api'
import Modal from '../components/Modal'
import PreviewArchivo from '../components/PreviewArchivo'
import ArmarEscrito from '../components/ArmarEscrito'
import Icono from '../components/Icono'
import { fechaCorta } from '../utils/format'

const CATEGORIAS = [
  {
    id: 'modelos', label: 'Modelos', icono: 'modelos',
    sub: 'Escritos con variables @ que se rellenan solas, por tipo de proceso',
    ayuda: 'Plantillas de escritos. Poné @ donde quieras un dato del expediente y el botón "Armar escrito" lo completa solo.',
    divide: 'tipo de proceso', item: 'modelo', arroba: true,
  },
  {
    id: 'jurisprudencia', label: 'Jurisprudencia', icono: 'balanza',
    sub: 'Fallos ordenados por temática',
    ayuda: 'Fallos guardados por tema. Subí el archivo y agregale una descripción y etiquetas para encontrarlo después.',
    divide: 'temática', item: 'fallo', arroba: false,
  },
  {
    id: 'doctrina', label: 'Doctrina', icono: 'libro',
    sub: 'Doctrina ordenada por temática',
    ayuda: 'Artículos y doctrina por tema. Subí el archivo y agregale una descripción y etiquetas para buscarlo.',
    divide: 'temática', item: 'texto', arroba: false,
  },
]

export default function Modelos() {
  const [cat, setCat] = useState(null) // null = pantalla de inicio con las 3 opciones
  const conf = CATEGORIAS.find((c) => c.id === cat)
  if (!conf) return <Inicio onElegir={setCat} />
  return <Biblioteca conf={conf} onVolver={() => setCat(null)} />
}

// ── Pantalla de inicio: las 3 bibliotecas ──────────────────────
function Inicio({ onElegir }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Biblioteca</div>
          <div className="page-sub">Elegí dónde querés entrar</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
        {CATEGORIAS.map((c) => (
          <button key={c.id} onClick={() => onElegir(c.id)}
            className="card"
            style={{
              cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)',
              padding: 24, display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow .15s, transform .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(138,42,76,.13)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}>
            <span style={{
              width: 56, height: 56, borderRadius: 14, background: 'var(--teal-lt)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icono nombre={c.icono} size={30} color="var(--teal)" />
            </span>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>{c.label}</span>
            <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{c.sub}</span>
            <span className="row" style={{ gap: 5, color: 'var(--teal)', fontSize: 14, fontWeight: 600, marginTop: 'auto' }}>
              Entrar <Icono nombre="abrir" size={15} color="var(--teal)" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Una biblioteca: buscador + carpetas ────────────────────────
function Biblioteca({ conf, onVolver }) {
  const [carpetas, setCarpetas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false)
  const [nombreCarpeta, setNombreCarpeta] = useState('')
  const [variables, setVariables] = useState([])
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState(null) // null = sin búsqueda activa
  const [buscando, setBuscando] = useState(false)

  async function cargar() {
    setCargando(true)
    try { setCarpetas(await api('/api/modelos/carpetas', { params: { categoria: conf.id } })) }
    catch (e) { console.error(e) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [conf.id])
  useEffect(() => { if (conf.arroba) api('/api/modelos/variables').then(setVariables).catch(() => {}) }, [conf.arroba])

  async function ejecutarBusqueda() {
    const termino = q.trim()
    if (!termino) { setResultados(null); setBuscando(false); return }
    setBuscando(true)
    try { setResultados(await api('/api/modelos/buscar', { params: { categoria: conf.id, q: termino } })) }
    catch (e) { console.error(e); setResultados([]) } finally { setBuscando(false) }
  }

  // Buscador con pequeño retardo (debounce)
  useEffect(() => {
    const termino = q.trim()
    if (!termino) { setResultados(null); setBuscando(false); return }
    const t = setTimeout(ejecutarBusqueda, 300)
    return () => clearTimeout(t)
  }, [q, conf.id])

  async function crearCarpeta() {
    if (!nombreCarpeta.trim()) return
    await api('/api/modelos/carpetas', { method: 'POST', body: { nombre: nombreCarpeta.trim(), categoria: conf.id } })
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
          <button className="btn btn-ghost btn-sm" onClick={onVolver} style={{ marginBottom: 8 }}>
            <Icono nombre="volver" size={15} />Bibliotecas
          </button>
          <div className="page-title row" style={{ gap: 9, alignItems: 'center' }}>
            <Icono nombre={conf.icono} size={24} color="var(--teal)" />{conf.label}
          </div>
          <div className="page-sub">{conf.sub}</div>
        </div>
        <button className="btn btn-teal" onClick={() => setNuevaCarpeta(true)}><Icono nombre="agregar" size={15} />Nueva carpeta</button>
      </div>

      <div style={{ background: 'var(--teal-lt)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13.5, color: 'var(--navy)' }}>
        {conf.ayuda}
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <Icono nombre="buscar" size={18} color="var(--muted)" />
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar en ${conf.label} por nombre, descripción, etiquetas...`}
          style={{ width: '100%', padding: '13px 40px 13px 44px', fontSize: 15, borderRadius: 10, border: '1px solid var(--border)' }} />
        {q && (
          <button onClick={() => setQ('')} title="Limpiar"
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icono nombre="cerrar" size={16} color="var(--muted)" />
          </button>
        )}
      </div>

      {/* Resultados de búsqueda */}
      {resultados !== null ? (
        buscando ? (
          <div className="loading-center"><span className="spin" /></div>
        ) : resultados.length === 0 ? (
          <div className="card"><div className="empty">No se encontró nada para “{q.trim()}”.</div></div>
        ) : (
          <>
            <div className="tl-meta" style={{ marginBottom: 10 }}>{resultados.length} resultado{resultados.length !== 1 ? 's' : ''} para “{q.trim()}”</div>
            {resultados.map((p) => (
              <ModeloItem key={p.id} plantilla={p} conf={conf} variables={variables} carpetaNombre={p.carpeta_nombre} onCambio={() => { cargar(); ejecutarBusqueda() }} />
            ))}
          </>
        )
      ) : cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : carpetas.length === 0 ? (
        <div className="card"><div className="empty">No hay carpetas en {conf.label} todavía.<br />Creá una por {conf.divide} con el botón “Nueva carpeta” y agregale archivos.</div></div>
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

// ── Chips de etiquetas ─────────────────────────────────────────
function Etiquetas({ texto }) {
  const tags = (texto || '').split(',').map((t) => t.trim()).filter(Boolean)
  if (!tags.length) return null
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {tags.map((t, i) => (
        <span key={i} className="row" style={{ gap: 4, background: 'var(--teal-lt)', color: 'var(--teal)', fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 99 }}>
          <Icono nombre="etiqueta" size={11} color="var(--teal)" />{t}
        </span>
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
        <span className="card-title"><Icono nombre="modelos" size={16} color="var(--teal)" /> {carpeta.nombre} <span className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>({carpeta.plantillas.length})</span></span>
        <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAbierta(true); setMostrarForm(true) }}><Icono nombre="agregar" size={14} />Agregar archivo</button>
          <button className="btn btn-ghost btn-sm" onClick={onEliminar} title="Eliminar carpeta"><Icono nombre="borrar" size={14} color="var(--red)" /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAbierta((v) => !v)}>{abierta ? '▲' : '▼'}</button>
        </div>
      </div>

      {abierta && (
        <div className="card-body">
          {mostrarForm && <FormModelo carpetaId={carpeta.id} conf={conf} variables={variables} onClose={() => setMostrarForm(false)} onGuardado={() => { setMostrarForm(false); onCambio() }} />}
          {carpeta.plantillas.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>Esta carpeta está vacía. Usá “Agregar archivo”.</div>
          ) : (
            carpeta.plantillas.map((p) => <ModeloItem key={p.id} plantilla={p} conf={conf} variables={variables} onCambio={onCambio} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Item ───────────────────────────────────────────────────────
function ModeloItem({ plantilla, conf, variables, onCambio, carpetaNombre }) {
  const [verContenido, setVerContenido] = useState(false)
  const [editar, setEditar] = useState(false)
  const [armar, setArmar] = useState(false)

  async function eliminar() {
    if (!confirm(`¿Eliminar “${plantilla.nombre}”?`)) return
    await api(`/api/modelos/plantillas/${plantilla.id}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          {carpetaNombre && (
            <div className="row" style={{ gap: 4, color: 'var(--muted)', fontSize: 11.5, marginBottom: 3 }}>
              <Icono nombre="modelos" size={12} color="var(--muted)" />{carpetaNombre}
            </div>
          )}
          <div style={{ fontSize: 14, fontWeight: 600 }}><Icono nombre="doc" size={14} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 5 }} />{plantilla.nombre}</div>
          {plantilla.descripcion && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{plantilla.descripcion}</div>}
          <Etiquetas texto={plantilla.etiquetas} />
          <div className="tl-meta" style={{ marginTop: 6 }}>Agregado el {fechaCorta(plantilla.fecha_creacion)}</div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {conf.arroba && (plantilla.contenido || /\.docx$/i.test(plantilla.archivo_url || '')) && <button className="btn btn-teal btn-sm" onClick={() => setArmar(true)}><Icono nombre="firma" size={14} />Armar escrito</button>}
          {plantilla.contenido && <button className="btn btn-ghost btn-sm" onClick={() => { setVerContenido((v) => !v); setEditar(false) }}>{verContenido ? 'Ocultar' : 'Ver texto'}</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditar((v) => !v); setVerContenido(false) }}>Editar</button>
          <button className="btn btn-ghost btn-sm" onClick={eliminar} title="Eliminar"><Icono nombre="borrar" size={14} color="var(--red)" /></button>
        </div>
      </div>

      {editar && (
        <EditarModelo plantilla={plantilla} conf={conf} variables={conf.arroba ? variables : []} onClose={() => setEditar(false)} onGuardado={() => { setEditar(false); onCambio() }} />
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
  const [descripcion, setDescripcion] = useState('')
  const [etiquetas, setEtiquetas] = useState('')
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
      fd.append('descripcion', descripcion)
      fd.append('etiquetas', etiquetas)
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
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={conf.arroba ? 'Ej: Demanda de alimentos - vista inicial' : 'Ej: CSJN "García" 2021'} />
      </div>
      <div className="field"><label>Descripción (para encontrarlo después)</label>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ minHeight: 60 }}
          placeholder="Ej: de qué trata, tribunal, fecha, partes, para qué sirve..." />
      </div>
      <div className="field"><label>Etiquetas (separadas por coma)</label>
        <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="Ej: alimentos, cuota, urgente" />
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

// ── Editar un archivo existente (nombre, descripción, etiquetas, texto) ──
function EditarModelo({ plantilla, conf, variables, onClose, onGuardado }) {
  const [nombre, setNombre] = useState(plantilla.nombre)
  const [descripcion, setDescripcion] = useState(plantilla.descripcion || '')
  const [etiquetas, setEtiquetas] = useState(plantilla.etiquetas || '')
  const [contenido, setContenido] = useState(plantilla.contenido || '')
  const [guardando, setGuardando] = useState(false)
  const [taRef, insertar] = useInsertar(contenido, setContenido)
  const tieneTexto = plantilla.contenido != null

  async function guardar() {
    setGuardando(true)
    try {
      const body = { nombre, descripcion, etiquetas }
      if (tieneTexto) body.contenido = contenido
      await api(`/api/modelos/plantillas/${plantilla.id}`, { method: 'PUT', body })
      onGuardado()
    } catch (e) { alert(e.message) } finally { setGuardando(false) }
  }

  return (
    <div style={{ marginTop: 10, background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div className="field"><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
      <div className="field"><label>Descripción</label>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ minHeight: 60 }} placeholder="De qué trata, para qué sirve..." />
      </div>
      <div className="field"><label>Etiquetas (separadas por coma)</label>
        <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="Ej: alimentos, cuota, urgente" />
      </div>
      {tieneTexto && (
        <>
          {variables.length > 0 && <VariablesAyuda variables={variables} onInsertar={insertar} />}
          <div className="field" style={{ marginBottom: 8 }}><label>Texto</label>
            <textarea ref={taRef} value={contenido} onChange={(e) => setContenido(e.target.value)} style={{ minHeight: 170 }} />
          </div>
        </>
      )}
      <div className="row">
        <button className="btn btn-teal btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar cambios'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
