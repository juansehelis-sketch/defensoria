/**
 * Listado genérico de expedientes — UNA PÁGINA POR DÍA.
 * Al entrar se ve el día de hoy; se navega día por día (← / →) o saltando con el selector.
 * Si escribís en "Buscar", pasa a modo búsqueda global (en todas las fechas).
 *
 * Columnas: Juzgado | Expediente | Autos | Asignación | Pase a la firma | Subido al Lex | Observaciones
 * (la Fecha es la del día mostrado; en modo búsqueda se agrega la columna Fecha).
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, obtenerToken } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { isoLocal, diaLargo } from '../utils/format'
import Modal from '../components/Modal'
import ImportarPDF from '../components/ImportarPDF'
import TablaListado from '../components/TablaListado'

export default function Listado() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [dia, setDia] = useState(new Date())
  const [registros, setRegistros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [despachantes, setDespachantes] = useState([])

  const [busqueda, setBusqueda] = useState('')
  const [fAsignacion, setFAsignacion] = useState('')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarPDF, setMostrarPDF] = useState(false)
  const [exportando, setExportando] = useState(false)

  // Cualquier filtro activo (búsqueda o asignación) muestra TODAS las fechas;
  // sin filtros, se ve día por día.
  const modoGlobal = busqueda.trim().length > 0 || !!fAsignacion
  const diaISO = isoLocal(dia)

  async function cargar() {
    setCargando(true)
    try {
      const params = {}
      if (fAsignacion) params.asignacion = fAsignacion
      if (busqueda.trim()) params.busqueda = busqueda
      if (modoGlobal) {
        params.limit = 1000
      } else {
        params.fecha_inicio = diaISO
        params.fecha_fin = diaISO
        params.limit = 500
      }
      const data = await api('/api/entrada-salida/', { params })
      setRegistros(data)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { api('/api/usuarios/').then(setDespachantes).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(cargar, modoGlobal ? 250 : 0)
    return () => clearTimeout(t)
  }, [diaISO, busqueda, fAsignacion])

  function cambiarDia(delta) {
    const d = new Date(dia)
    d.setDate(d.getDate() + delta)
    setDia(d)
  }
  function irHoy() { setDia(new Date()) }

  function filtrarMios() {
    setFAsignacion(fAsignacion === usuario?.nombre ? '' : usuario?.nombre || '')
  }

  async function exportar() {
    setExportando(true)
    try {
      const params = new URLSearchParams()
      if (!modoGlobal) { params.append('fecha_inicio', diaISO); params.append('fecha_fin', diaISO) }
      const resp = await fetch(`/api/entrada-salida/export/excel?${params}`, {
        method: 'POST', headers: { Authorization: `Bearer ${obtenerToken()}` },
      })
      const data = await resp.json()
      const bytes = new Uint8Array(data.data.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = data.filename || 'listado.xlsx'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Error al exportar: ' + e.message)
    } finally {
      setExportando(false)
    }
  }

  const esHoy = diaISO === isoLocal(new Date())

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Listado de expedientes</div>
          <div className="page-sub">
            {modoGlobal ? `${registros.length} resultado(s) · todas las fechas` : `${registros.length} expediente(s) del día`}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={exportar} disabled={exportando}>
            {exportando ? <span className="spin" /> : '⬇ Exportar'}
          </button>
          <button className="btn btn-ghost" onClick={() => setMostrarPDF(true)}>📄 Importar PDF</button>
          <button className="btn btn-teal" onClick={() => setMostrarForm(true)}>+ Agregar</button>
        </div>
      </div>

      {/* Navegador de día */}
      {!modoGlobal && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => cambiarDia(-1)}>← Día anterior</button>
            <div style={{ textAlign: 'center', minWidth: 230 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--navy)' }}>{diaLargo(dia)}</div>
              {esHoy && <div className="tl-meta" style={{ color: 'var(--teal)' }}>Hoy</div>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => cambiarDia(1)}>Día siguiente →</button>
            <span style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <input type="date" value={diaISO} onChange={(e) => e.target.value && setDia(new Date(e.target.value + 'T00:00:00'))} style={{ padding: '6px 9px', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }} />
            {!esHoy && <button className="btn btn-ghost btn-sm" onClick={irHoy}>Ir a hoy</button>}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros">
        <div className="field search-box">
          <label>Buscar (en todas las fechas)</label>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="N° expediente, autos, observaciones..." />
        </div>
        <div className="field">
          <label>Asignación</label>
          <select value={fAsignacion} onChange={(e) => setFAsignacion(e.target.value)}>
            <option value="">Todas</option>
            {despachantes.map((d) => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
          </select>
        </div>
        {usuario?.rol !== 'defensora' && (
          <button className={'btn btn-sm ' + (fAsignacion === usuario?.nombre ? 'btn-navy' : 'btn-ghost')} onClick={filtrarMios}>
            {fAsignacion === usuario?.nombre ? '✓ ' : ''}Mis expedientes
          </button>
        )}
      </div>

      <div className="row" style={{ gap: 16, marginBottom: 8, fontSize: 12, color: 'var(--muted)' }}>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#fef3c7', border: '1px solid #e6d28a' }} /> Enviado a la firma</span>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#dcfce7', border: '1px solid #a7e3bf' }} /> Subido / vista cancelada</span>
        <span style={{ marginLeft: 'auto' }}>✏️ Hacé click en cualquier celda para editarla. ↗ abre el expediente.</span>
      </div>

      <div className="card">
        {cargando ? (
          <div className="loading-center"><span className="spin" /></div>
        ) : registros.length === 0 ? (
          <div className="empty">{modoGlobal ? 'Sin resultados para esa búsqueda.' : 'No hay expedientes cargados este día.'}</div>
        ) : (
          <TablaListado
            registros={registros}
            despachantes={despachantes}
            mostrarFecha={modoGlobal}
            onCambio={cargar}
            onAbrir={(eid) => navigate(`/expedientes/${eid}`)}
          />
        )}
      </div>

      {mostrarForm && (
        <FormListado fechaDefault={diaISO} despachantes={despachantes} onClose={() => setMostrarForm(false)} onGuardado={() => { setMostrarForm(false); cargar() }} />
      )}
      {mostrarPDF && (
        <ImportarPDF onClose={() => setMostrarPDF(false)} onImportado={() => { setMostrarPDF(false); cargar() }} />
      )}
    </div>
  )
}

// ── Formulario de alta al listado ──────────────────────────────
function FormListado({ fechaDefault, despachantes, onClose, onGuardado }) {
  const [form, setForm] = useState({
    fecha: fechaDefault, juzgado: '', numero_expediente: '', autos: '', asignacion: '', observaciones: '', urgente: false,
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  function set(c, v) { setForm((f) => ({ ...f, [c]: v })) }

  // Autocompletar al escribir el número: si el expediente ya vino antes,
  // rellena juzgado, carátula, asignación y observaciones (su última info).
  useEffect(() => {
    const num = form.numero_expediente.trim()
    if (num.length < 4) { setAviso(''); return }
    const t = setTimeout(async () => {
      try {
        const r = await api('/api/expedientes/por-numero', { params: { numero: num } })
        if (r.existe) {
          setForm((f) => ({
            ...f,
            juzgado: f.juzgado || r.juzgado || '',
            autos: f.autos || r.caratula || '',
            asignacion: f.asignacion || r.asignacion || '',
            observaciones: f.observaciones || r.observaciones || '',
          }))
          setAviso(`✓ Expediente ya registrado — autocompleté sus datos (asignado a ${r.asignacion || 'nadie'}).`)
        } else {
          setAviso('Expediente nuevo (no estaba en el sistema).')
        }
      } catch { /* ignorar */ }
    }, 350)
    return () => clearTimeout(t)
  }, [form.numero_expediente])

  async function guardar() {
    setError('')
    if (!form.fecha || !form.juzgado.trim() || !form.numero_expediente.trim() || !form.autos.trim()) {
      setError('Fecha, juzgado, expediente y autos son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      await api('/api/entrada-salida/', { method: 'POST', body: { ...form, subido_defensa: false } })
      // urgente ya viaja dentro de ...form
      onGuardado()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo="Agregar expediente al listado"
      ancho={680}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar'}</button>
        </>
      }
    >
      {error && <div className="alert alert-red">{error}</div>}
      {aviso && <div className="alert alert-ok" style={{ marginBottom: 12 }}>{aviso}</div>}
      <div className="field-row-3">
        <div className="field"><label>N° Expediente *</label><input value={form.numero_expediente} onChange={(e) => set('numero_expediente', e.target.value)} placeholder="38226/2024" autoFocus /></div>
        <div className="field"><label>Fecha *</label><input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
        <div className="field"><label>Juzgado *</label><input value={form.juzgado} onChange={(e) => set('juzgado', e.target.value)} placeholder="80" /></div>
      </div>
      <div className="field"><label>Autos (carátula) *</label><textarea value={form.autos} onChange={(e) => set('autos', e.target.value)} /></div>
      <div className="field">
        <label>Asignación</label>
        <select value={form.asignacion} onChange={(e) => set('asignacion', e.target.value)}>
          <option value="">— Sin asignar —</option>
          {despachantes.map((d) => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
      </div>
      <div className="field"><label>Observaciones</label><textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} /></div>
      <label className="row" style={{ fontSize: 13, cursor: 'pointer', gap: 8, marginBottom: 0 }}>
        <input type="checkbox" checked={form.urgente} onChange={(e) => set('urgente', e.target.checked)} style={{ width: 'auto' }} />
        <span style={{ fontWeight: 600, color: form.urgente ? 'var(--red)' : 'inherit' }}>⚠️ Marcar como URGENTE</span>
        <span className="tl-meta">(le avisa a la persona asignada en su pantalla de inicio)</span>
      </label>
    </Modal>
  )
}
