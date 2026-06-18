/**
 * "Mundo del expediente": un hub con todo lo del caso a mano.
 * - Encabezado con carátula, estado y despachante.
 * - Resumen libre editable.
 * - Defendidos (nuestros representados) con edades y datos.
 * - Dictámenes subidos (PDFs) con vista previa.
 * - Línea de tiempo (historial) de todo lo que pasó, con carga de intervenciones.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, obtenerToken, API_BASE, urlArchivo } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { claseEstado, fechaCorta, fechaHora, edadDesde, TIPOS_INTERVENCION } from '../utils/format'
import ExpedienteForm from '../components/ExpedienteForm'
import PreviewArchivo from '../components/PreviewArchivo'
import ArmarDesdeExpediente from '../components/ArmarDesdeExpediente'
import Icono from '../components/Icono'

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
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [id])

  async function cancelarVista() {
    if (!confirm('¿Cancelar la vista de este expediente?\nSe va a marcar en verde y se anotará en observaciones.')) return
    try {
      await api(`/api/expedientes/${id}/cancelar-vista`, { method: 'POST' })
      await cargar()
      alert('Vista cancelada.')
    } catch (e) { alert(e.message) }
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
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={cancelarVista}>✕ Cancelar vista</button>
            <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => setEditando(true)}>✎ Editar datos</button>
          </div>
        </div>
      </div>

      {/* Resumen editable */}
      <ResumenCard expediente={expediente} onGuardado={cargar} />

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
    } catch (e) { alert(e.message) } finally { setGuardando(false) }
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
  const [form, setForm] = useState({ nombre: '', fecha_nacimiento: '', vinculo: '', observaciones: '' })
  const [agregando, setAgregando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  async function agregar() {
    if (!form.nombre.trim()) return
    setAgregando(true)
    try {
      await api('/api/expedientes/defendidos', {
        method: 'POST',
        body: {
          expediente_id: parseInt(expedienteId, 10),
          nombre: form.nombre,
          fecha_nacimiento: form.fecha_nacimiento || null,
          vinculo: form.vinculo || null,
          observaciones: form.observaciones || null,
        },
      })
      setForm({ nombre: '', fecha_nacimiento: '', vinculo: '', observaciones: '' })
      setMostrarForm(false)
      onCambio()
    } catch (e) { alert(e.message) } finally { setAgregando(false) }
  }

  async function eliminar(did) {
    if (!confirm('¿Eliminar este defendido?')) return
    await api(`/api/expedientes/defendidos/${did}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Icono nombre="personas" size={15} color="var(--teal)" /> Nuestros defendidos</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMostrarForm((v) => !v)}>{mostrarForm ? 'Cancelar' : '+ Agregar'}</button>
      </div>
      <div className="card-body">
        {mostrarForm && (
          <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="field-row">
              <div className="field"><label>Nombre *</label><input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></div>
              <div className="field"><label>Fecha de nacimiento</label><input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Vínculo / rol</label><input value={form.vinculo} onChange={(e) => setForm((f) => ({ ...f, vinculo: e.target.value }))} placeholder="NNA, progenitor/a, etc." /></div>
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
                <div className="tl-meta">{[d.fecha_nacimiento && `Nac. ${fechaCorta(d.fecha_nacimiento)}`, d.vinculo, d.observaciones].filter(Boolean).join(' · ')}</div>
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
