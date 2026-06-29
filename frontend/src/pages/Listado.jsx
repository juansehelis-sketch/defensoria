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
import { api, obtenerToken, API_BASE } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { isoLocal, diaLargo, fechaCorta, fechaHora } from '../utils/format'
import Modal from '../components/Modal'
import ImportarPDF from '../components/ImportarPDF'
import PegarExcel from '../components/PegarExcel'
import TablaListado from '../components/TablaListado'
import Icono from '../components/Icono'

export default function Listado() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [dia, setDia] = useState(() => {
    // Arranca en hoy; si cae sábado o domingo, salta al día hábil anterior.
    const d = new Date()
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
    return d
  })
  const [vista, setVista] = useState('dia')               // 'dia' | 'general'
  const [ocultos, setOcultos] = useState(() => new Set()) // días ocultos a mano (ISO)
  const [mostrarOcultos, setMostrarOcultos] = useState(false)
  const [registros, setRegistros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [despachantes, setDespachantes] = useState([])

  const [busqueda, setBusqueda] = useState('')
  const [fAsignacion, setFAsignacion] = useState('')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarPDF, setMostrarPDF] = useState(false)
  const [mostrarPegar, setMostrarPegar] = useState(false)
  const [mostrarPapelera, setMostrarPapelera] = useState(false)
  const [exportando, setExportando] = useState(false)

  // La vista "general", una búsqueda o un filtro de asignación muestran TODAS
  // las fechas; si no, se ve día por día.
  const verTodas = vista === 'general' || busqueda.trim().length > 0 || !!fAsignacion
  const diaISO = isoLocal(dia)

  // Un día es hábil si no es sábado/domingo ni está oculto a mano.
  const esHabil = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !ocultos.has(isoLocal(d))
  function diaHabilDesde(base, dir) {
    const d = new Date(base); let i = 0
    while (!esHabil(d) && i < 400) { d.setDate(d.getDate() + dir); i++ }
    return d
  }

  // En la vista general se ocultan los registros que caen en días no hábiles.
  const registrosVista = useMemo(() => {
    if (!verTodas) return registros
    return registros.filter((r) => r.fecha && esHabil(new Date(r.fecha + 'T00:00:00')))
  }, [registros, verTodas, ocultos])

  async function cargar() {
    setCargando(true)
    try {
      const params = {}
      if (fAsignacion) params.asignacion = fAsignacion
      if (busqueda.trim()) params.busqueda = busqueda
      if (verTodas) {
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

  async function cargarOcultos() {
    try {
      const items = await api('/api/reportes/feriados')
      const s = new Set(items.map((f) => f.fecha))
      setOcultos(s)
      return s
    } catch { return ocultos }
  }

  useEffect(() => { api('/api/usuarios/').then(setDespachantes).catch(() => {}) }, [])
  useEffect(() => { cargarOcultos() }, [])
  useEffect(() => {
    const t = setTimeout(cargar, verTodas ? 250 : 0)
    return () => clearTimeout(t)
  }, [diaISO, busqueda, fAsignacion, vista])

  function cambiarDia(delta) {
    const d = new Date(dia); let i = 0
    do { d.setDate(d.getDate() + delta); i++ } while (!esHabil(d) && i < 400)
    setDia(d)
  }
  function irHoy() { setDia(diaHabilDesde(new Date(), -1)) }

  async function ocultarDia() {
    const motivo = window.prompt('Ocultar este día del listado (feriado, asueto, etc.).\nMotivo (opcional):', '')
    if (motivo === null) return // canceló
    try {
      await api('/api/reportes/feriados', { method: 'POST', body: { fecha: diaISO, motivo } })
      const s = await cargarOcultos()
      // saltar al próximo día hábil con la lista ya actualizada
      const d = new Date(dia); let i = 0
      do { d.setDate(d.getDate() + 1); i++ } while ((d.getDay() === 0 || d.getDay() === 6 || s.has(isoLocal(d))) && i < 400)
      setDia(d)
    } catch (e) { alert('No se pudo ocultar el día: ' + e.message) }
  }

  function filtrarMios() {
    setFAsignacion(fAsignacion === usuario?.nombre ? '' : usuario?.nombre || '')
  }

  async function exportar() {
    setExportando(true)
    try {
      const params = new URLSearchParams()
      if (!verTodas) { params.append('fecha_inicio', diaISO); params.append('fecha_fin', diaISO) }
      const resp = await fetch(`${API_BASE}/api/entrada-salida/export/excel?${params}`, {
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
            {verTodas ? `${registrosVista.length} resultado(s) · todas las fechas` : `${registrosVista.length} expediente(s) del día`}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => setMostrarPapelera(true)} title="Ver filas borradas"><Icono nombre="borrar" size={15} /> Papelera</button>
          <button className="btn btn-ghost" onClick={exportar} disabled={exportando}>
            {exportando ? <span className="spin" /> : <><Icono nombre="exportar" size={15} /> Exportar</>}
          </button>
          <button className="btn btn-ghost" onClick={() => setMostrarPegar(true)}><Icono nombre="importar" size={15} /> Pegar de Excel</button>
          <button className="btn btn-ghost" onClick={() => setMostrarPDF(true)}><Icono nombre="importar" size={15} /> Importar PDF</button>
          <button className="btn btn-teal" onClick={() => setMostrarForm(true)}><Icono nombre="agregar" size={16} /> Agregar</button>
        </div>
      </div>

      {/* Selector de vista + acceso a días ocultos */}
      <div className="row" style={{ gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div className="row" style={{ gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button className={'btn btn-sm ' + (vista === 'dia' ? 'btn-navy' : 'btn-ghost')} style={{ borderRadius: 0 }} onClick={() => setVista('dia')}>Por día</button>
          <button className={'btn btn-sm ' + (vista === 'general' ? 'btn-navy' : 'btn-ghost')} style={{ borderRadius: 0 }} onClick={() => setVista('general')}>Todos los días</button>
        </div>
        {(busqueda.trim() || fAsignacion) ? <span className="tl-meta">la búsqueda muestra todas las fechas</span> : null}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--muted)' }} onClick={() => setMostrarOcultos(true)}>
          <Icono nombre="reloj" size={14} /> Días ocultos{ocultos.size ? ` (${ocultos.size})` : ''}
        </button>
      </div>

      {/* Navegador de día */}
      {!verTodas && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => cambiarDia(-1)}>← Día anterior</button>
            <div style={{ textAlign: 'center', minWidth: 230 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--navy)' }}>{diaLargo(dia)}</div>
              {esHoy && <div className="tl-meta" style={{ color: 'var(--teal)' }}>Hoy</div>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => cambiarDia(1)}>Día siguiente →</button>
            <span style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <input type="date" value={diaISO} onChange={(e) => { if (e.target.value) { const p = new Date(e.target.value + 'T00:00:00'); setDia(esHabil(p) ? p : diaHabilDesde(p, -1)) } }} style={{ padding: '6px 9px', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }} />
            {!esHoy && <button className="btn btn-ghost btn-sm" onClick={irHoy}>Ir a hoy</button>}
            <span style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <button className="btn btn-ghost btn-sm" onClick={ocultarDia} style={{ color: 'var(--muted)', fontSize: 12 }} title="Ocultar este día (feriado/asueto)">Ocultar este día</button>
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
        <span style={{ marginLeft: 'auto' }}>Click para editar · Tab/Enter para moverte · la flecha abre el expediente.</span>
      </div>

      <div className="card">
        {cargando ? (
          <div className="loading-center"><span className="spin" /></div>
        ) : registrosVista.length === 0 ? (
          <div className="empty">{verTodas ? 'Sin resultados.' : 'No hay expedientes cargados este día.'}</div>
        ) : (
          <TablaListado
            registros={registrosVista}
            despachantes={despachantes}
            mostrarFecha={verTodas}
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
      {mostrarPegar && (
        <PegarExcel fechaDefault={diaISO} onClose={() => setMostrarPegar(false)}
          onListo={(n) => { setMostrarPegar(false); cargar(); alert(`Se cargaron ${n} fila(s) al listado.`) }} />
      )}
      {mostrarPapelera && <Papelera onClose={() => setMostrarPapelera(false)} />}
      {mostrarOcultos && <DiasOcultos onClose={() => setMostrarOcultos(false)} onCambio={cargarOcultos} />}
    </div>
  )
}

// ── Días ocultos del listado (feriados/asuetos marcados a mano) ──
function DiasOcultos({ onClose, onCambio }) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    setCargando(true)
    try { setItems(await api('/api/reportes/feriados')) } catch { /* ignorar */ } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  async function restaurar(id) {
    await api(`/api/reportes/feriados/${id}`, { method: 'DELETE' })
    await cargar()
    onCambio && onCambio()
  }

  return (
    <Modal titulo="Días ocultos del listado" ancho={560} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <p className="tl-meta" style={{ marginBottom: 10 }}>
        Los sábados y domingos se ocultan solos. Acá quedan los días hábiles que ocultaste a mano (feriados, asuetos). Restauralos cuando quieras.
      </p>
      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : items.length === 0 ? (
        <div className="empty">No hay días ocultos a mano.</div>
      ) : (
        <table className="data">
          <thead><tr><th>Fecha</th><th>Motivo</th><th></th></tr></thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} style={{ cursor: 'default' }}>
                <td className="mono">{fechaCorta(f.fecha)}</td>
                <td>{f.motivo || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => restaurar(f.id)}>Restaurar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}

// ── Papelera: filas borradas (por las dudas) ───────────────────
function Papelera({ onClose }) {
  const [borrados, setBorrados] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    api('/api/entrada-salida/borrados')
      .then(setBorrados)
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [])

  return (
    <Modal titulo="Papelera — filas borradas" ancho={820} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <p className="tl-meta" style={{ marginBottom: 10 }}>Cada vez que se borra una fila del listado, queda registrada acá con quién y cuándo la borró.</p>
      {cargando ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : borrados.length === 0 ? (
        <div className="empty">No se borró ninguna fila todavía.</div>
      ) : (
        <div className="table-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr><th>Borrado</th><th>Por</th><th>Fecha fila</th><th>Juzgado</th><th>Expediente</th><th>Autos</th><th>Asignación</th></tr>
            </thead>
            <tbody>
              {borrados.map((b) => (
                <tr key={b.id} style={{ cursor: 'default' }}>
                  <td className="mono">{fechaHora(b.fecha_borrado)}</td>
                  <td>{b.borrado_por || '—'}</td>
                  <td className="mono">{fechaCorta(b.fecha)}</td>
                  <td className="mono">{b.juzgado}</td>
                  <td className="mono">{b.numero_expediente || '—'}</td>
                  <td style={{ maxWidth: 280 }}>{b.autos}</td>
                  <td>{b.asignacion || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
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
        <span className="row" style={{ fontWeight: 600, gap: 5, color: form.urgente ? 'var(--red)' : 'inherit' }}><Icono nombre="alerta" size={14} />Marcar como URGENTE</span>
        <span className="tl-meta">(le avisa a la persona asignada en su pantalla de inicio)</span>
      </label>
    </Modal>
  )
}
