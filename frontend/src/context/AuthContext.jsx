/**
 * Contexto de autenticación.
 * Mantiene el usuario logueado y expone login / logout a toda la app.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { api, guardarToken, borrarToken, obtenerToken } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  // Al montar: si hay token, recuperar el perfil
  useEffect(() => {
    async function cargarPerfil() {
      if (!obtenerToken()) {
        setCargando(false)
        return
      }
      try {
        const perfil = await api('/api/usuarios/me')
        setUsuario(perfil)
      } catch {
        borrarToken()
      } finally {
        setCargando(false)
      }
    }
    cargarPerfil()
  }, [])

  async function login(email, contraseña) {
    const resp = await api('/api/usuarios/login', {
      method: 'POST',
      body: { email, contraseña },
    })
    guardarToken(resp.access_token)
    const perfil = await api('/api/usuarios/me')
    setUsuario(perfil)
    return perfil
  }

  function logout() {
    borrarToken()
    setUsuario(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
