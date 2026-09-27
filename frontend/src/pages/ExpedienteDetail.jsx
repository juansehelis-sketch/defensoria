/**
 * "Mundo del expediente": un hub con todo lo del caso a mano.
 * - Encabezado con carátula, estado y despachante.
 * - Resumen libre editable.
 * - Defendidos (nuestros representados) con edades y datos.
 * - Dictámenes subidos (PDFs) con vista previa.
 * - Línea de tiempo (historial) de todo lo que pasó, con carga de intervenciones.
 * - Etiquetas del equipo, botón para consultar la causa en el PJN, lectura de
 *   defendidos desde un PDF/Word y aviso de otras causas con el mismo DNI.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, obtenerToken, API_BASE, urlArchivo } from '../utils/api'
import { confirmar, avisar } from '../ui'
import { useAuth } from '../context/AuthContext'
import { claseEstado, fechaCorta, fechaHora, edadDesde, TIPOS_INTERVENCION } from '../utils/format'
import ExpedienteForm from '../components/ExpedienteForm'
import PreviewArchivo from '../components/PreviewArchivo'
import ArmarDesdeExpediente from '../components/ArmarDesdeExpediente'
import FichaExpediente from '../components/FichaExpediente'
import Icono from '../components/Icono'
import { EditorEtiquetas } from '../components/Etiquetas'

const URL_CONSULTA_PJN = 'https://scw.pjn.gov.ar/scw/home.seam'

// La consulta del PJN no admite abrir una causa por link: se abre la consulta
// y se deja el número copiado para pegar.
async function consultarEnPJN(numero) {
  const [num, anio] = (numero || '').split('/')
  const ventana = window.open(URL_CONSULTA_PJN, '_blank', 'noopener')
  try { await navigator.clipboard.writeText((num || '').trim()) } catch { /* sin permiso para copiar */ }
  avisar(`Se abrió la consulta del PJN y quedó copiado el número ${num}${anio ? ` (año ${anio})` : ''}. `
    + 'Elegí la jurisdicción "CIV - Cámara Nacional de Apelaciones en lo Civil", pegá el número y escribí el año.', 'info')
  if (!ventana) avisar('El navegador bloqueó la ventana nueva: permití las ventanas emergentes para este sitio.', 'error')
}

