/**
 * Pantalla de cambio de contraseña obligatorio.
 * Aparece cuando el usuario entró con su contraseña de siempre pero el
 * administrador reinició las claves del equipo (o le asignó una provisoria):
 * antes de usar la app tiene que elegir una contraseña propia.
 */

import { useState } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Icono from '../components/Icono'

export default function ClaveNueva() {
  const { usuario, refrescarUsuario, logout } = useAuth()
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function manejarSubmit(e) {
    e.preventDefault()
    setError('')
    if (nueva.trim().length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.')
      return
    }
    if (nueva !== repetir) {
      setError('Las contraseñas no coinciden. Escribí la misma en los dos casilleros.')
      return
    }
    setGuardando(true)
    try {
      await api('/api/usuarios/me/clave-inicial', { method: 'POST', body: { nueva } })
      await refrescarUsuario()
      // Al refrescar, debe_cambiar_clave queda en false y App muestra la app normal.
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={manejarSubmit}>
        <div className="login-logo">
          <img src="/logo.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg' }} alt="Ministerio Público de la Defensa" style={{ height: 64, width: 'auto' }} />
        </div>
        <div className="login-title">Hola, {usuario?.nombre}</div>
        <div className="login-sub">Antes de seguir, elegí tu contraseña nueva.<br />Es la que vas a usar cada vez que entres.</div>

        {error && <div className="alert alert-red" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="field">
          <label>Contraseña nueva</label>
          <input
            type="password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Mínimo 4 caracteres"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Repetila (para confirmar)</label>
          <input
            type="password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            placeholder="La misma de arriba"
          />
        </div>

        <button className="btn btn-teal" type="submit" disabled={guardando} style={{ width: '100%', marginTop: 8 }}>
          {guardando ? <span className="spin" /> : 'Guardar y entrar'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 18 }}>
          <Icono nombre="candado" size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />
          ¿No sos {usuario?.nombre}?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); logout() }} style={{ color: 'var(--teal)' }}>Salir</a>
        </p>
      </form>
    </div>
  )
}
