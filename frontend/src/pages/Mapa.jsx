/**
 * Mapa de instituciones de CABA.
 * Marca lugares (hospitales, hogares, salud mental, etc.) donde hay personas
 * internadas. Cada lugar guarda datos + una lista de personas, y cada persona
 * puede vincularse a un expediente.
 *
 * Un lugar se agrega escribiendo la dirección (calle y número) y tocando
 * "Ubicar" (se geolocaliza solo), o marcándolo a mano en el mapa.
 *
 * Usa Leaflet + tiles de OpenStreetMap (gratis, sin API key).
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../utils/api'
import Icono from '../components/Icono'
import Modal from '../components/Modal'

const CABA = [-34.6118, -58.4173]

const TIPOS = [
  { id: 'hospital', label: 'Hospital', color: '#dc2626' },
  { id: 'hogar', label: 'Hogar / residencia', color: '#b23a6a' },
  { id: 'salud_mental', label: 'Salud mental / clínica', color: '#7c3aed' },
  { id: 'centro_dia', label: 'Centro de día', color: '#0891b2' },
  { id: 'geriatrico', label: 'Geriátrico', color: '#d97706' },
  { id: 'otro', label: 'Otro', color: '#64748b' },
]
const tipoInfo = (id) => TIPOS.find((t) => t.id === id) || TIPOS[TIPOS.length - 1]

const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function pinIcon(color) {
  const html = `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 1C7.8 1 2 6.6 2 13.6 2 22 15 38 15 38s13-16 13-24.4C28 6.6 22.2 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="13.5" r="4.5" fill="#fff"/></svg>`
  return L.divIcon({ html, className: 'pin-mapa', iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] })
}

// Geolocaliza una dirección de CABA. Devuelve {lat,lng} o null.
// Se acota a Argentina y a la caja de CABA para no traer calles homónimas de
// otras ciudades. La confirmación final la hace la persona arrastrando el pin.
async function geocodificar(direccion) {
  const q = (direccion || '').trim()
  if (!q) return null
  try {
    const params = new URLSearchParams({
      format: 'json', limit: '1', countrycodes: 'ar', bounded: '1',
      viewbox: '-58.531,-34.526,-58.335,-34.705', // CABA (izq,arriba,der,abajo)
      q: `${q}, Ciudad Autónoma de Buenos Aires, Argentina`,
    })
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'es' } })
    const d = await r.json()
    if (d && d.length) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
  } catch { /* ignorar */ }
  return null
}

