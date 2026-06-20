/**
 * Agenda personal: las tareas de cada usuario. Se agregan con título y una
 * fecha límite opcional; se marcan como hechas con el tilde.
 */
import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import Icono from './Icono'
import { fechaCorta } from '../utils/format'

export default function MisTareas() {
  const [tareas, setTareas] = useState([])
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [verHechas, setVerHechas] = useState(false)
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    setCargando(true)
    try { setTareas(await api('/api/tareas/', { params: verHechas ? { incluir_hechas: true } : {} })) }
    catch (e) { console.error(e) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [verHechas])

  async function agregar() {
    if (!titulo.trim()) return
    await api('/api/tareas/', { method: 'POST', body: { titulo: titulo.trim(), fecha_limite: fecha || null } })
    setTitulo(''); setFecha(''); cargar()
  }
  async function toggle(t) { await api(`/api/tareas/${t.id}`, { method: 'PUT', body: { hecha: !t.hecha } }); cargar() }
  async function borrar(t) { await api(`/api/tareas/${t.id}`, { method: 'DELETE' }); cargar() }

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Icono nombre="firma" size={14} color="var(--teal)" /> Mis tareas</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setVerHechas((v) => !v)}>{verHechas ? 'Ocultar hechas' : 'Ver hechas'}</button>
      </div>
      <div className="card-body">
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap', marginBottom: 12 }}>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nueva tarea..." onKeyDown={(e) => e.key === 'Enter' && agregar()} style={{ flex: 1 }} />
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 160 }} title="Fecha límite (opcional)" />
          <button className="btn btn-teal" onClick={agregar}>Agregar</button>
        </div>
        {cargando ? (
          <div className="loading-center" style={{ padding: 20 }}><span className="spin" /></div>
        ) : tareas.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>No tenés tareas pendientes. ¡Al día!</div>
        ) : (
          tareas.map((t) => {
            const vencida = t.fecha_limite && !t.hecha && t.fecha_limite < hoy
            return (
              <div key={t.id} className="row" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #edf0f5', opacity: t.hecha ? 0.55 : 1 }}>
                <label className="row" style={{ gap: 9, cursor: 'pointer', minWidth: 0 }}>
                  <input type="checkbox" checked={t.hecha} onChange={() => toggle(t)} style={{ width: 'auto' }} />
                  <span style={{ textDecoration: t.hecha ? 'line-through' : 'none', fontSize: 14 }}>{t.titulo}</span>
                  {t.fecha_limite && <span className="badge" style={{ background: vencida ? 'var(--red)' : 'var(--teal-lt)', color: vencida ? '#fff' : 'var(--teal)' }}>{fechaCorta(t.fecha_limite)}</span>}
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => borrar(t)} title="Borrar tarea"><Icono nombre="borrar" size={13} color="var(--red)" /></button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
