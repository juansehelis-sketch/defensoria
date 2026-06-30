/**
 * Panel de usuarios — solo para administradores / defensora.
 * Permite dar de alta, cambiar rol, activar/desactivar y resetear contraseñas
 * del equipo, sin tocar la consola.
 */

import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Icono from '../components/Icono'

const ROLES = ['despachante', 'secretaria', 'defensora', 'admin']

export default function Usuarios() {
  const { usuario } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [alta, setAlta] = useState(false)
  const [reset, setReset] = useState(null) // usuario al que se le resetea la clave
  const [error, setError] = useState('')
  const [mailConfig, setMailConfig] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function cargar() {
    setCargando(true)
    try { setUsuarios(await api('/api/usuarios/', { params: { todos: true } })) }
    catch (e) { setError(e.message) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => { api('/api/reportes/mail-estado').then((r) => setMailConfig(r.configurado)).catch(() => setMailConfig(false)) }, [])

  async function enviarResumen() {
    setEnviando(true)
    try {
      const r = await api('/api/reportes/resumen-diario', { method: 'POST' })
      if (!r.configurado) alert('El correo todavía no está configurado (faltan los datos del servidor SMTP).')
      else alert(`Resumen enviado a ${r.enviados} persona(s). Omitidos: ${r.omitidos}.`)
    } catch (e) { alert(e.message) } finally { setEnviando(false) }
  }

  async function actualizar(u, cambios) {
    setError('')
    try { await api(`/api/usuarios/${u.id}`, { method: 'PUT', body: cambios }); cargar() }
    catch (e) { setError(e.message); cargar() }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Usuarios del equipo</div>
          <div className="page-sub">Altas, roles, activación y contraseñas</div>
        </div>
        <button className="btn btn-teal" onClick={() => setAlta(true)}><Icono nombre="agregar" size={16} /> Agregar usuario</button>
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card">
        {cargando ? (
          <div className="loading-center"><span className="spin" /></div>
        ) : (
          <table className="data">
            <thead>
              <tr><th>Nombre</th><th>Email (usuario)</th><th>Rol</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ cursor: 'default', opacity: u.activo ? 1 : 0.55 }}>
                  <td>{u.nombre}</td>
                  <td className="mono">{u.email}</td>
                  <td>
                    <select value={u.rol} onChange={(e) => actualizar(u, { rol: e.target.value })}
                      style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6 }}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    {u.activo
                      ? <span className="row" style={{ gap: 5, color: '#15803d', fontWeight: 600, fontSize: 13 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: '#22c55e' }} />Activo</span>
                      : <span className="row" style={{ gap: 5, color: 'var(--muted)', fontSize: 13 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: '#cbd5e1' }} />Inactivo</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setReset(u)}>Resetear clave</button>
                    {u.id !== usuario?.id && (
                      <button className="btn btn-ghost btn-sm" onClick={() => actualizar(u, { activo: !u.activo })}>
                        {u.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="tl-meta" style={{ marginTop: 10 }}>
        El email funciona como nombre de usuario para entrar. Desactivar no borra nada: la persona deja de poder ingresar pero su historial se conserva.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><span className="card-title"><Icono nombre="reportes" size={16} color="var(--teal)" /> Resumen diario por mail</span></div>
        <div className="card-body">
          <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 0 }}>
            Cada persona recibe por mail la lista de sus expedientes pendientes de subir al Lex. El envío automático es a la mañana; también podés mandarlo ahora.
          </p>
          {mailConfig === false && (
            <div className="alert alert-warn" style={{ marginBottom: 10 }}>
              El correo todavía no está configurado. Para activarlo hay que cargar los datos del servidor (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) en el backend. Mientras tanto el envío no hace nada.
            </div>
          )}
          {mailConfig === true && <div className="alert alert-ok" style={{ marginBottom: 10 }}>Correo configurado.</div>}
          <button className="btn btn-teal" onClick={enviarResumen} disabled={enviando}>{enviando ? <span className="spin" /> : 'Enviar resumen ahora'}</button>
        </div>
      </div>

      {alta && <FormAlta onClose={() => setAlta(false)} onGuardado={() => { setAlta(false); cargar() }} />}
      {reset && <FormReset usuario={reset} onClose={() => setReset(null)} onListo={() => setReset(null)} />}
    </div>
  )
}

function FormAlta({ onClose, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', email: '', rol: 'despachante', contraseña: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (c, v) => setForm((f) => ({ ...f, [c]: v }))

  async function guardar() {
    setError('')
    if (!form.nombre.trim() || !form.email.trim() || !form.contraseña.trim()) { setError('Completá nombre, email y contraseña.'); return }
    setGuardando(true)
    try { await api('/api/usuarios/registrar', { method: 'POST', body: form }); onGuardado() }
    catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo="Agregar usuario" ancho={520} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Crear'}</button></>}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field"><label>Nombre y apellido *</label><input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} autoFocus /></div>
      <div className="field"><label>Email (usuario para entrar) *</label><input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@defensoria.local" /></div>
      <div className="field"><label>Rol</label>
        <select value={form.rol} onChange={(e) => set('rol', e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}><label>Contraseña inicial *</label><input value={form.contraseña} onChange={(e) => set('contraseña', e.target.value)} placeholder="La persona puede cambiarla después" /></div>
    </Modal>
  )
}

function FormReset({ usuario, onClose, onListo }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (clave.trim().length < 4) { setError('La contraseña debe tener al menos 4 caracteres.'); return }
    setGuardando(true)
    try {
      await api(`/api/usuarios/${usuario.id}/password`, { method: 'POST', body: { contraseña: clave } })
      alert(`Contraseña de ${usuario.nombre} actualizada.`)
      onListo()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo={`Resetear contraseña · ${usuario.nombre}`} ancho={460} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Guardar'}</button></>}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field" style={{ marginBottom: 0 }}><label>Nueva contraseña</label>
        <input value={clave} onChange={(e) => setClave(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && guardar()} />
      </div>
    </Modal>
  )
}

// Modal de "cambiar mi contraseña" — exportado para usar desde el header.
export function CambiarMiClave({ onClose }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (nueva.trim().length < 4) { setError('La nueva contraseña debe tener al menos 4 caracteres.'); return }
    setGuardando(true)
    try {
      await api('/api/usuarios/me/password', { method: 'POST', body: { actual, nueva } })
      alert('Tu contraseña fue cambiada.')
      onClose()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo="Cambiar mi contraseña" ancho={440} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-teal" onClick={guardar} disabled={guardando}>{guardando ? <span className="spin" /> : 'Cambiar'}</button></>}>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="field"><label>Contraseña actual</label><input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>Nueva contraseña</label><input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} /></div>
    </Modal>
  )
}