export default function Mapa() {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const capa = useRef(null)
  const modoRef = useRef('ver')
  const pendiente = useRef(null) // datos del form mientras se marca a mano
  const confirmMarker = useRef(null)
  const confirmCoords = useRef(null)

  const [lugares, setLugares] = useState([])
  const [modo, setModo] = useState('ver')   // 'ver' | 'agregar'
  const [form, setForm] = useState(null)     // alta/edición de datos del lugar
  const [detalle, setDetalle] = useState(null) // lugar abierto en su ficha
  const [dir, setDir] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [confirmando, setConfirmando] = useState(null) // {formData} al confirmar ubicación

  useEffect(() => { modoRef.current = modo }, [modo])

  async function cargar() {
    try { setLugares(await api('/api/mapa/lugares')) } catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (mapa.current || !contenedor.current) return
    mapa.current = L.map(contenedor.current).setView(CABA, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(mapa.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    mapa.current.on('click', (e) => {
      if (modoRef.current === 'agregar') {
        const base = pendiente.current || { id: null, nombre: '', tipo: 'hospital', direccion: '', telefono: '', observaciones: '' }
        setForm({ ...base, lat: e.latlng.lat, lng: e.latlng.lng })
        pendiente.current = null
        setModo('ver')
      }
    })
    setTimeout(() => mapa.current && mapa.current.invalidateSize(), 200)
    cargar()
  }, [])

  useEffect(() => {
    if (!capa.current) return
    capa.current.clearLayers()
    lugares.forEach((l) => {
      const info = tipoInfo(l.tipo)
      const m = L.marker([l.lat, l.lng], { icon: pinIcon(info.color) })
      m.bindTooltip(`${escapeHtml(l.nombre)}${l.cantidad ? ` (${l.cantidad})` : ''}`)
      m.on('click', () => setDetalle(l))
      capa.current.addLayer(m)
    })
  }, [lugares])

  function irA(l) { if (mapa.current) mapa.current.setView([l.lat, l.lng], 16, { animate: true }) }

  async function buscarDireccion() {
    if (!dir.trim()) return
    setBuscando(true)
    const c = await geocodificar(dir)
    setBuscando(false)
    if (c) mapa.current.setView([c.lat, c.lng], 16)
    else alert('No se encontró esa dirección. Podés marcar el lugar a mano en el mapa.')
  }

  function marcarAMano(datosForm) {
    pendiente.current = datosForm
    setForm(null)
    setModo('agregar')
  }

  // Confirmación de la ubicación geocodificada: pin negro arrastrable + barra.
  function iniciarConfirmacion(coords, formData) {
    setForm(null)
    confirmCoords.current = coords
    if (confirmMarker.current) mapa.current.removeLayer(confirmMarker.current)
    const mk = L.marker([coords.lat, coords.lng], { icon: pinIcon('#111827'), draggable: true })
    mk.on('dragend', () => { const p = mk.getLatLng(); confirmCoords.current = { lat: p.lat, lng: p.lng } })
    mk.addTo(mapa.current)
    confirmMarker.current = mk
    mapa.current.setView([coords.lat, coords.lng], 17)
    setConfirmando({ formData })
  }
  function _quitarConfirmMarker() {
    if (confirmMarker.current) { mapa.current.removeLayer(confirmMarker.current); confirmMarker.current = null }
  }
  function confirmarUbicacion() {
    const c = confirmCoords.current
    const fd = confirmando.formData
    _quitarConfirmMarker(); setConfirmando(null)
    setForm({ ...fd, lat: c.lat, lng: c.lng })
  }
  function cancelarUbicacion() {
    const fd = confirmando.formData
    _quitarConfirmMarker(); setConfirmando(null)
    setForm(fd)
  }

  async function borrar(l) {
    if (!confirm(`¿Eliminar "${l.nombre}" del mapa? (se borran también sus personas)`)) return
    await api(`/api/mapa/lugares/${l.id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', minHeight: 480 }}>
      <div style={{ width: 330, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="page-title" style={{ fontSize: 20, marginBottom: 2 }}>Mapa de instituciones</div>
          <div className="page-sub" style={{ marginBottom: 12 }}>Lugares donde hay personas internadas</div>

          <button className="btn btn-teal" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { pendiente.current = null; setForm({ id: null, nombre: '', tipo: 'hospital', direccion: '', telefono: '', observaciones: '', lat: null, lng: null }) }}>
            <Icono nombre="agregar" size={16} /> Agregar institución
          </button>
          {modo === 'agregar' && (
            <div className="alert alert-ok" style={{ marginTop: 10, marginBottom: 0 }}>
              Hacé clic en el mapa, en el lugar exacto de la institución.
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Buscar una dirección en el mapa..."
              onKeyDown={(e) => e.key === 'Enter' && buscarDireccion()}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
            <button className="btn btn-ghost btn-sm" onClick={buscarDireccion} disabled={buscando}>{buscando ? <span className="spin" /> : <Icono nombre="buscar" size={15} />}</button>
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TIPOS.map((t) => (
            <span key={t.id} className="row" style={{ gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: t.color }} />{t.label}
            </span>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {lugares.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>Todavía no hay instituciones cargadas.</div>
          ) : (
            lugares.map((l) => {
              const info = tipoInfo(l.tipo)
              return (
                <div key={l.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="row" style={{ gap: 7, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setDetalle(l)}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: info.color, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.nombre}</div>
                      <div className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {info.label}{l.direccion ? ` · ${l.direccion}` : ''}{l.cantidad ? ` · ${l.cantidad} persona${l.cantidad !== 1 ? 's' : ''}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetalle(l)}>Ver / personas</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => irA(l)} title="Centrar en el mapa"><Icono nombre="mapa" size={13} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => borrar(l)} title="Eliminar"><Icono nombre="borrar" size={13} color="var(--red)" /></button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={contenedor} style={{ position: 'absolute', inset: 0 }} />
        {confirmando && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,.15)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: '92%' }}>
            <span style={{ fontSize: 13.5 }}>¿Quedó bien la marca? Arrastrá el pin negro hasta el lugar exacto.</span>
            <button className="btn btn-ghost btn-sm" onClick={cancelarUbicacion}>Cancelar</button>
            <button className="btn btn-teal btn-sm" onClick={confirmarUbicacion}>Confirmar</button>
          </div>
        )}
      </div>

      {form && (
        <FormLugar datos={form} onClose={() => setForm(null)}
          onGuardado={(guardado) => { setForm(null); cargar(); if (guardado) irA(guardado) }}
          onMarcarMapa={marcarAMano} onUbicar={iniciarConfirmacion} />
      )}
      {detalle && (
        <DetalleLugar lugar={detalle} onClose={() => setDetalle(null)}
          onEditar={() => { const l = detalle; setDetalle(null); setForm({ ...l }) }}
          onBorrar={() => { const l = detalle; setDetalle(null); borrar(l) }}
          onCambio={cargar} />
      )}
    </div>
  )
}

