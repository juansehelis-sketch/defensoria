/**
 * Legajos por persona: cada NNA/representado con TODOS sus expedientes y conexos
 * juntos. Los conexos se capturan solos desde "conexos:" en observaciones, y
 * también se agregan a mano.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import Modal from '../components/Modal'
import Icono from '../components/Icono'

export default function Legajos() {
  const [legajos, setLegajos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState(false)
  const [sel, setSel] = useState(null)
  const [params] = useSearchParams()

  useEffect(() => { const a = params.get('abrir'); if (a) setSel({ id: Number(a) }) }, [])

  async function cargar() {
    setCargando(true)
    try { setLegajos(await api('/api/legajos/', { params: busqueda ? { buscar: busqueda } : {} })) }
    catch (e) { console.error(e) } finally { setCargando(false) }
  }
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t) }, [busqueda])

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <div className="page-title">Legajos por persona</div>
          <div className="page-sub">Cada persona con todos sus expedientes y conexos juntos</div>
        </div>
        <button className="btn btn-teal" onClick={() => setNuevo(true)}><Icono nombre="agregar" size={15} />Nuevo legajo</button>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre..." />
      </div>

      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : legajos.length === 0 ? (
        <div className="card"><div className="empty">No hay legajos todavía.<br />Creá uno, o abrilo desde un expediente (botón “Legajo de la persona”).</div></div>
      ) : (
        legajos.map((l) => (
          <div key={l.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSel(l)}>
            <div className="card-body" style={{ padding: '13px 18px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>
                    <Icono nombre="personas" size={15} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 7 }} />{l.nombre}
                  </div>
                  <div className="tl-meta">{l.dni ? `DNI ${l.dni} · ` : ''}{(l.numeros || []).length} expediente(s)</div>
                </div>
                <Icono nombre="abrir" size={16} color="var(--muted)" />
              </div>
            </div>
          </div>
        ))
      )}

      {nuevo && <NuevoLegajo onClose={() => setNuevo(false)} onCreado={(l) => { setNuevo(false); cargar(); setSel(l) }} />}
      {sel && <LegajoDetalle legajoId={sel.id} onClose={() => setSel(null)} onCambio={cargar} />}
    </div>
  )
}

function NuevoLegajo({ onClose, onCreado }) {
  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [g, setG] = useState(false)
  async function crear() {
    if (!nombre.trim()) return
    setG(true)
    try { onCreado(await api('/api/legajos/', { method: 'POST', body: { nombre: nombre.trim(), dni: dni || null, numeros: [] } })) }
    catch (e) { alert(e.message) } finally { setG(false) }
  }
  return (
    <Modal titulo="Nuevo legajo" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-teal" onClick={crear} disabled={g}>{g ? <span className="spin" /> : 'Crear'}</button></>}>
      <div className="field"><label>Nombre de la persona *</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Apellido, Nombre" onKeyDown={(e) => e.key === 'Enter' && crear()} /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>DNI (opcional)</label><input value={dni} onChange={(e) => setDni(e.target.value)} /></div>
    </Modal>
  )
}

function LegajoDetalle({ legajoId, onClose, onCambio }) {
  const navigate = useNavigate()
  const [l, setL] = useState(null)
  const [nuevoNum, setNuevoNum] = useState('')

  async function cargar() { setL(await api(`/api/legajos/${legajoId}`)) }
  useEffect(() => { cargar() }, [legajoId])

  async function guardar(campo, valor) { await api(`/api/legajos/${legajoId}`, { method: 'PUT', body: { [campo]: valor } }); onCambio?.() }
  async function agregarNum() { if (!nuevoNum.trim()) return; await api(`/api/legajos/${legajoId}/numeros`, { method: 'POST', body: { numero: nuevoNum.trim() } }); setNuevoNum(''); cargar(); onCambio?.() }
  async function quitarNum(n) { await api(`/api/legajos/${legajoId}/numeros/${encodeURIComponent(n)}`, { method: 'DELETE' }); cargar(); onCambio?.() }
  async function eliminar() { if (!confirm('¿Eliminar este legajo? Los expedientes no se borran.')) return; await api(`/api/legajos/${legajoId}`, { method: 'DELETE' }); onClose(); onCambio?.() }

  if (!l) return <Modal titulo="Legajo" onClose={onClose}><div className="loading-center"><span className="spin" /></div></Modal>

  const porNumero = {}
  ;(l.expedientes || []).forEach((e) => { porNumero[e.numero] = e })

  return (
    <Modal titulo={`Legajo · ${l.nombre}`} ancho={680} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={eliminar} style={{ color: 'var(--red)' }}>Eliminar legajo</button><button className="btn btn-teal" onClick={onClose}>Listo</button></>}>
      <div className="field-row">
        <div className="field"><label>Nombre</label><input defaultValue={l.nombre} onBlur={(e) => guardar('nombre', e.target.value)} /></div>
        <div className="field"><label>DNI</label><input defaultValue={l.dni || ''} onBlur={(e) => guardar('dni', e.target.value)} /></div>
      </div>
      <div className="field"><label>Observaciones del legajo</label><textarea defaultValue={l.observaciones || ''} onBlur={(e) => guardar('observaciones', e.target.value)} style={{ minHeight: 60 }} /></div>

      <div className="card-title" style={{ margin: '12px 0 8px' }}>Expedientes del legajo ({(l.numeros || []).length})</div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap', marginBottom: 10 }}>
        <input value={nuevoNum} onChange={(e) => setNuevoNum(e.target.value)} placeholder="Agregar número (ej. 12345/2024)" onKeyDown={(e) => e.key === 'Enter' && agregarNum()} />
        <button className="btn btn-teal" onClick={agregarNum}>Agregar</button>
      </div>
      {(l.numeros || []).length === 0 ? (
        <div className="empty" style={{ padding: 14 }}>Sin expedientes. Se suman solos desde “conexos:” en las observaciones, o a mano.</div>
      ) : (
        (l.numeros || []).map((n) => {
          const e = porNumero[n]
          return (
            <div key={n} className="row" style={{ justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', marginBottom: 6 }}>
              <div style={{ minWidth: 0 }}>
                <span className="mono" style={{ fontWeight: 600 }}>{n}</span>
                {e && <span className="tl-meta" style={{ marginLeft: 8 }}>{(e.caratula || '').slice(0, 52)}</span>}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                {e && <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); navigate(`/expedientes/${e.id}`) }} title="Abrir expediente"><Icono nombre="abrir" size={14} /></button>}
                <button className="btn btn-ghost btn-sm" onClick={() => quitarNum(n)} title="Quitar del legajo"><Icono nombre="borrar" size={14} color="var(--red)" /></button>
              </div>
            </div>
          )
        })
      )}
    </Modal>
  )
}
