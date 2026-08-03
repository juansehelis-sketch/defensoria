/**
 * Antes de mostrar la app, confirma que el servidor esté despierto.
 * El backend (plan gratuito de Render) se "duerme" si nadie lo usa un rato:
 * el primer ingreso del día puede tardar uno o dos minutos en responder. Sin
 * este aviso esa espera se ve como que la página no anda.
 *
 * Si el servidor ya está despierto (caso normal) responde rápido y este
 * componente no llega a mostrar nada.
 */

import { useEffect, useState } from 'react'
import { API_BASE } from '../utils/api'

const AVISO_TRAS_MS = 1200   // recién se muestra el aviso si tarda más que esto
const REINTENTO_MS = 4000

export default function Arranque({ children }) {
  const [listo, setListo] = useState(false)
  const [tardando, setTardando] = useState(false)

  useEffect(() => {
    let vivo = true
    const avisoTimer = setTimeout(() => { if (vivo) setTardando(true) }, AVISO_TRAS_MS)

    async function intentar() {
      try {
        const r = await fetch(`${API_BASE}/api/health`)
        if (r.ok) {
          if (vivo) { clearTimeout(avisoTimer); setListo(true) }
          return
        }
      } catch { /* el servidor está despertando o no hay red: se reintenta */ }
      if (vivo) setTimeout(intentar, REINTENTO_MS)
    }
    intentar()

    return () => { vivo = false; clearTimeout(avisoTimer) }
  }, [])

  if (listo) return children
  if (!tardando) return null   // arranque normal: no llega a parpadear nada

  return (
    <div className="loading-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: 16 }}>
      <span className="spin" style={{ width: 30, height: 30, borderWidth: 3 }} />
      <div style={{ textAlign: 'center', maxWidth: 320, padding: '0 20px' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
          Iniciando el sistema
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Es el primer ingreso del día: puede tardar uno o dos minutos. No hace falta recargar la página.
        </div>
      </div>
    </div>
  )
}