function FormLugar({ datos, onClose, onGuardado, onMarcarMapa, onUbicar }) {
  const [f, setF] = useState(datos)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ubicando, setUbicando] = useState(false)
  const set = (c, v) => setF((p) => ({ ...p, [c]: v }))
  const esNuevo = !f.id
  const ubicado = f.lat != null && f.lng != null

  async function ubicar() {
    if (!(f.direccion || '').trim()) { setError('Escribí la dirección (calle y número) para ubicarla.'); return }
    setError(''); setUbicando(true)
    const c = await geocodificar(f.direccion)
    setUbicando(false)
    if (c) onUbicar(c, f)  // pasa a confirmar/ajustar el pin en el mapa
    else setError('No encontramos esa dirección. Revisá calle y número, o marcala a mano en el mapa.')
  }

  async function guardar() {
    setError('')
    if (!f.nombre.trim()) { setError('Poné el nombre de la institución.'); return }
    if (f.lat == null || f.lng == null) {
      setError('Falta fijar la ubicación: escribí la dirección y tocá "Ubicar", o marcala a mano en el mapa.')
      return
    }
    setGuardando(true)
    try {
      const guardado = esNuevo
        ? await api('/api/mapa/lugares', { method: 'POST', body: f })
        : await api(`/api/mapa/lugares/${f.id}`, { method: 'PUT', body: f })
      onGuardado(guardado)
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo={esNuevo ? 'Nueva institución' : 'Editar institución'} ancho={540} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar'}</button></>}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field"><label>Nombre *</label><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} autoFocus placeholder="Ej: Hospital Tobar García" /></div>
      <div className="field"><label>Tipo</label>
        <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Dirección (calle y número)</label>
        <div className="row" style={{ gap: 6 }}>
          <input value={f.direccion || ''} onChange={(e) => set('direccion', e.target.value)} placeholder="Ej: Ramón Carrillo 315" style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && ubicar()} />
          <button className="btn btn-navy btn-sm" onClick={ubicar} disabled={ubicando}>{ubicando ? <span className="spin" /> : 'Ubicar'}</button>
        </div>
        <div className="tl-meta" style={{ marginTop: 5, textTransform: 'none', letterSpacing: 0, color: ubicado ? '#15803d' : 'var(--muted)' }}>
          {ubicado ? '✓ Ubicación fijada en el mapa' : 'Escribí la dirección y tocá "Ubicar" para marcarla sola.'}
        </div>
      </div>
      <div className="field"><label>Teléfono</label><input value={f.telefono || ''} onChange={(e) => set('telefono', e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 12 }}><label>Observaciones</label>
        <textarea value={f.observaciones || ''} onChange={(e) => set('observaciones', e.target.value)} style={{ minHeight: 60 }} />
      </div>
      {onMarcarMapa && (
        <button className="btn btn-ghost btn-sm" onClick={() => onMarcarMapa(f)}><Icono nombre="mapa" size={14} /> …o marcarla a mano en el mapa</button>
      )}
    </Modal>
  )
}

