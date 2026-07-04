/**
 * Mapa de instituciones de CABA.
 * Marca lugares (hospitales, hogares, salud mental, etc.) donde hay personas
 * internadas. Se agrega un lugar haciendo clic en el mapa; cada marca guarda
 * nombre, tipo, dirección, teléfono y observaciones.
 *
 * Usa Leaflet + tiles de OpenStreetMap (gratis, sin API key).
 */

import { useEffect, useRef, useState } from 'react'
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

export default function Mapa() {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const capa = useRef(null)
  const modoRef = useRef('ver')

  const [lugares, setLugares] = useState([])
  const [modo, setModo] = useState('ver')       // 'ver' | 'agregar'
  const [form, setForm] = useState(null)        // datos del formulario (alta/edición)
  const [dir, setDir] = useState('')            // buscador de direcciones
  const [buscando, setBuscando] = useState(false)

  useEffect(() => { modoRef.current = modo }, [modo])

  async function cargar() {
    try { setLugares(await api('/api/mapa/lugares')) } catch (e) { console.error(e) }
  }

  // Iniciar el mapa una sola vez
  useEffect(() => {
    if (mapa.current || !contenedor.current) return
    mapa.current = L.map(contenedor.current).setView(CABA, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(mapa.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    mapa.current.on('click', (e) => {
      if (modoRef.current === 'agregar') {
        setForm({ id: null, nombre: '', tipo: 'hospital', direccion: '', telefono: '', observaciones: '', lat: e.latlng.lat, lng: e.latlng.lng })
        setModo('ver')
      }
    })
    setTimeout(() => mapa.current && mapa.current.invalidateSize(), 200)
    cargar()
  }, [])

  // Redibujar marcadores cuando cambian los lugares
  useEffect(() => {
    if (!capa.current) return
    capa.current.clearLayers()
    lugares.forEach((l) => {
      const info = tipoInfo(l.tipo)
      const m = L.marker([l.lat, l.lng], { icon: pinIcon(info.color) })
      m.bindPopup(
        `<b>${escapeHtml(l.nombre)}</b><br><span style="color:${info.color};font-weight:600">${info.label}</span>` +
        (l.direccion ? `<br>${escapeHtml(l.direccion)}` : '') +
        (l.telefono ? `<br>Tel: ${escapeHtml(l.telefono)}` : '') +
        (l.observaciones ? `<br><i>${escapeHtml(l.observaciones)}</i>` : '')
      )
      capa.current.addLayer(m)
    })
  }, [lugares])

  function irA(l) {
    if (!mapa.current) return
    mapa.current.setView([l.lat, l.lng], 16, { animate: true })
  }

  async function buscarDireccion() {
    const q = dir.trim()
    if (!q) return
    setBuscando(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ', Ciudad Autónoma de Buenos Aires, Argentina')}`
      const r = await fetch(url, { headers: { 'Accept-Language': 'es' } })
      const data = await r.json()
      if (data && data.length) {
        mapa.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16)
      } else {
        alert('No se encontró esa dirección. Igual podés hacer clic en el mapa donde esté el lugar.')
      }
    } catch { alert('No se pudo buscar la dirección.') } finally { setBuscando(false) }
  }

  async function borrar(l) {
    if (!confirm(`¿Eliminar "${l.nombre}" del mapa?`)) return
    await api(`/api/mapa/lugares/${l.id}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', minHeight: 480 }}>
      {/* Panel lateral */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="page-title" style={{ fontSize: 20, marginBottom: 2 }}>Mapa de instituciones</div>
          <div className="page-sub" style={{ marginBottom: 12 }}>Hospitales, hogares y lugares donde hay personas internadas</div>

          <button className={'btn ' + (modo === 'agregar' ? 'btn-navy' : 'btn-teal')} style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setModo(modo === 'agregar' ? 'ver' : 'agregar')}>
            {modo === 'agregar' ? 'Cancelar' : <><Icono nombre="agregar" size={16} /> Agregar lugar</>}
          </button>
          {modo === 'agregar' && (
            <div className="alert alert-ok" style={{ marginTop: 10, marginBottom: 0 }}>
              Hacé clic en el mapa, en el lugar exacto donde está la institución.
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Buscar una dirección..."
              onKeyDown={(e) => e.key === 'Enter' && buscarDireccion()}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }} />
            <button className="btn btn-ghost btn-sm" onClick={buscarDireccion} disabled={buscando}>{buscando ? <span className="spin" /> : <Icono nombre="buscar" size={15} />}</button>
          </div>
        </div>

        {/* Leyenda */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TIPOS.map((t) => (
            <span key={t.id} className="row" style={{ gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: t.color }} />{t.label}
            </span>
          ))}
        </div>

        {/* Lista */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {lugares.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>Todavía no hay lugares cargados.</div>
          ) : (
            lugares.map((l) => {
              const info = tipoInfo(l.tipo)
              return (
                <div key={l.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => irA(l)}>
                  <div className="row" style={{ gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: info.color, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.nombre}</div>
                      <div className="tl-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>{info.label}{l.direccion ? ` · ${l.direccion}` : ''}</div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...l })}>Editar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => borrar(l)}><Icono nombre="borrar" size={13} color="var(--red)" /></button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Mapa */}
      <div ref={contenedor} style={{ flex: 1, height: '100%' }} />

      {form && (
        <FormLugar datos={form} onClose={() => setForm(null)} onGuardado={() => { setForm(null); cargar() }} onReubicar={form.id ? () => { setForm(null); setModoReubicar(form) } : null} />
      )}
    </div>
  )

  // Reubicar: cerramos el form y en el próximo clic movemos el lugar existente
  function setModoReubicar(l) {
    const handler = async (e) => {
      mapa.current.off('click', handler)
      await api(`/api/mapa/lugares/${l.id}`, { method: 'PUT', body: { lat: e.latlng.lat, lng: e.latlng.lng } })
      cargar()
    }
    alert('Hacé clic en el mapa en la nueva ubicación del lugar.')
    mapa.current.on('click', handler)
  }
}

function FormLugar({ datos, onClose, onGuardado, onReubicar }) {
  const [f, setF] = useState(datos)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (c, v) => setF((p) => ({ ...p, [c]: v }))
  const esNuevo = !f.id

  async function guardar() {
    setError('')
    if (!f.nombre.trim()) { setError('Poné el nombre del lugar.'); return }
    setGuardando(true)
    try {
      if (esNuevo) await api('/api/mapa/lugares', { method: 'POST', body: f })
      else await api(`/api/mapa/lugares/${f.id}`, { method: 'PUT', body: f })
      onGuardado()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo={esNuevo ? 'Nuevo lugar' : 'Editar lugar'} ancho={520} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar'}</button></>}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field"><label>Nombre *</label><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} autoFocus placeholder="Ej: Hospital Tobar García" /></div>
      <div className="field"><label>Tipo</label>
        <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="field"><label>Dirección</label><input value={f.direccion || ''} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle y número, barrio" /></div>
      <div className="field"><label>Teléfono</label><input value={f.telefono || ''} onChange={(e) => set('telefono', e.target.value)} /></div>
      <div className="field" style={{ marginBottom: onReubicar ? 12 : 0 }}><label>Observaciones (quién está internado, contacto, etc.)</label>
        <textarea value={f.observaciones || ''} onChange={(e) => set('observaciones', e.target.value)} style={{ minHeight: 70 }} />
      </div>
      {onReubicar && (
        <button className="btn btn-ghost btn-sm" onClick={onReubicar}><Icono nombre="mapa" size={14} /> Cambiar ubicación en el mapa</button>
      )}
    </Modal>
  )
}
