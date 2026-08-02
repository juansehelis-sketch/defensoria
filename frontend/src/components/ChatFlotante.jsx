/**
 * Chat interno: botón flotante abajo a la derecha, disponible desde cualquier
 * pantalla. Mensajes entre integrantes de la defensoría, de a dos o en grupos,
 * con archivos adjuntos. Cuando llega un mensaje suena un aviso y aparece la
 * notificación del navegador (aunque la app esté en otra pestaña).
 *
 * Dos tamaños: el panel chico de siempre, y una vista grande (botón de
 * agrandar) con las conversaciones a la izquierda y el hilo a la derecha.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { api, urlArchivo } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { confirmar, avisar } from '../ui'
import Modal from './Modal'
import Icono from './Icono'

const REFRESCO_MENSAJES = 3000
const REFRESCO_LISTA = 10000
const EXT_IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
const CLAVE_SONIDO = 'defensoria_chat_sonido'

function esImagen(m) {
  const ext = ((m.archivo_nombre || m.archivo_url || '').split('.').pop() || '').toLowerCase()
  return EXT_IMG.includes(ext)
}

function tamano(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function hora(iso) {
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function diaDe(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const hoy = new Date()
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  const mismo = (a, b) => a.toDateString() === b.toDateString()
  if (mismo(d, hoy)) return 'Hoy'
  if (mismo(d, ayer)) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function iniciales(nombre) {
  return (nombre || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}

/** Aviso sonoro corto (dos notas), sin archivos de audio. */
function sonar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const vol = ctx.createGain()
    vol.connect(ctx.destination)
    vol.gain.setValueAtTime(0.0001, ctx.currentTime)
    vol.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02)
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    ;[[784, 0], [1046.5, 0.11]].forEach(([frec, desde]) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = frec
      osc.connect(vol)
      osc.start(ctx.currentTime + desde)
      osc.stop(ctx.currentTime + desde + 0.1)
    })
    setTimeout(() => ctx.close(), 700)
  } catch { /* si el navegador no deja sonar, queda el aviso visual */ }
}