// Ficha de una institución: datos + personas internadas (vinculables a expedientes).
function DetalleLugar({ lugar, onClose, onEditar, onBorrar, onCambio }) {
  const navigate = useNavigate()
  const info = tipoInfo(lugar.tipo)
  const [gente, setGente] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState({ nombre: '', expediente_numero: '', observaciones: '' })
  const [guardando, setGuardando] = useState(false)

  async function cargarGente() {
    setCargando(true)
    try { setGente(await api(`/api/mapa/lugares/${lugar.id}/internados`)) } catch { /* ignorar */ } finally { setCargando(false) }
  }
  useEffect(() => { cargarGente() }, [lugar.id])

  async function agregar() {
    if (!nuevo.nombre.trim()) return
    setGuardando(true)
    try {
      await api(`/api/mapa/lugares/${lugar.id}/internados`, { method: 'POST', body: nuevo })
      setNuevo({ nombre: '', expediente_numero: '', observaciones: '' })
      cargarGente(); onCambio && onCambio()
    } catch (e) { alert(e.message) } finally { setGuardando(false) }
  }
  async function borrarGente(id) {
    await api(`/api/mapa/internados/${id}`, { method: 'DELETE' })
    cargarGente(); onCambio && onCambio()
  }

  return (
    <Modal titulo={lugar.nombre} ancho={620} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onBorrar} style={{ color: 'var(--red)' }}>Eliminar institución</button><button className="btn btn-navy" onClick={onEditar}>Editar datos</button><button className="btn btn-ghost" onClick={onClose}>Cerrar</button></>}>
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="row" style={{ gap: 5, background: info.color, color: '#fff', fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 99 }}>{info.label}</span>
      </div>
      {lugar.direccion && <div style={{ fontSize: 13.5 }}>{lugar.direccion}</div>}
      {lugar.telefono && <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>Tel: {lugar.telefono}</div>}
      {lugar.observaciones && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{lugar.observaciones}</div>}

      <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 10px' }} />
      <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Personas internadas acá</div>

      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : gente.length === 0 ? (
        <div className="empty" style={{ padding: 12 }}>Todavía no cargaste personas en esta institución.</div>
      ) : (
        gente.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}><Icono nombre="personas" size={13} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 5 }} />{p.nombre}</div>
              {p.expediente_numero && (
                <div className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Expte. {p.expediente_numero}
                  {p.expediente_id
                    ? <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', marginLeft: 6 }} onClick={() => { onClose(); navigate(`/expedientes/${p.expediente_id}`) }}>abrir</button>
                    : <span style={{ color: 'var(--muted)' }}> (no está en el sistema)</span>}
                </div>
              )}
              {p.legajo_id && (
                <div className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Legajo: {p.legajo_nombre}
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', marginLeft: 6 }} onClick={() => { onClose(); navigate(`/legajos?abrir=${p.legajo_id}`) }}>abrir</button>
                </div>
              )}
              {p.observaciones && <div className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>{p.observaciones}</div>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => borrarGente(p.id)} title="Quitar"><Icono nombre="borrar" size={13} color="var(--red)" /></button>
          </div>
        ))
      )}

      <div style={{ background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 12 }}>
        <div className="field" style={{ marginBottom: 8 }}><label>Nombre de la persona</label>
          <input value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} placeholder="Nombre y apellido" />
        </div>
        <div className="field" style={{ marginBottom: 8 }}><label>N° de expediente (opcional)</label>
          <input value={nuevo.expediente_numero} onChange={(e) => setNuevo((n) => ({ ...n, expediente_numero: e.target.value }))} placeholder="Ej: 38226/2024" />
        </div>
        <div className="field" style={{ marginBottom: 8 }}><label>Observaciones (opcional)</label>
          <input value={nuevo.observaciones} onChange={(e) => setNuevo((n) => ({ ...n, observaciones: e.target.value }))} />
        </div>
        <button className="btn btn-teal btn-sm" onClick={agregar} disabled={guardando || !nuevo.nombre.trim()}>{guardando ? <span className="spin" /> : 'Agregar persona'}</button>
      </div>
    </Modal>
  )
}
