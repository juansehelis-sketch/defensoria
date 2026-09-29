/**
 * Aviso al titular del sistema cuando alguien entra con una cuenta de
 * demostración (ej. gente de la DGN) o intenta entrar con un usuario que no
 * existe. El servidor deja una novedad de tipo "ingreso_externo"; acá se
 * consulta cada 30 segundos y, si hay una nueva, se muestra un cartel que queda
 * hasta cerrarlo, con sonido y notificación del navegador.
 * Solo se monta para el titular (ver Layout).
 */

import { useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'

const CLAVE = 'defensoria_ultimo_aviso_ingreso'
const CADA_MS = 30000

function sonar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.18].forEach((d, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = i ? 988 : 740
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d)
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + d + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + d)
      o.stop(ctx.currentTime + d + 0.4)
    })
  } catch { /* sin audio */ }
}

export default function AvisoIngresos() {
  const [avisos, setAvisos] = useState([])
  const ultimo = useRef(null)

  useEffect(() => {
    let vivo = true
    try { ultimo.current = Number(localStorage.getItem(CLAVE)) || null } catch { /* sin almacenamiento */ }
    if ('Notification' in window && Notification.permission === 'default') {
      const pedir = () => { Notification.requestPermission(); window.removeEventListener('click', pedir) }
      window.addEventListener('click', pedir)
    }

    async function revisar() {
      try {
        const lista = await api('/api/panel/notificaciones')
        const ingresos = lista.filter((n) => n.tipo === 'ingreso_externo')
        const max = Math.max(0, ...ingresos.map((n) => n.id))
        if (ultimo.current === null) {
          // primera vez en esta computadora: no se avisa lo viejo
          ultimo.current = max
        } else {
          const nuevos = ingresos.filter((n) => n.id > ultimo.current).reverse()
          if (nuevos.length && vivo) {
            setAvisos((a) => [...a, ...nuevos])
            sonar()
            if ('Notification' in window && Notification.permission === 'granted') {
              nuevos.forEach((n) => {
                try { new Notification('Defensoría · ingreso externo', { body: n.contenido, tag: `ingreso-${n.id}` }) } catch { /* */ }
              })
            }
            ultimo.current = max
          }
        }
        try { localStorage.setItem(CLAVE, String(ultimo.current)) } catch { /* */ }
      } catch { /* sin conexión: se reintenta */ }
    }
    revisar()
    const t = setInterval(revisar, CADA_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  if (!avisos.length) return null
  return (
    <div style={{ position: 'fixed', top: 90, right: 18, zIndex: 3900, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      {avisos.map((n) => (
        <div key={n.id} style={{ background: '#fff', borderLeft: '4px solid var(--teal)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.22)', padding: '12px 14px' }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <strong style={{ color: 'var(--navy)', fontSize: 13.5 }}>Ingreso externo</strong>
            <button className="btn btn-ghost btn-sm" style={{ padding: '0 8px' }} onClick={() => setAvisos((a) => a.filter((x) => x.id !== n.id))}>Cerrar</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: '#2a2a33' }}>{n.contenido}</div>
        </div>
      ))}
    </div>
  )
}
