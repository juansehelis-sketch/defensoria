/**
 * Agenda de audiencias.
 * - Vista calendario mensual con las audiencias de cada día.
 * - Importación desde texto pegado (formato planilla).
 * - Alta manual vinculada a un expediente.
 *
 * Nota: la arquitectura deja lugar para integrar Google Calendar más adelante
 * (los datos de audiencia ya contienen fecha/hora/juzgado/expediente).
 */

import { useEffect, useState, useMemo } from 'react'
import { api } from '../utils/api'
import Modal from '../components/Modal'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Audiencias() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth()) // 0-11
  const [audiencias, setAudiencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [diaSel, setDiaSel] = useState(null)
  const [mostrarImport, setMostrarImport] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      // Rango del mes
      const inicio = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
      const ultimoDia = new Date(anio, mes + 1, 0).getDate()
      const fin = `${anio}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`
      const data = await api('/api/audiencias/', { params: { fecha_inicio: inicio, fecha_fin: fin } })
      setAudiencias(data)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [anio, mes])

  // Agrupar audiencias por día (número de día del mes)
  const porDia = useMemo(() => {
    const map = {}
    audiencias.forEach((a) => {
      const d = parseInt(a.fecha.split('-')[2], 10)
      if (!map[d]) map[d] = []
      map[d].push(a)
    })
    return map
  }, [audiencias])

  // Construir la grilla del calendario
  const celdas = useMemo(() => {
    const primerDia = new Date(anio, mes, 1)
    // getDay(): 0=Dom..6=Sáb → convertir a 0=Lun..6=Dom
    let offset = primerDia.getDay() - 1
    if (offset < 0) offset = 6
    const totalDias = new Date(anio, mes + 1, 0).getDate()
    const arr = []
    for (let i = 0; i < offset; i++) arr.push(null)
    for (let d = 1; d <= totalDias; d++) arr.push(d)
    return arr
  }, [anio, mes])

  function cambiarMes(delta) {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio-- }
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++ }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
    setDiaSel(null)
  }

  const audienciasDiaSel = diaSel ? (porDia[diaSel] || []) : []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Agenda de audiencias</div>
          <div className="page-sub">{audiencias.length} audiencia(s) en {MESES[mes]} {anio}</div>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => setMostrarImport(true)}>📋 Importar desde texto</button>
          <button className="btn btn-teal" onClick={() => setMostrarForm(true)}>+ Nueva audiencia</button>
        </div>
      </div>

      {/* Navegación de mes */}
      <div className="row" style={{ marginBottom: 14, justifyContent: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => cambiarMes(-1)}>←</button>
        <strong style={{ minWidth: 180, textAlign: 'center' }}>{MESES[mes]} {anio}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => cambiarMes(1)}>→</button>
      </div>

      <div className="card">
        <div className="card-body">
          {cargando ? (
            <div className="loading-center"><span className="spin" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {DIAS.map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
              ))}
              {celdas.map((d, i) => {
                const items = d ? (porDia[d] || []) : []
                const esHoy = d === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear()
                return (
                  <div
                    key={i}
                    onClick={() => d && setDiaSel(d)}
                    style={{
                      minHeight: 76, borderRadius: 8, padding: 6,
                      border: '1px solid var(--border)',
                      background: d ? (esHoy ? 'var(--teal-lt)' : '#fff') : 'transparent',
                      cursor: d ? 'pointer' : 'default',
                      outline: diaSel === d ? '2px solid var(--teal)' : 'none',
                    }}
                  >
                    {d && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: esHoy ? 'var(--teal)' : 'var(--text)' }}>{d}</div>
                        {items.slice(0, 2).map((a) => (
                          <div key={a.id} style={{ fontSize: 10, marginTop: 2, padding: '1px 4px', borderRadius: 4, background: 'var(--navy)', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(a.hora).slice(0, 5)} J{a.juzgado}
                          </div>
                        ))}
                        {items.length > 2 && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>+{items.length - 2} más</div>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detalle del día seleccionado */}
      {diaSel && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Audiencias del {diaSel}/{mes + 1}/{anio}</span>
            <button className="modal-close" onClick={() => setDiaSel(null)}>×</button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {audienciasDiaSel.length === 0 ? (
              <div className="empty">Sin audiencias este día.</div>
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Hora</th><th>Juzgado</th><th>Motivo</th><th>Modalidad</th><th>Acceso / Dirección</th><th>Asesor/a</th><th>Estado</th></tr></thead>
                  <tbody>
                    {audienciasDiaSel.sort((a, b) => String(a.hora).localeCompare(String(b.hora))).map((a) => (
                      <tr key={a.id} style={{ cursor: 'default' }}>
                        <td className="mono">{String(a.hora).slice(0, 5)}</td>
                        <td className="mono">{a.juzgado}</td>
                        <td>{a.motivo || a.base_legal || '—'}</td>
                        <td>{a.modalidad === 'Virtual' ? '💻 Virtual' : a.modalidad === 'Presencial' ? '📍 Presencial' : (a.modalidad || '—')}</td>
                        <td className="muted" style={{ maxWidth: 220, whiteSpace: 'pre-wrap' }}>{a.modalidad === 'Virtual' ? (a.datos_acceso || '—') : (a.direccion || '—')}</td>
                        <td>{a.asesor || '—'}</td>
                        <td><span className="badge badge-activo">{a.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarImport && (
        <ImportarAudiencias onClose={() => setMostrarImport(false)} onImportado={() => { setMostrarImport(false); cargar() }} />
      )}
      {mostrarForm && (
        <FormAudiencia onClose={() => setMostrarForm(false)} onGuardado={() => { setMostrarForm(false); cargar() }} />
      )}
    </div>
  )
}

// ── Importar desde texto ───────────────────────────────────────
function ImportarAudiencias({ onClose, onImportado }) {
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function importar() {
    setError('')
    setCargando(true)
    try {
      const r = await api('/api/audiencias/importar-texto', { method: 'POST', body: { texto } })
      setResultado(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal
      titulo="Importar audiencias desde texto"
      ancho={720}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {!resultado && <button className="btn btn-teal" onClick={importar} disabled={cargando || !texto.trim()}>{cargando ? <span className="spin" /> : 'Importar'}</button>}
          {resultado && <button className="btn btn-teal" onClick={onImportado}>Listo</button>}
        </>
      }
    >
      {error && <div className="alert alert-red">{error}</div>}
      {!resultado ? (
        <>
          <p className="tl-meta" style={{ marginBottom: 8 }}>
            Pegá el listado copiado de la planilla. Columnas (separadas por tabulación):<br />
            <code>fecha · hora · juzgado · expediente · carátula · base legal · asesor · modalidad</code>
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} style={{ minHeight: 200, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }} placeholder="Pegá acá..." />
          </div>
        </>
      ) : (
        <div>
          <div className="alert alert-ok">✓ Se crearon {resultado.total_creadas} audiencia(s).</div>
          {resultado.advertencias?.length > 0 && (
            <div>
              {resultado.advertencias.map((a, i) => <div key={i} className="alert alert-warn">{a}</div>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Alta manual ────────────────────────────────────────────────
function FormAudiencia({ onClose, onGuardado }) {
  const [expedientes, setExpedientes] = useState([])
  const [form, setForm] = useState({
    expediente_id: '', fecha: new Date().toISOString().split('T')[0], hora: '09:00',
    juzgado: '', motivo: '', modalidad: 'Presencial', datos_acceso: '', direccion: '', asesor: '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api('/api/expedientes/', { params: { limit: 500 } }).then(setExpedientes).catch(() => {})
  }, [])

  function set(c, v) { setForm((f) => ({ ...f, [c]: v })) }

  async function guardar() {
    setError('')
    if (!form.expediente_id || !form.fecha || !form.hora) {
      setError('Expediente, fecha y hora son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      await api('/api/audiencias/', {
        method: 'POST',
        body: {
          ...form,
          expediente_id: parseInt(form.expediente_id, 10),
          hora: form.hora.length === 5 ? form.hora + ':00' : form.hora,
        },
      })
      onGuardado()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo="Nueva audiencia"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar'}</button>
        </>
      }
    >
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field">
        <label>Expediente * (número y carátula)</label>
        <select value={form.expediente_id} onChange={(e) => {
          const exp = expedientes.find((x) => String(x.id) === e.target.value)
          set('expediente_id', e.target.value)
          if (exp && !form.juzgado) set('juzgado', exp.juzgado)
        }}>
          <option value="">— Elegir expediente —</option>
          {expedientes.map((x) => <option key={x.id} value={x.id}>{x.numero} · {x.caratula?.slice(0, 60)}</option>)}
        </select>
      </div>
      <div className="field-row-3">
        <div className="field"><label>Fecha *</label><input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
        <div className="field"><label>Hora *</label><input type="time" value={form.hora} onChange={(e) => set('hora', e.target.value)} /></div>
        <div className="field"><label>Juzgado</label><input value={form.juzgado} onChange={(e) => set('juzgado', e.target.value)} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Motivo</label><input value={form.motivo} onChange={(e) => set('motivo', e.target.value)} placeholder="Motivo de la audiencia" /></div>
        <div className="field">
          <label>Modalidad</label>
          <select value={form.modalidad} onChange={(e) => set('modalidad', e.target.value)}>
            <option>Presencial</option><option>Virtual</option>
          </select>
        </div>
      </div>

      {/* Campo condicional según modalidad */}
      {form.modalidad === 'Virtual' ? (
        <div className="field">
          <label>💻 Datos de acceso (link/sala)</label>
          <textarea value={form.datos_acceso} onChange={(e) => set('datos_acceso', e.target.value)} placeholder="Link de la videollamada, ID de sala, contraseña..." style={{ minHeight: 60 }} />
        </div>
      ) : (
        <div className="field">
          <label>📍 Dirección</label>
          <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Dirección donde se realiza la audiencia" />
        </div>
      )}

      <div className="field" style={{ marginBottom: 0 }}><label>Asesor/a (opcional)</label><input value={form.asesor} onChange={(e) => set('asesor', e.target.value)} /></div>
    </Modal>
  )
}