export default function ChatFlotante() {
  const { usuario } = useAuth()

  const [abierto, setAbierto] = useState(false)
  const [grande, setGrande] = useState(false)
  const [conversaciones, setConversaciones] = useState([])
  const [activaId, setActivaId] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [cargandoHilo, setCargandoHilo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [nueva, setNueva] = useState(false)
  const [editarGrupo, setEditarGrupo] = useState(false)
  const [conSonido, setConSonido] = useState(() => localStorage.getItem(CLAVE_SONIDO) !== 'no')
  const [angosto, setAngosto] = useState(typeof window !== 'undefined' && window.innerWidth < 560)

  const finRef = useRef(null)
  const inputArchivo = useRef(null)
  const activaRef = useRef(null)
  const abiertoRef = useRef(false)
  const mensajesRef = useRef([])
  const marcasRef = useRef(null)     // conversación → id del último mensaje visto
  const sonidoRef = useRef(conSonido)
  const tituloBase = useRef(typeof document !== 'undefined' ? document.title.replace(/^\(\d+\)\s*/, '') : '')
  activaRef.current = activaId
  abiertoRef.current = abierto
  mensajesRef.current = mensajes
  sonidoRef.current = conSonido

  const activa = conversaciones.find((c) => c.id === activaId) || null
  const sinLeer = conversaciones.reduce((t, c) => t + (c.no_leidos || 0), 0)
  // En pantallas chicas el panel ya ocupa casi todo: no hace falta agrandar.
  const enGrande = grande && !angosto

  useEffect(() => {
    const onResize = () => setAngosto(window.innerWidth < 560)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Los mensajes sin leer también se ven en el título de la pestaña.
  useEffect(() => {
    document.title = sinLeer > 0 ? `(${sinLeer}) ${tituloBase.current}` : tituloBase.current
  }, [sinLeer])

  function abrirPanel(convId = null) {
    setAbierto(true)
    if (convId) setActivaId(convId)
    // El permiso de notificaciones se pide con la app abierta por el usuario.
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    } catch { /* navegador sin notificaciones */ }
  }

  function cerrarTodo() {
    setAbierto(false)
    setGrande(false)
  }

  function notificar(conv) {
    if (sonidoRef.current) sonar()
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      // A propósito NO se muestra el texto del mensaje: la pantalla puede estar
      // a la vista de terceros.
      const n = new Notification('Defensoría · mensaje nuevo', {
        body: conv.tipo === 'grupo' ? `${conv.ultimo_autor} escribió en ${conv.titulo}` : `${conv.titulo} te escribió`,
        tag: `chat-${conv.id}`,
        icon: '/logo-mark.png',
      })
      n.onclick = () => { window.focus(); abrirPanel(conv.id); n.close() }
    } catch { /* si falla, quedan el sonido y el número del botón */ }
  }

  // ── Lista de conversaciones: se consulta siempre, con el chat abierto o cerrado ──
  const cargarLista = useCallback(async ({ avisando = false } = {}) => {
    try {
      const datos = await api('/api/chat/conversaciones')
      setConversaciones(datos)

      const previas = marcasRef.current
      if (avisando && previas) {
        datos.forEach((c) => {
          const antes = previas.get(c.id) || 0
          const ahora = c.ultimo_mensaje_id || 0
          if (ahora <= antes || !c.no_leidos) return
          if (c.ultimo_autor_id === usuario?.id) return
          // Si justo estoy mirando esa conversación, no hace falta avisar.
          const mirando = abiertoRef.current && activaRef.current === c.id && document.hasFocus()
          if (!mirando) notificar(c)
        })
      }
      marcasRef.current = new Map(datos.map((c) => [c.id, c.ultimo_mensaje_id || 0]))
    } catch { /* sin conexión: se reintenta en el próximo ciclo */ }
  }, [usuario?.id])

  useEffect(() => {
    if (!usuario) return
    cargarLista()
    const t = setInterval(() => cargarLista({ avisando: true }), REFRESCO_LISTA)
    return () => clearInterval(t)
  }, [usuario?.id, cargarLista])

  // ── Mensajes de la conversación abierta ──
  const marcarLeido = useCallback(async (convId, hastaId) => {
    if (!convId || !hastaId) return
    try {
      await api(`/api/chat/conversaciones/${convId}/leido`, { method: 'POST', body: { hasta_id: hastaId } })
      setConversaciones((prev) => prev.map((c) => (c.id === convId ? { ...c, no_leidos: 0 } : c)))
    } catch { /* se reintenta con el próximo mensaje */ }
  }, [])

  useEffect(() => {
    if (!activaId || !abierto) { setMensajes([]); return }
    let vivo = true
    setCargandoHilo(true)
    setMensajes([])

    async function traer(primera) {
      const desde = primera ? 0 : (mensajesRef.current[mensajesRef.current.length - 1]?.id || 0)
      try {
        const nuevos = await api(`/api/chat/conversaciones/${activaId}/mensajes`, {
          params: desde ? { desde_id: desde } : {},
        })
        if (!vivo || activaRef.current !== activaId) return
        if (primera) {
          setMensajes(nuevos)
        } else if (nuevos.length) {
          setMensajes((prev) => {
            const ids = new Set(prev.map((m) => m.id))
            return [...prev, ...nuevos.filter((m) => !ids.has(m.id))]
          })
        }
        // Al abrir se marca leído; después, solo si la ventana está a la vista
        // (si el usuario se fue a otra ventana, el mensaje tiene que avisar).
        const ultimo = nuevos[nuevos.length - 1]
        if (ultimo && (primera || document.hasFocus())) marcarLeido(activaId, ultimo.id)
      } catch {
        if (primera && vivo) avisar('No se pudieron traer los mensajes', 'error')
      } finally {
        if (vivo && primera) setCargandoHilo(false)
      }
    }

    traer(true)
    const t = setInterval(() => traer(false), REFRESCO_MENSAJES)
    return () => { vivo = false; clearInterval(t) }
  }, [activaId, abierto, marcarLeido])

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }) }, [mensajes.length, activaId, grande])

  // Al volver a la ventana con la conversación abierta, se da por leída.
  useEffect(() => {
    function alVolver() {
      const ultimo = mensajesRef.current[mensajesRef.current.length - 1]
      if (abiertoRef.current && activaRef.current && ultimo) marcarLeido(activaRef.current, ultimo.id)
    }
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [marcarLeido])

  function cambiarSonido() {
    setConSonido((v) => {
      localStorage.setItem(CLAVE_SONIDO, v ? 'no' : 'si')
      return !v
    })
  }

  // ── Enviar ──
  async function enviarTexto() {
    const t = texto.trim()
    if (!t || !activaId || enviando) return
    setEnviando(true)
    try {
      const msg = await api(`/api/chat/conversaciones/${activaId}/mensajes`, { method: 'POST', body: { texto: t } })
      setTexto('')
      setMensajes((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      cargarLista()
    } catch (e) { avisar(e.message, 'error') } finally { setEnviando(false) }
  }

  async function enviarArchivo(archivo) {
    if (!archivo || !activaId) return
    setEnviando(true)
    const fd = new FormData()
    fd.append('archivo', archivo)
    if (texto.trim()) fd.append('texto', texto.trim())
    try {
      const msg = await api(`/api/chat/conversaciones/${activaId}/archivo`, { method: 'POST', body: fd, isForm: true })
      setTexto('')
      setMensajes((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      cargarLista()
    } catch (e) { avisar(e.message, 'error') } finally {
      setEnviando(false)
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }

  async function borrarMensaje(m) {
    if (!(await confirmar({ titulo: 'Borrar mensaje', mensaje: '¿Borrar este mensaje para todos?', ok: 'Borrar', peligro: true }))) return
    try {
      await api(`/api/chat/mensajes/${m.id}`, { method: 'DELETE' })
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, borrado: true, texto: null, archivo_url: null } : x)))
      cargarLista()
    } catch (e) { avisar(e.message, 'error') }
  }

  async function salirDe(conv) {
    const esGrupo = conv.tipo === 'grupo'
    const ok = await confirmar({
      titulo: esGrupo ? 'Salir del grupo' : 'Borrar conversación',
      mensaje: esGrupo ? `¿Salir de "${conv.titulo}"?` : `¿Sacar de tu lista la conversación con ${conv.titulo}?`,
      ok: esGrupo ? 'Salir' : 'Borrar',
      peligro: true,
    })
    if (!ok) return
    try {
      await api(`/api/chat/conversaciones/${conv.id}`, { method: 'DELETE' })
      setActivaId(null)
      cargarLista()
    } catch (e) { avisar(e.message, 'error') }
  }

  function onDrop(e) {
    e.preventDefault()
    setArrastrando(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) enviarArchivo(f)
  }

  // Pegar una captura de pantalla directamente en el mensaje
  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (!item) return
    const f = item.getAsFile()
    if (f) {
      e.preventDefault()
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      enviarArchivo(new File([f], `captura-${Date.now()}.${ext}`, { type: f.type }))
    }
  }

  // ── Partes de la pantalla (se arman igual en el panel chico y en el grande) ──

  const botonBarra = (props) => ({
    background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
    padding: 2, display: 'flex', ...props,
  })

  function verConversaciones() {
    if (conversaciones.length === 0) {
      return (
        <div className="empty" style={{ padding: '34px 18px', fontSize: 13 }}>
          Todavía no hay conversaciones.
          <br />
          <button className="btn btn-teal btn-sm" style={{ marginTop: 12 }} onClick={() => setNueva(true)}>
            <Icono nombre="agregar" size={14} />Empezar una
          </button>
        </div>
      )
    }
    return conversaciones.map((c) => (
      <div key={c.id} onClick={() => setActivaId(c.id)}
        style={{
          padding: '11px 13px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 10, alignItems: 'center',
          background: enGrande && c.id === activaId ? 'var(--teal-lt)' : 'transparent',
        }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: c.tipo === 'grupo' ? 'var(--muted)' : 'var(--navy)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700,
        }}>
          {c.tipo === 'grupo' ? <Icono nombre="personas" size={17} /> : iniciales(c.titulo)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
            <span style={{ fontSize: 13.5, fontWeight: c.no_leidos ? 700 : 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.titulo}
            </span>
            {c.fecha_ultimo_mensaje && (
              <span style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{hora(c.fecha_ultimo_mensaje)}</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: c.no_leidos ? 600 : 400 }}>
              {c.ultimo_autor && c.tipo === 'grupo' ? `${c.ultimo_autor.split(' ')[0]}: ` : ''}{c.ultimo_mensaje}
            </span>
            {c.no_leidos > 0 && (
              <span style={{ background: 'var(--teal)', color: '#fff', borderRadius: 99, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', flexShrink: 0 }}>
                {c.no_leidos}
              </span>
            )}
          </div>
        </div>
      </div>
    ))
  }

  function verMensajes() {
    if (cargandoHilo) return <div className="loading-center" style={{ padding: 30 }}><span className="spin" /></div>
    if (mensajes.length === 0) return <div className="empty" style={{ padding: 22, fontSize: 13 }}>Escribí el primer mensaje.</div>

    return mensajes.map((m, i) => {
      const mio = m.autor_id === usuario.id
      const prev = mensajes[i - 1]
      const nuevoDia = !prev || diaDe(prev.fecha_creacion) !== diaDe(m.fecha_creacion)
      const mismoAutor = prev && prev.autor_id === m.autor_id && !nuevoDia
      return (
        <div key={m.id}>
          {nuevoDia && (
            <div style={{ textAlign: 'center', margin: '10px 0 12px' }}>
              <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10.5, fontWeight: 600, padding: '3px 11px', borderRadius: 99 }}>
                {diaDe(m.fecha_creacion)}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start', marginTop: mismoAutor ? 3 : 8 }}>
            <div className="chat-burbuja" style={{
              maxWidth: enGrande ? '66%' : '84%', minWidth: 84, padding: '7px 10px 5px', borderRadius: 12,
              background: m.borrado ? 'transparent' : mio ? 'var(--navy)' : 'var(--surface)',
              color: mio && !m.borrado ? '#fff' : 'var(--text)',
              border: m.borrado ? '1px dashed var(--border)' : mio ? 'none' : '1px solid var(--border)',
            }}>
              {activa.tipo === 'grupo' && !mio && !mismoAutor && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', marginBottom: 3 }}>{m.autor_nombre}</div>
              )}

              {m.borrado ? (
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Mensaje eliminado</div>
              ) : (
                <>
                  {m.archivo_url && (esImagen(m) ? (
                    <a href={urlArchivo(m.archivo_url)} target="_blank" rel="noreferrer">
                      <img src={urlArchivo(m.archivo_url)} alt={m.archivo_nombre}
                        style={{ maxWidth: '100%', maxHeight: enGrande ? 340 : 230, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 2 }} />
                    </a>
                  ) : (
                    <a href={urlArchivo(m.archivo_url)} target="_blank" rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                        background: mio ? 'rgba(255,255,255,.14)' : 'var(--teal-lt)',
                        borderRadius: 8, padding: '7px 9px', marginBottom: m.texto ? 6 : 2,
                        color: mio ? '#fff' : 'var(--teal)',
                      }}>
                      <Icono nombre="doc" size={17} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>{m.archivo_nombre}</span>
                        <span style={{ fontSize: 10.5, opacity: .8 }}>{tamano(m.archivo_tamano)}</span>
                      </span>
                    </a>
                  ))}

                  {m.texto && (
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.texto}</div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginTop: 2 }}>
                {!m.borrado && mio && (
                  <button className="chat-borrar" onClick={() => borrarMensaje(m)} title="Borrar mensaje"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0, transition: 'opacity .15s' }}>
                    <Icono nombre="borrar" size={11} />
                  </button>
                )}
                <span style={{ fontSize: 9.5, opacity: mio && !m.borrado ? .75 : .6 }}>{hora(m.fecha_creacion)}</span>
              </div>
            </div>
          </div>
        </div>
      )
    })
  }

  /** Hilo completo: mensajes + caja para escribir. */
  function verHilo() {
    return (
      <>
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          style={{
            flex: 1, overflowY: 'auto', minHeight: 0, padding: enGrande ? '16px 20px' : '12px 13px',
            background: arrastrando ? 'var(--teal-lt)' : 'var(--bg)',
            outline: arrastrando ? '2px dashed var(--teal)' : 'none', outlineOffset: -5,
          }}
        >
          {verMensajes()}
          <div ref={finRef} />
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: enGrande ? '10px 14px' : '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          <input ref={inputArchivo} type="file" style={{ display: 'none' }} onChange={(e) => enviarArchivo(e.target.files?.[0])} />
          <button className="btn btn-ghost btn-sm" onClick={() => inputArchivo.current?.click()} disabled={enviando}
            title="Adjuntar un archivo" style={{ padding: '7px 9px' }}>
            <Icono nombre="clip" size={15} />
          </button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() } }}
            placeholder="Escribí un mensaje"
            rows={1}
            style={{
              flex: 1, resize: 'none', maxHeight: enGrande ? 150 : 110, minHeight: 36, padding: '8px 11px',
              border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
              lineHeight: 1.45, overflowY: 'auto',
            }}
            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, enGrande ? 150 : 110) + 'px' }}
          />
          <button className="btn btn-teal btn-sm" onClick={enviarTexto} disabled={enviando || !texto.trim()} style={{ padding: '9px 13px' }}>
            Enviar
          </button>
        </div>
      </>
    )
  }

  /** Datos de la conversación (nombre e integrantes) para el encabezado. */
  const subtituloActiva = activa && (activa.tipo === 'grupo'
    ? activa.miembros.map((m) => m.nombre).join(', ')
    : (activa.miembros.find((m) => m.id !== usuario?.id)?.cargo || ''))

  const botonesDeLaConversacion = (color) => activa && (
    <>
      {activa.tipo === 'grupo' && (
        <button onClick={() => setEditarGrupo(true)} title="Integrantes del grupo"
          style={{ background: 'none', border: 'none', color, cursor: 'pointer', padding: 2, display: 'flex' }}>
          <Icono nombre="personas" size={16} />
        </button>
      )}
      <button onClick={() => salirDe(activa)} title={activa.tipo === 'grupo' ? 'Salir del grupo' : 'Borrar conversación'}
        style={{ background: 'none', border: 'none', color, cursor: 'pointer', padding: 2, display: 'flex' }}>
        <Icono nombre="borrar" size={15} />
      </button>
    </>
  )

  if (!usuario) return null

  const anchoPanel = angosto ? 'calc(100vw - 24px)' : 384
  const altoPanel = angosto ? 'calc(100vh - 130px)' : 'min(620px, calc(100vh - 150px))'

  return (
    <>
      {/* Botón flotante */}
      {!enGrande && (
        <button
          onClick={() => (abierto ? cerrarTodo() : abrirPanel())}
          title={abierto ? 'Cerrar el chat' : 'Chat del equipo'}
          style={{
            position: 'fixed', right: 22, bottom: 22, zIndex: 400,
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'var(--navy)', color: '#fff',
            boxShadow: '0 8px 22px rgba(0,0,0,.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icono nombre={abierto ? 'cerrar' : 'chat'} size={24} strokeWidth={2} />
          {!abierto && sinLeer > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -2, minWidth: 22, height: 22, borderRadius: 99,
              background: 'var(--red, #d64545)', color: '#fff', fontSize: 11.5, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
              border: '2px solid #fff',
            }}>
              {sinLeer > 99 ? '99+' : sinLeer}
            </span>
          )}
        </button>
      )}

      {/* Panel chico */}
      {abierto && !enGrande && (
        <div style={{
          position: 'fixed', right: angosto ? 12 : 22, bottom: 88, zIndex: 400,
          width: anchoPanel, height: altoPanel,
          background: 'var(--surface)', borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,.3)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ background: 'var(--navy3, var(--navy))', color: '#fff', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {activa && (
              <button onClick={() => setActivaId(null)} title="Volver a las conversaciones" style={botonBarra()}>
                <Icono nombre="volver" size={17} />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activa ? activa.titulo : 'Mensajes'}
              </div>
              {activa && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {subtituloActiva}
                </div>
              )}
            </div>

            {activa ? botonesDeLaConversacion('#fff') : (
              <>
                <button onClick={cambiarSonido} title={conSonido ? 'Silenciar el aviso' : 'Activar el aviso sonoro'}
                  style={botonBarra({ opacity: conSonido ? 1 : .55 })}>
                  <Icono nombre={conSonido ? 'campana' : 'campanaMuda'} size={16} />
                </button>
                <button onClick={() => setNueva(true)} title="Nueva conversación" style={botonBarra()}>
                  <Icono nombre="agregar" size={18} />
                </button>
              </>
            )}
            {!angosto && (
              <button onClick={() => setGrande(true)} title="Ver en grande" style={botonBarra()}>
                <Icono nombre="agrandar" size={15} />
              </button>
            )}
            <button onClick={cerrarTodo} title="Cerrar" style={botonBarra()}>
              <Icono nombre="cerrar" size={16} />
            </button>
          </div>

          {!activa ? (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{verConversaciones()}</div>
          ) : verHilo()}
        </div>
      )}

      {/* Vista grande: conversaciones a la izquierda, hilo a la derecha */}
      {abierto && enGrande && (
        <div
          onClick={() => setGrande(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(20,20,30,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1120px, 100%)', height: 'min(760px, calc(100vh - 52px))',
              background: 'var(--surface)', borderRadius: 14, overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,.34)', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ background: 'var(--navy3, var(--navy))', color: '#fff', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Mensajes</div>
              <button onClick={cambiarSonido} title={conSonido ? 'Silenciar el aviso' : 'Activar el aviso sonoro'}
                style={botonBarra({ opacity: conSonido ? 1 : .55 })}>
                <Icono nombre={conSonido ? 'campana' : 'campanaMuda'} size={17} />
              </button>
              <button onClick={() => setNueva(true)} title="Nueva conversación" style={botonBarra()}>
                <Icono nombre="agregar" size={19} />
              </button>
              <button onClick={() => setGrande(false)} title="Volver al tamaño chico" style={botonBarra()}>
                <Icono nombre="achicar" size={16} />
              </button>
              <button onClick={cerrarTodo} title="Cerrar" style={botonBarra()}>
                <Icono nombre="cerrar" size={17} />
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                {verConversaciones()}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                {!activa ? (
                  <div className="empty" style={{ margin: 'auto', padding: 30 }}>Elegí una conversación.</div>
                ) : (
                  <>
                    <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {activa.titulo}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {subtituloActiva}
                        </div>
                      </div>
                      {botonesDeLaConversacion('var(--muted)')}
                    </div>
                    {verHilo()}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {nueva && (
        <NuevaConversacion
          onClose={() => setNueva(false)}
          onCreada={(conv) => {
            setNueva(false)
            setConversaciones((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]))
            setActivaId(conv.id)
            cargarLista()
          }}
        />
      )}

      {editarGrupo && activa && (
        <EditarGrupo
          conversacion={activa}
          onClose={() => setEditarGrupo(false)}
          onGuardado={() => { setEditarGrupo(false); cargarLista() }}
        />
      )}

      <style>{`.chat-burbuja:hover .chat-borrar { opacity: .7; }`}</style>
    </>
  )
}


/** Modal para abrir una conversación de a dos o armar un grupo. */
function NuevaConversacion({ onClose, onCreada }) {
  const { usuario } = useAuth()
  const [personas, setPersonas] = useState([])
  const [modoGrupo, setModoGrupo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [elegidos, setElegidos] = useState([])
  const [filtro, setFiltro] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api('/api/usuarios/')
      .then((us) => setPersonas(us.filter((u) => u.id !== usuario?.id)))
      .catch(() => avisar('No se pudo traer la lista de personas', 'error'))
  }, [usuario?.id])

  const visibles = personas.filter((p) =>
    !filtro.trim() ? true : (p.nombre || '').toLowerCase().includes(filtro.trim().toLowerCase())
  )

  async function abrirDirecto(p) {
    setGuardando(true)
    try { onCreada(await api('/api/chat/directo', { method: 'POST', body: { usuario_id: p.id } })) }
    catch (e) { avisar(e.message, 'error'); setGuardando(false) }
  }

  async function crearGrupo() {
    setGuardando(true)
    try { onCreada(await api('/api/chat/grupos', { method: 'POST', body: { nombre, miembros: elegidos } })) }
    catch (e) { avisar(e.message, 'error'); setGuardando(false) }
  }

  return (
    <Modal
      titulo={modoGrupo ? 'Nuevo grupo' : 'Nueva conversación'}
      onClose={onClose}
      ancho={480}
      footer={
        modoGrupo ? (
          <>
            <button className="btn btn-ghost" onClick={() => setModoGrupo(false)}>Volver</button>
            <button className="btn btn-teal" onClick={crearGrupo} disabled={guardando || !nombre.trim() || elegidos.length === 0}>
              Crear grupo
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setModoGrupo(true)}>Armar un grupo</button>
        )
      }
    >
      {modoGrupo && (
        <div className="field">
          <label>Nombre del grupo</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Equipo de despacho" autoFocus />
        </div>
      )}

      <div className="field">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar persona" />
      </div>

      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        {visibles.length === 0 ? (
          <div className="empty" style={{ padding: 20, fontSize: 13 }}>Sin resultados.</div>
        ) : (
          visibles.map((p) => {
            const marcado = elegidos.includes(p.id)
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (guardando) return
                  if (modoGrupo) setElegidos((prev) => (marcado ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                  else abrirDirecto(p)
                }}
                style={{
                  padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid var(--border)', background: marcado ? 'var(--teal-lt)' : 'transparent',
                }}
              >
                {modoGrupo && (
                  <input type="checkbox" checked={marcado} readOnly style={{ width: 15, height: 15, accentColor: 'var(--teal)' }} />
                )}
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {iniciales(p.nombre)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)' }}>{p.nombre}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.cargo || p.rol}</div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}


/** Modal para cambiar el nombre del grupo y quiénes lo integran. */
function EditarGrupo({ conversacion, onClose, onGuardado }) {
  const { usuario } = useAuth()
  const [personas, setPersonas] = useState([])
  const [nombre, setNombre] = useState(conversacion.nombre || '')
  const [elegidos, setElegidos] = useState(conversacion.miembros.map((m) => m.id))
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { api('/api/usuarios/').then(setPersonas).catch(() => {}) }, [])

  async function guardar() {
    setGuardando(true)
    try {
      await api(`/api/chat/grupos/${conversacion.id}`, { method: 'PUT', body: { nombre, miembros: elegidos } })
      onGuardado()
    } catch (e) { avisar(e.message, 'error'); setGuardando(false) }
  }

  return (
    <Modal
      titulo="Integrantes del grupo"
      onClose={onClose}
      ancho={460}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-teal" onClick={guardar} disabled={guardando || !nombre.trim()}>Guardar</button>
        </>
      }
    >
      <div className="field">
        <label>Nombre del grupo</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        {personas.map((p) => {
          const marcado = elegidos.includes(p.id)
          const soyYo = p.id === usuario?.id
          return (
            <div
              key={p.id}
              onClick={() => { if (!soyYo) setElegidos((prev) => (marcado ? prev.filter((x) => x !== p.id) : [...prev, p.id])) }}
              style={{
                padding: '9px 12px', cursor: soyYo ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid var(--border)', background: marcado ? 'var(--teal-lt)' : 'transparent', opacity: soyYo ? .6 : 1,
              }}
            >
              <input type="checkbox" checked={marcado} readOnly disabled={soyYo} style={{ width: 15, height: 15, accentColor: 'var(--teal)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)' }}>{p.nombre}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.cargo || p.rol}</div>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