export default function ExpedienteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [expediente, setExpediente] = useState(null)
  const [historial, setHistorial] = useState([])
  const [defendidos, setDefendidos] = useState([])
  const [despachantes, setDespachantes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [armando, setArmando] = useState(false)
  const [legajo, setLegajo] = useState(null)

  async function cargar() {
    setCargando(true)
    try {
      const [exp, hist, defs, us] = await Promise.all([
        api(`/api/expedientes/${id}`),
        api(`/api/historial/expediente/${id}`),
        api(`/api/expedientes/${id}/defendidos`),
        api('/api/usuarios/'),
      ])
      setExpediente(exp)
      setHistorial(hist)
      setDefendidos(defs)
      setDespachantes(us)
      if (exp.legajo_id) api(`/api/legajos/${exp.legajo_id}`).then(setLegajo).catch(() => setLegajo(null))
      else setLegajo(null)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [id])

  async function cancelarVista() {
    if (!(await confirmar({ mensaje: '¿Cancelar la vista de este expediente? Se va a marcar en verde y se anotará en observaciones.', ok: 'Cancelar vista' }))) return
    try {
      await api(`/api/expedientes/${id}/cancelar-vista`, { method: 'POST' })
      await cargar()
      avisar('Vista cancelada.')
    } catch (e) { avisar(e.message, 'error') }
  }

  async function abrirLegajo() {
    if (legajo) { navigate(`/legajos?abrir=${legajo.id}`); return }
    try {
      const l = await api('/api/legajos/desde-expediente', { method: 'POST', body: { expediente_id: Number(id) } })
      navigate(`/legajos?abrir=${l.id}`)
    } catch (e) { avisar(e.message, 'error') }
  }

  if (cargando) return <div className="loading-center"><span className="spin" /></div>
  if (!expediente) return <div className="page"><div className="empty">Expediente no encontrado.</div></div>

  // Documentos con archivo (dictámenes y adjuntos)
  const documentos = historial.filter((h) => h.archivo_url)

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/expedientes')}>← Volver al listado</button>
        <div className="spacer" />
        <button className="btn btn-teal btn-sm" onClick={() => setArmando(true)}><Icono nombre="firma" size={14} />Armar escrito</button>
      </div>

      {armando && <ArmarDesdeExpediente expedienteId={Number(id)} onClose={() => setArmando(false)} />}

      <div className="card" style={{ borderLeft: '3px solid var(--teal)' }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <span className="card-title"><Icono nombre="personas" size={14} color="var(--teal)" /> Legajo de la persona</span>
              <div className="tl-meta" style={{ marginTop: 2 }}>
                {legajo ? `${legajo.nombre} · ${(legajo.numeros || []).length} expediente(s) agrupados` : 'Agrupá todos los expedientes y conexos de esta persona'}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={abrirLegajo} style={{ flexShrink: 0 }}>{legajo ? 'Ver legajo' : 'Crear / abrir legajo'}</button>
          </div>
        </div>
      </div>

      {/* Encabezado tipo "portada" */}
      <div style={{ background: 'linear-gradient(135deg,var(--navy) 0%,var(--navy3) 100%)', color: '#fff', borderRadius: 14, padding: '22px 26px', marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '.5px' }}>{expediente.numero}</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6, maxWidth: 760, lineHeight: 1.5 }}>{expediente.caratula}</div>
            <div className="row" style={{ gap: 18, marginTop: 13, fontSize: 12.5, opacity: 0.9 }}>
              <span className="row" style={{ gap: 6 }}><Icono nombre="expedientes" size={14} color="var(--celeste)" /> Juzgado {expediente.juzgado}</span>
              <span className="row" style={{ gap: 6 }}><Icono nombre="personas" size={14} color="var(--celeste)" /> {expediente.despachante_asignado || 'Sin asignar'}</span>
              <span className="row" style={{ gap: 6 }}><Icono nombre="audiencias" size={14} color="var(--celeste)" /> Entrada {fechaCorta(expediente.fecha_entrada)}</span>
              <span className={claseEstado(expediente.estado)}>{expediente.estado}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <EditorEtiquetas expediente={expediente} claro onCambio={(et) => setExpediente((e) => ({ ...e, etiquetas: et }))} />
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => consultarEnPJN(expediente.numero)} title="Abrir la consulta de causas del Poder Judicial de la Nación">
              <Icono nombre="abrir" size={13} color="#fff" /> Consultar en PJN
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={cancelarVista}>✕ Cancelar vista</button>
            <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => setEditando(true)}>✎ Editar datos</button>
          </div>
        </div>
      </div>

      {/* Resumen editable */}
      <ResumenCard expediente={expediente} onGuardado={cargar} />

      {/* Ficha Historia Social (editable en pantalla) */}
      <FichaExpediente expedienteId={expediente.id} />

      {/* Defendidos + Datos en dos columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }} className="dash-grid">
        <DefendidosCard expedienteId={id} defendidos={defendidos} onCambio={cargar} />
        <DatosCard expediente={expediente} />
      </div>

      {/* Dictámenes y documentos */}
      <div className="card">
        <div className="card-header"><span className="card-title"><Icono nombre="doc" size={15} color="var(--teal)" /> Dictámenes y documentos</span></div>
        <div className="card-body">
          {documentos.length === 0 ? (
            <div className="empty">Todavía no hay dictámenes ni documentos cargados.<br />Aparecen acá cuando se sube un dictamen al expediente o se adjunta un archivo.</div>
          ) : (
            documentos.map((h) => (
              <div key={h.id} style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span className={'badge ' + (h.tipo === 'dictamen' ? 'badge-sentencia' : 'badge-activo')}>{h.tipo}</span>
                  <span className="tl-meta">{fechaHora(h.fecha_creacion)}</span>
                </div>
                <PreviewArchivo archivo={{ nombre: `${h.tipo} ${fechaCorta(h.fecha_creacion)}`, url: h.archivo_url }} alturaPdf={420} abiertoInicial={h.tipo === 'dictamen'} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Línea de tiempo */}
      <TimelineCard expedienteId={id} historial={historial} despachantes={despachantes} onCambio={cargar} />

      {editando && (
        <ExpedienteForm
          expediente={expediente}
          despachantes={despachantes}
          onClose={() => setEditando(false)}
          onGuardado={() => { setEditando(false); cargar() }}
        />
      )}
    </div>
  )
}

// ── Resumen del caso (editable) ────────────────────────────────
function ResumenCard({ expediente, onGuardado }) {
  const [texto, setTexto] = useState(expediente.resumen || '')
  const [guardando, setGuardando] = useState(false)
  const cambiado = texto !== (expediente.resumen || '')

  async function guardar() {
    setGuardando(true)
    try {
      await api(`/api/expedientes/${expediente.id}`, { method: 'PUT', body: { resumen: texto } })
      onGuardado()
    } catch (e) { avisar(e.message, 'error') } finally { setGuardando(false) }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Icono nombre="resumen" size={15} color="var(--teal)" /> Resumen del caso</span>
        {cambiado && <button className="btn btn-teal btn-sm" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar resumen'}</button>}
      </div>
      <div className="card-body">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí acá un resumen del caso, el estado actual, lo que cada despachante quiera dejar anotado..."
          style={{ width: '100%', minHeight: 110, border: '1.5px solid var(--border)', borderRadius: 7, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, resize: 'vertical', background: '#fafbfc' }}
        />
      </div>
    </div>
  )
}

// ── Defendidos ─────────────────────────────────────────────────
function DefendidosCard({ expedienteId, defendidos, onCambio }) {
  const [form, setForm] = useState({ nombre: '', dni: '', fecha_nacimiento: '', vinculo: '', observaciones: '' })
  const [agregando, setAgregando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [propuestas, setPropuestas] = useState(null)  // personas leídas del archivo
  const [coincidencias, setCoincidencias] = useState([])

  useEffect(() => {
    api(`/api/expedientes/${expedienteId}/coincidencias`).then(setCoincidencias).catch(() => setCoincidencias([]))
  }, [expedienteId, defendidos])

  async function leerArchivo(archivo) {
    if (!archivo) return
    setLeyendo(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      const r = await api(`/api/expedientes/${expedienteId}/leer-personas`, { method: 'POST', body: fd, isForm: true })
      if (!r.personas.length) {
        avisar('No encontré personas con DNI o fecha de nacimiento en ese archivo.', 'info')
        setPropuestas(null)
      } else {
        setPropuestas(r.personas.map((p) => ({ ...p, nombre: p.nombre || '', dni: p.dni || '', fecha_nacimiento: p.fecha_nacimiento || '', vinculo: p.vinculo || '', elegida: !p.ya_cargado && !!p.nombre })))
      }
    } catch (e) { avisar(e.message, 'error') } finally { setLeyendo(false) }
  }

  function cambiarPropuesta(i, campo, valor) {
    setPropuestas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))
  }

  async function cargarElegidas() {
    const elegidas = propuestas.filter((p) => p.elegida && p.nombre.trim())
    if (!elegidas.length) { avisar('Marcá al menos una persona (con nombre).', 'error'); return }
    setAgregando(true)
    try {
      for (const p of elegidas) {
        await api('/api/expedientes/defendidos', {
          method: 'POST',
          body: {
            expediente_id: parseInt(expedienteId, 10), nombre: p.nombre.trim(), dni: p.dni || null,
            fecha_nacimiento: p.fecha_nacimiento || null, vinculo: p.vinculo || null,
          },
        })
      }
      avisar(elegidas.length === 1 ? 'Se cargó 1 defendido.' : `Se cargaron ${elegidas.length} defendidos.`)
      setPropuestas(null)
      onCambio()
    } catch (e) { avisar(e.message, 'error') } finally { setAgregando(false) }
  }

  async function agregar() {
    if (!form.nombre.trim()) return
    setAgregando(true)
    try {
      await api('/api/expedientes/defendidos', {
        method: 'POST',
        body: {
          expediente_id: parseInt(expedienteId, 10),
          nombre: form.nombre,
          dni: form.dni.trim() || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          vinculo: form.vinculo || null,
          observaciones: form.observaciones || null,
        },
      })
      setForm({ nombre: '', dni: '', fecha_nacimiento: '', vinculo: '', observaciones: '' })
      setMostrarForm(false)
      onCambio()
    } catch (e) { avisar(e.message, 'error') } finally { setAgregando(false) }
  }

  async function eliminar(did) {
    if (!(await confirmar({ mensaje: '¿Eliminar este defendido?', ok: 'Eliminar', peligro: true }))) return
    await api(`/api/expedientes/defendidos/${did}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Icono nombre="personas" size={15} color="var(--teal)" /> Nuestros defendidos</span>
        <div className="row" style={{ gap: 6 }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }} title="Subí la vista, la demanda o un escrito: el sistema propone las personas que aparecen con su DNI y fecha de nacimiento">
            {leyendo ? <span className="spin" /> : <><Icono nombre="doc" size={13} /> Leer de un PDF o Word</>}
            <input type="file" accept=".pdf,.docx" style={{ display: 'none' }} disabled={leyendo}
              onChange={(e) => { leerArchivo(e.target.files[0]); e.target.value = '' }} />
          </label>
          <button className="btn btn-ghost btn-sm" onClick={() => setMostrarForm((v) => !v)}>{mostrarForm ? 'Cancelar' : '+ Agregar'}</button>
        </div>
      </div>
      <div className="card-body">
        {coincidencias.length > 0 && (
          <div className="alert alert-warn" style={{ marginBottom: 12 }}>
            <strong>Otras causas con el mismo DNI:</strong>
            {coincidencias.map((c, i) => (
              <div key={i} style={{ marginTop: 4, fontSize: 13 }}>
                {c.defendido} (DNI {c.dni}) también está en el expte.{' '}
                <a href={`/expedientes/${c.expediente_id}`} style={{ fontWeight: 600 }}>{c.numero}</a>
                {c.caratula ? ` — ${c.caratula.slice(0, 70)}` : ''}
              </div>
            ))}
          </div>
        )}
        {propuestas && (
          <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <strong style={{ fontSize: 13.5 }}>Personas encontradas en el archivo</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setPropuestas(null)}>Cerrar</button>
            </div>
            <div className="tl-meta" style={{ marginBottom: 8 }}>Revisá los datos, corregí lo que haga falta y marcá a quiénes cargar.</div>
            {propuestas.map((p, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
                <label className="row" style={{ gap: 6, fontSize: 13, marginBottom: 6 }}>
                  <input type="checkbox" checked={p.elegida} onChange={(e) => cambiarPropuesta(i, 'elegida', e.target.checked)} />
                  <strong>{p.nombre || 'Sin nombre'}</strong>
                  {p.ya_cargado && <span className="badge badge-archivo">ya está cargado</span>}
                </label>
                <div className="field-row" style={{ gap: 8 }}>
                  <div className="field" style={{ marginBottom: 4 }}><label>Nombre</label><input value={p.nombre} onChange={(e) => cambiarPropuesta(i, 'nombre', e.target.value)} /></div>
                  <div className="field" style={{ marginBottom: 4 }}><label>DNI</label><input value={p.dni} onChange={(e) => cambiarPropuesta(i, 'dni', e.target.value)} /></div>
                </div>
                <div className="field-row" style={{ gap: 8 }}>
                  <div className="field" style={{ marginBottom: 4 }}><label>Fecha de nacimiento</label><input type="date" value={p.fecha_nacimiento} onChange={(e) => cambiarPropuesta(i, 'fecha_nacimiento', e.target.value)} /></div>
                  <div className="field" style={{ marginBottom: 4 }}><label>Vínculo / rol</label><input value={p.vinculo} onChange={(e) => cambiarPropuesta(i, 'vinculo', e.target.value)} placeholder="NNA, progenitor/a..." /></div>
                </div>
                {p.contexto && <div className="tl-meta" style={{ fontStyle: 'italic' }}>"…{p.contexto.slice(0, 220)}…"</div>}
              </div>
            ))}
            <button className="btn btn-teal btn-sm" style={{ marginTop: 8 }} onClick={cargarElegidas} disabled={agregando}>
              {agregando ? <span className="spin" /> : 'Cargar las marcadas'}
            </button>
          </div>
        )}
        {mostrarForm && (
          <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="field-row">
              <div className="field"><label>Nombre *</label><input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></div>
              <div className="field"><label>Fecha de nacimiento</label><input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>DNI</label><input value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} placeholder="Ej: 45.123.456" /></div>
              <div className="field"><label>Vínculo / rol</label><input value={form.vinculo} onChange={(e) => setForm((f) => ({ ...f, vinculo: e.target.value }))} placeholder="NNA, progenitor/a, etc." /></div>
            </div>
            <div className="field" style={{ marginBottom: 8 }}><label>Observaciones</label><input value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} /></div>
            <button className="btn btn-teal btn-sm" onClick={agregar} disabled={agregando}>{agregando ? <span className="spin" /> : 'Agregar defendido'}</button>
          </div>
        )}
        {defendidos.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>Sin defendidos cargados.</div>
        ) : (
          defendidos.map((d) => (
            <div key={d.id} className="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #edf0f5' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.nombre}{d.fecha_nacimiento && <span className="muted" style={{ fontWeight: 400 }}> · {edadDesde(d.fecha_nacimiento)} años</span>}</div>
                <div className="tl-meta">{[d.dni && `DNI ${d.dni}`, d.fecha_nacimiento && `Nac. ${fechaCorta(d.fecha_nacimiento)}`, d.vinculo, d.observaciones].filter(Boolean).join(' · ')}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => eliminar(d.id)}>✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Datos del expediente ───────────────────────────────────────
function DatosCard({ expediente }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title"><Icono nombre="expedientes" size={15} color="var(--teal)" /> Datos</span></div>
      <div className="card-body">
        <Dato label="Juzgado" valor={expediente.juzgado} />
        <Dato label="Tipo de proceso" valor={expediente.tipo_proceso || '—'} />
        <Dato label="Estado" valor={<span className={claseEstado(expediente.estado)}>{expediente.estado}</span>} />
        <Dato label="Fecha de entrada" valor={fechaCorta(expediente.fecha_entrada)} />
        <Dato label="Conexos" valor={expediente.conexos?.length ? expediente.conexos.join(', ') : '—'} />
        {expediente.observaciones && <Dato label="Observaciones" valor={expediente.observaciones} />}
      </div>
    </div>
  )
}

function Dato({ label, valor }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--navy)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{valor}</div>
    </div>
  )
}

// ── Línea de tiempo (historial) ────────────────────────────────
function TimelineCard({ expedienteId, historial, despachantes, onCambio }) {
  const [tipo, setTipo] = useState('informe')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)

  async function agregar() {
    setError('')
    if (!descripcion.trim()) { setError('Escribí una descripción.'); return }
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('expediente_id', expedienteId)
      fd.append('tipo', tipo)
      fd.append('descripcion', descripcion)
      if (archivo) fd.append('archivo', archivo)
      const resp = await fetch(API_BASE + '/api/historial/', { method: 'POST', headers: { Authorization: `Bearer ${obtenerToken()}` }, body: fd })
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || 'Error') }
      setDescripcion(''); setArchivo(null); setTipo('informe'); setMostrarForm(false)
      onCambio()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Icono nombre="reloj" size={15} color="var(--teal)" /> Línea de tiempo</span>
        <button className="btn btn-teal btn-sm" onClick={() => setMostrarForm((v) => !v)}>{mostrarForm ? 'Cancelar' : '+ Agregar al historial'}</button>
      </div>
      <div className="card-body">
        {mostrarForm && (
          <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            {error && <div className="alert alert-red">{error}</div>}
            <div className="field-row">
              <div className="field"><label>Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_INTERVENCION.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Adjuntar archivo (opcional)</label><input type="file" accept=".pdf,.doc,.docx,.jpg,.png" onChange={(e) => setArchivo(e.target.files[0])} /></div>
            </div>
            <div className="field"><label>Descripción</label><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué pasó / qué se hizo..." /></div>
            <button className="btn btn-teal" onClick={agregar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Agregar'}</button>
          </div>
        )}

        {historial.length === 0 ? (
          <div className="empty">Todavía no hay movimientos en este expediente.</div>
        ) : (
          <div className="timeline">
            {historial.map((h) => {
              const autor = despachantes.find((d) => d.id === h.usuario_id)
              return (
                <div key={h.id} className="tl-item">
                  <div className="tl-head">
                    <span className="tl-tipo">{h.tipo}</span>
                    <span className="tl-meta">{fechaHora(h.fecha_creacion)} · {autor?.nombre || 'Usuario'}</span>
                  </div>
                  <div className="tl-desc">{h.descripcion}</div>
                  {h.archivo_url && (
                    <a className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} href={urlArchivo(h.archivo_url)} target="_blank" rel="noreferrer"><Icono nombre="clip" size={13} />Ver archivo</a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
