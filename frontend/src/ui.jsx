/**
 * Avisos y confirmaciones con el estilo de la app (en vez de los cartelitos
 * grises del navegador).
 *   await confirmar('¿Borrar esto?')  → true / false
 *   avisar('Guardado', 'ok' | 'error')
 * Se usa desde cualquier lado importando estas funciones. <UIHost/> se monta
 * una sola vez en App.
 */

import { useEffect, useState } from 'react'

let _id = 0
const listeners = new Set()
let state = { confirm: null, toasts: [] }
function set(next) { state = next; listeners.forEach((l) => l(state)) }

export function confirmar(opts) {
  const o = typeof opts === 'string' ? { mensaje: opts } : (opts || {})
  return new Promise((resolve) => set({ ...state, confirm: { ...o, resolve } }))
}

export function avisar(mensaje, tipo = 'ok') {
  const id = ++_id
  set({ ...state, toasts: [...state.toasts, { id, mensaje: String(mensaje), tipo }] })
  setTimeout(() => set({ ...state, toasts: state.toasts.filter((t) => t.id !== id) }), tipo === 'error' ? 6500 : 3500)
  return id
}

const COLORES = {
  ok: { bg: '#0f5132', barra: '#22c55e' },
  error: { bg: '#7a1f2b', barra: '#ef4444' },
  info: { bg: 'var(--navy)', barra: 'var(--teal)' },
}

export function UIHost() {
  const [s, setS] = useState(state)
  useEffect(() => { const l = (n) => setS({ ...n }); listeners.add(l); return () => listeners.delete(l) }, [])

  const c = s.confirm
  function cerrar(v) { const r = c?.resolve; set({ ...state, confirm: null }); r && r(v) }

  return (
    <>
      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 4000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
        {s.toasts.map((t) => {
          const col = COLORES[t.tipo] || COLORES.info
          return (
            <div key={t.id} onClick={() => set({ ...state, toasts: state.toasts.filter((x) => x.id !== t.id) })}
              style={{ background: col.bg, color: '#fff', borderLeft: `4px solid ${col.barra}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.22)', padding: '11px 15px', fontSize: 13.5, cursor: 'pointer', animation: 'toastIn .18s ease' }}>
              {t.mensaje}
            </div>
          )
        })}
      </div>

      {/* Confirmación */}
      {c && (
        <div onClick={() => cerrar(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 4100, background: 'rgba(20,20,30,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,.3)', maxWidth: 440, width: '100%', padding: '20px 22px' }}>
            {c.titulo && <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>{c.titulo}</div>}
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text, #1f2430)', whiteSpace: 'pre-line' }}>{c.mensaje}</div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => cerrar(false)}>{c.cancelar || 'Cancelar'}</button>
              <button className={'btn ' + (c.peligro ? 'btn-red' : 'btn-teal')} autoFocus onClick={() => cerrar(true)}>{c.ok || 'Aceptar'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </>
  )
}
