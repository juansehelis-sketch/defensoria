/**
 * Chat interno: mensajes entre integrantes de la defensoría, de a dos o en
 * grupos, con archivos adjuntos. Los mensajes nuevos se traen solos cada
 * pocos segundos.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, urlArchivo } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { confirmar, avisar } from '../ui'
import Modal from '../components/Modal'
import Icono from '../components/Icono'

const REFRESCO_MENSAJES = 3000
const REFRESCO_LISTA = 6000
const EXT_IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']

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
  if (isNaN(d)) return ''
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
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
  return (nombre || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export default function Chat() {
  const { usuario } = useAuth()
  const [params, setParams] = useSearchParams()

  const [conversaciones, setConversaciones] = useState([])
  const [activaId, setActivaId] = useState(Number(params.get('c')) || null)
  const [mensajes, setMensajes] = useState([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [cargandoHilo, setCargandoHilo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [nueva, setNueva] = useState(false)
  const [editarGrupo, setEditarGrupo] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [angosto, setAngosto] = useState(typeof window !== 'undefined' && window.innerWidth < 820)

  const finRef = useRef(null)
  const scrollRef = useRef(null)
  const inputArchivo = useRef(null)
  const activaRef = useRef(activaId)
  const mensajesRef = useRef([])
  activaRef.current = activaId
  mensajesRef.current = mensajes

  const activa = conversaciones.find((c) => c.id === activaId) || null

  useEffect(() => {
    const onResize = () => setAngosto(window.innerWidth < 820)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Lista de conversaciones (se refresca sola) ──
  const cargarLista = useCallback(async () => {
    try {
      const datos = await api('/api/chat/conversaciones')
      setConversaciones(datos)
    } catch (e) {
      /* sin conexión: se reintenta en el próximo ciclo */
    } finally {
      setCargandoLista(false)
    }
  }, [])

  useEffect(() => {
    cargarLista()
    const t = setInterval(cargarLista, REFRESCO_LISTA)
    return () => clearInterval(t)
  }, [cargarLista])

  // ── Mensajes de la conversación abierta ──
  const marcarLeido = useCallback(async (convId, hastaId) => {
    if (!convId || !hastaId) return
    try {
      await api(`/api/chat/conversaciones/${convId}/leido`, { method: 'POST', body: { hasta_id: hastaId } })
      setConversaciones((prev) => prev.map((c) => (c.id === convId ? { ...c, no_leidos: 0 } : c)))
    } catch { /* se reintenta al llegar el próximo mensaje */ }
  }, [])

  useEffect(() => {
    if (!activaId) { setMensajes([]); return }
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
        const ultimo = nuevos[nuevos.length - 1]
        if (ultimo) marcarLeido(activaId, ultimo.id)
      } catch (e) {
        if (primera && vivo) avisar('No se pudieron traer los mensajes', 'error')
      } finally {
        if (vivo && primera) setCargandoHilo(false)
      }
    }

    traer(true)
    const t = setInterval(() => traer(false), REFRESCO_MENSAJES)
    return () => { vivo = false; clearInterval(t) }
  }, [activaId, marcarLeido])

  // Bajar al último mensaje cuando llega uno nuevo
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' })
  }, [mensajes.length, activaId])

  function abrir(id) {
    setActivaId(id)
    setParams(id ? { c: String(id) } : {}, { replace: true })
    setTexto('')
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
    } catch (e) {
      avisar(e.message, 'error')
    } finally {
      setEnviando(false)
    }
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
    } catch (e) {
      avisar(e.message, 'error')
    } finally {
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
      abrir(null)
      cargarLista()
    } catch (e) { avisar(e.message, 'error') }
  }

  // ── Arrastrar y soltar archivos sobre el hilo ──
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

  const lista = conversaciones.filter((c) =>
    !buscar.trim() ? true : (c.titulo || '').toLowerCase().includes(buscar.trim().toLowerCase())
  )
  const mostrarLista = !angosto || !activaId
  const mostrarHilo = !angosto || !!activaId

  return (
    <div
      style={{
        maxWidth: 1300, margin: '0 auto', padding: '18px 20px 20px', boxSizing: 'border-box',
        height: 'calc(100vh - 54px)', display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        className="card"
        style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', marginBottom: 0 }}
      >
        {/* ── Conversaciones ── */}
        {mostrarLista && (
          <div style={{ width: angosto ? '100%' : 300, flexShrink: 0, borderRight: angosto ? 'none' : '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '11px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 7 }}>
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar"
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
              />
              <button className="btn btn-teal btn-sm" onClick={() => setNueva(true)} title="Nueva conversación">
                <Icono nombre="agregar" size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {cargandoLista ? (
                <div className="loading-center"><span className="spin" /></div>
              ) : lista.length === 0 ? (
                <div className="empty" style={{ padding: '30px 16px', fontSize: 13 }}>
                  {buscar ? 'Sin resultados.' : 'Todavía no hay conversaciones.'}
                </div>
              ) : (
                lista.map((c) => {
                  const sel = c.id === activaId
                  return (
                    <div
                      key={c.id}
                      onClick={() => abrir(c.id)}
                      style={{
                        padding: '11px 13px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                        background: sel ? 'var(--teal-lt)' : 'transparent', display: 'flex', gap: 10, alignItems: 'center',
                      }}
                    >
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
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── Hilo ── */}
        {mostrarHilo && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {!activa ? (
              <div className="empty" style={{ margin: 'auto', padding: 30 }}>Elegí una conversación.</div>
            ) : (
              <>
                <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {angosto && (
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(null)} style={{ padding: '5px 8px' }}>
                      <Icono nombre="volver" size={15} />
                    </button>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {activa.titulo}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {activa.tipo === 'grupo'
                        ? activa.miembros.map((m) => m.nombre).join(', ')
                        : (activa.miembros.find((m) => m.id !== usuario?.id)?.cargo || '')}
                    </div>
                  </div>
                  {activa.tipo === 'grupo' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditarGrupo(true)}>Integrantes</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => salirDe(activa)} title={activa.tipo === 'grupo' ? 'Salir del grupo' : 'Borrar conversación'}>
                    <Icono nombre="borrar" size={14} />
                  </button>
                </div>

                <div
                  ref={scrollRef}
                  onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={onDrop}
                  style={{
                    flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px',
                    background: arrastrando ? 'var(--teal-lt)' : 'var(--bg)',
                    outline: arrastrando ? '2px dashed var(--teal)' : 'none', outlineOffset: -6,
                  }}
                >
                  {cargandoHilo ? (
                    <div className="loading-center"><span className="spin" /></div>
                  ) : mensajes.length === 0 ? (
                    <div className="empty" style={{ padding: 24, fontSize: 13 }}>Escribí el primer mensaje.</div>
                  ) : (
                    mensajes.map((m, i) => {
                      const mio = m.autor_id === usuario?.id
                      const prev = mensajes[i - 1]
                      const nuevoDia = !prev || diaDe(prev.fecha_creacion) !== diaDe(m.fecha_creacion)
                      const mismoAutor = prev && prev.autor_id === m.autor_id && !nuevoDia
                      return (
                        <div key={m.id}>
                          {nuevoDia && (
                            <div style={{ textAlign: 'center', margin: '12px 0 14px' }}>
                              <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 99 }}>
                                {diaDe(m.fecha_creacion)}
                              </span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start', marginTop: mismoAutor ? 3 : 9 }}>
                            <div
                              className="chat-burbuja"
                              style={{
                                maxWidth: '72%', minWidth: 90, padding: '8px 11px 6px', borderRadius: 12,
                                background: m.borrado ? 'transparent' : mio ? 'var(--navy)' : 'var(--surface)',
                                color: mio && !m.borrado ? '#fff' : 'var(--text)',
                                border: m.borrado ? '1px dashed var(--border)' : mio ? 'none' : '1px solid var(--border)',
                                position: 'relative',
                              }}
                            >
                              {activa.tipo === 'grupo' && !mio && !mismoAutor && (
                                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', marginBottom: 3 }}>{m.autor_nombre}</div>
                              )}

                              {m.borrado ? (
                                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Mensaje eliminado</div>
                              ) : (
                                <>
                                  {m.archivo_url && (esImagen(m) ? (
                                    <a href={urlArchivo(m.archivo_url)} target="_blank" rel="noreferrer">
                                      <img
                                        src={urlArchivo(m.archivo_url)}
                                        alt={m.archivo_nombre}
                                        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 2 }}
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={urlArchivo(m.archivo_url)}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                                        background: mio ? 'rgba(255,255,255,.14)' : 'var(--teal-lt)',
                                        borderRadius: 8, padding: '8px 10px', marginBottom: m.texto ? 6 : 2,
                                        color: mio ? '#fff' : 'var(--teal)',
                                      }}
                                    >
                                      <Icono nombre="doc" size={18} />
                                      <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, wordBreak: 'break-all' }}>{m.archivo_nombre}</span>
                                        <span style={{ fontSize: 11, opacity: .8 }}>{tamano(m.archivo_tamano)}</span>
                                      </span>
                                    </a>
                                  ))}

                                  {m.texto && (
                                    <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.texto}</div>
                                  )}
                                </>
                              )}

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginTop: 3 }}>
                                {!m.borrado && mio && (
                                  <button
                                    className="chat-borrar"
                                    onClick={() => borrarMensaje(m)}
                                    title="Borrar mensaje"
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0, transition: 'opacity .15s' }}
                                  >
                                    <Icono nombre="borrar" size={12} />
                                  </button>
                                )}
                                <span style={{ fontSize: 10, opacity: mio && !m.borrado ? .75 : .6 }}>{hora(m.fecha_creacion)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={finRef} />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input ref={inputArchivo} type="file" style={{ display: 'none' }} onChange={(e) => enviarArchivo(e.target.files?.[0])} />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => inputArchivo.current?.click()}
                    disabled={enviando}
                    title="Adjuntar un archivo"
                    style={{ padding: '8px 10px' }}
                  >
                    <Icono nombre="clip" size={16} />
                  </button>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onPaste={onPaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() }
                    }}
                    placeholder="Escribí un mensaje"
                    rows={1}
                    style={{
                      flex: 1, resize: 'none', maxHeight: 130, minHeight: 38, padding: '9px 12px',
                      border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit',
                      lineHeight: 1.45, overflowY: 'auto',
                    }}
                    onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 130) + 'px' }}
                  />
                  <button className="btn btn-teal" onClick={enviarTexto} disabled={enviando || !texto.trim()} style={{ padding: '9px 16px' }}>
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {nueva && (
        <NuevaConversacion
          onClose={() => setNueva(false)}
          onCreada={(conv) => {
            setNueva(false)
            setConversaciones((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]))
            abrir(conv.id)
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
    </div>
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

  useEffect(() => {
    api('/api/usuarios/').then(setPersonas).catch(() => {})
  }, [])

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
