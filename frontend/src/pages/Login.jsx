/**
 * Pantalla de login.
 */

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Icono from '../components/Icono'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [contraseña, setContraseña] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function manejarSubmit(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(email.trim(), contraseña)
      // El redirect lo maneja App al detectar usuario logueado
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={manejarSubmit}>
        <div className="login-logo">
          <img src="/logo.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg' }} alt="Ministerio Público de la Defensa" style={{ height: 64, width: 'auto' }} />
        </div>
        <div className="login-title">Ministerio Público de la Defensa</div>
        <div className="login-sub">Defensoría de Menores N° 6 · Gestión de expedientes</div>

        {error && <div className="alert alert-red" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="field">
          <label>Usuario (email)</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@defensoria.local"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            value={contraseña}
            onChange={(e) => setContraseña(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button className="btn btn-teal" type="submit" disabled={cargando} style={{ width: '100%', marginTop: 8 }}>
          {cargando ? <span className="spin" /> : 'Ingresar'}
        </button>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 18, lineHeight: 1.7 }}>
          <Icono nombre="candado" size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />Todo corre en la red local.<br />Ningún dato sale a servicios externos.
        </p>
      </form>
    </div>
  )
}
