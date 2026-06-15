/**
 * Formulario de alta/edición de expediente (dentro de un modal).
 */

import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import Modal from './Modal'
import { ESTADOS } from '../utils/format'

export default function ExpedienteForm({ expediente, despachantes, onClose, onGuardado }) {
  const esEdicion = Boolean(expediente)
  const [form, setForm] = useState({
    numero: '',
    juzgado: '',
    caratula: '',
    tipo_proceso: '',
    estado: 'activo',
    despachante_asignado: '',
    fecha_entrada: new Date().toISOString().split('T')[0],
    observaciones: '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (expediente) {
      setForm({
        numero: expediente.numero || '',
        juzgado: expediente.juzgado || '',
        caratula: expediente.caratula || '',
        tipo_proceso: expediente.tipo_proceso || '',
        estado: expediente.estado || 'activo',
        despachante_asignado: expediente.despachante_asignado || '',
        fecha_entrada: expediente.fecha_entrada || new Date().toISOString().split('T')[0],
        observaciones: expediente.observaciones || '',
      })
    }
  }, [expediente])

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function guardar() {
    setError('')
    if (!form.numero.trim() || !form.juzgado.trim() || !form.caratula.trim()) {
      setError('Número, juzgado y carátula son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      if (esEdicion) {
        await api(`/api/expedientes/${expediente.id}`, {
          method: 'PUT',
          body: {
            estado: form.estado,
            despachante_asignado: form.despachante_asignado || null,
            observaciones: form.observaciones,
          },
        })
      } else {
        await api('/api/expedientes/', {
          method: 'POST',
          body: { ...form, conexos: [] },
        })
      }
      onGuardado()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo={esEdicion ? `Editar expediente ${expediente.numero}` : 'Nuevo expediente'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-teal" onClick={guardar} disabled={guardando}>
            {guardando ? <span className="spin" /> : 'Guardar'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-red">{error}</div>}

      <div className="field-row">
        <div className="field">
          <label>N° Expediente *</label>
          <input
            value={form.numero}
            onChange={(e) => set('numero', e.target.value)}
            placeholder="38226/2024"
            disabled={esEdicion}
          />
        </div>
        <div className="field">
          <label>Juzgado *</label>
          <input value={form.juzgado} onChange={(e) => set('juzgado', e.target.value)} placeholder="80" disabled={esEdicion} />
        </div>
      </div>

      <div className="field">
        <label>Carátula *</label>
        <textarea value={form.caratula} onChange={(e) => set('caratula', e.target.value)} disabled={esEdicion} placeholder="APELLIDO, NOMBRE c/ ... s/..." />
      </div>

      <div className="field-row-3">
        <div className="field">
          <label>Tipo de proceso</label>
          <input value={form.tipo_proceso} onChange={(e) => set('tipo_proceso', e.target.value)} placeholder="Sucesión, Desalojo..." disabled={esEdicion} />
        </div>
        <div className="field">
          <label>Estado</label>
          <select value={form.estado} onChange={(e) => set('estado', e.target.value)}>
            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Fecha de entrada</label>
          <input type="date" value={form.fecha_entrada} onChange={(e) => set('fecha_entrada', e.target.value)} disabled={esEdicion} />
        </div>
      </div>

      <div className="field">
        <label>Despachante asignado</label>
        <select value={form.despachante_asignado} onChange={(e) => set('despachante_asignado', e.target.value)}>
          <option value="">— Sin asignar —</option>
          {despachantes.map((d) => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Observaciones</label>
        <textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
      </div>
    </Modal>
  )
}
