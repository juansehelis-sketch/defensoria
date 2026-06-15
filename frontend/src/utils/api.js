/**
 * Capa de acceso a la API.
 * Envuelve fetch agregando el token JWT y manejo de errores.
 * Todas las llamadas usan rutas relativas (/api/...) que Vite redirige al backend.
 */

const TOKEN_KEY = 'defensoria_token'

export function guardarToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function obtenerToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function borrarToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Realiza una petición a la API.
 * @param {string} ruta - ej: '/api/expedientes'
 * @param {object} opciones - { method, body, isForm }
 */
export async function api(ruta, opciones = {}) {
  const { method = 'GET', body, isForm = false, params } = opciones

  // Construir query string si vienen params
  let url = ruta
  if (params) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v)
    })
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const headers = {}
  const token = obtenerToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let cuerpo = undefined
  if (body !== undefined) {
    if (isForm) {
      cuerpo = body // FormData: el navegador pone el Content-Type con boundary
    } else {
      headers['Content-Type'] = 'application/json'
      cuerpo = JSON.stringify(body)
    }
  }

  const resp = await fetch(url, { method, headers, body: cuerpo })

  // 401 → token inválido/expirado: limpiar y forzar re-login
  if (resp.status === 401) {
    borrarToken()
    if (!ruta.includes('/login')) window.location.href = '/login'
  }

  if (!resp.ok) {
    let detalle = `Error ${resp.status}`
    try {
      const data = await resp.json()
      detalle = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch { /* respuesta sin JSON */ }
    throw new Error(detalle)
  }

  // Algunas respuestas (DELETE) pueden no tener cuerpo
  const texto = await resp.text()
  return texto ? JSON.parse(texto) : null
}
