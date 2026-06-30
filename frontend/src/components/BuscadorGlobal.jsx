/**
 * Buscador global del encabezado: busca en expedientes, personas, legajos y
 * la biblioteca a la vez, y lleva directo al resultado.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import Icono from './Icono'

function truncar(s) { return s && s.length > 60 ? s.slice(0, 60) + '…' : (s || '') }

function BItem({ icono, onClick, children }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', padding: '8px 14px', background: h ? 'var(--teal-lt)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 13.5, color: 'var(--text, #1f2430)' }}>
      <Icono nombre={icono} size={14} color="var(--teal)" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </button>
  )
}

function Grupo({ titulo, hay, children }) {
  if (!hay) return null
  return (
    <div style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
      <div className="tl-meta" style={{ padding: '4px 14px' }}>{titulo}</div>
      {children}
    </div>
  )
}

export default function BuscadorGlobal() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const t = (q || '').trim()
    if (t.length < 2) { setRes(null); setCargando(false); return }
    setCargando(true)
    const id = setTimeout(async () => {
      try { setRes(await api('/api/buscar/', { params: { q: t } })); setAbierto(true) }
      catch { setRes(null) } finally { setCargando(false) }
    }, 300)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function ir(url) { setAbierto(false); setQ(''); setRes(null); navigate(url) }

  const total = res ? (res.expedientes.length + res.personas.length + res.legajos.length + res.modelos.length) : 0

  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 1 300px', minWidth: 150 }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <Icono nombre="buscar" size={15} color="rgba(255,255,255,.7)" />
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res && setAbierto(true)}
        placeholder="Buscar en todo..."
        style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 14 }}
      />
      {abierto && q.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.20)', border: '1px solid var(--border)', maxHeight: '70vh', overflowY: 'auto', zIndex: 60 }}>
          {cargando ? (
            <div style={{ padding: 16, textAlign: 'center' }}><span className="spin" /></div>
          ) : total === 0 ? (
            <div className="empty" style={{ padding: 16 }}>Sin resultados para “{q.trim()}”.</div>
          ) : (
            <>
              <Grupo titulo="Expedientes" hay={res.expedientes.length}>
                {res.expedientes.map((e) => (
                  <BItem key={'e' + e.id} icono="expedientes" onClick={() => ir(`/expedientes/${e.id}`)}>
                    <b className="mono">{e.numero}</b>{e.caratula ? ' · ' + truncar(e.caratula) : ''}
                  </BItem>
                ))}
              </Grupo>
              <Grupo titulo="Personas" hay={res.personas.length}>
                {res.personas.map((p, i) => (
                  <BItem key={'p' + i} icono="personas" onClick={() => p.expediente_id && ir(`/expedientes/${p.expediente_id}`)}>
                    {p.nombre}{p.expediente_numero ? ' · ' + p.expediente_numero : ''}
                  </BItem>
                ))}
              </Grupo>
              <Grupo titulo="Legajos" hay={res.legajos.length}>
                {res.legajos.map((l) => (
                  <BItem key={'l' + l.id} icono="personas" onClick={() => ir('/legajos')}>{l.nombre}</BItem>
                ))}
              </Grupo>
              <Grupo titulo="Biblioteca" hay={res.modelos.length}>
                {res.modelos.map((m) => (
                  <BItem key={'m' + m.id} icono="modelos" onClick={() => ir('/modelos')}>
                    {m.nombre} <span className="tl-meta">· {m.carpeta}</span>
                  </BItem>
                ))}
              </Grupo>
            </>
          )}
        </div>
      )}
    </div>
  )
}
