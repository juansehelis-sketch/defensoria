/**
 * "A la firma" — flujo de trabajo de proyectos (reemplaza el correo).
 *
 * - Despachante: envía proyectos a una secretaria o a la defensora; ve sus enviados.
 * - Secretaria: recibe de despachantes (puede devolver con comentarios, marcar subido
 *   o reenviar a la defensora); además envía sus propios proyectos.
 * - Defensora: recibe los proyectos a la firma (devuelve con comentarios o marca subido).
 *
 * El proyecto de dictamen viaja dentro del sistema: cada uno tiene sus plantillas
 * Word ("Mis plantillas"), redacta sobre una o adjunta un Word, y quien firma lo
 * corrige en la misma hoja, sin descargar. Se baja en Word o PDF cuando se quiera.
 */

import { useEffect, useRef, useState } from 'react'
import { api, obtenerToken, API_BASE } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Icono from '../components/Icono'
import { fechaHora } from '../utils/format'
import Modal from '../components/Modal'
import PreviewArchivo from '../components/PreviewArchivo'
import EditorDocumento, { CambiosDocumento } from '../components/EditorDocumento'
import { confirmar, avisar } from '../ui'

const ESTADO_LABEL = {
  enviado: { txt: 'A la firma · esperando', cls: 'badge-apelacion' },
  en_correccion: { txt: 'Devuelto para corregir', cls: 'badge-archivo' },
  subido: { txt: 'Dictamen subido', cls: 'badge-sentencia' },
}

export default function Proyectos() {
  const { usuario } = useAuth()
  const esDespachante = usuario?.rol === 'despachante'
  const esDefensora = usuario?.rol === 'defensora'

  // Despachante arranca en "enviados"; los demás en "recibidos"
  const [tab, setTab] = useState(esDespachante ? 'enviados' : 'recibidos')
  const [vista, setVista] = useState('tablero')  // tablero (kanban) | lista
  const [recibidos, setRecibidos] = useState([])
  const [enviados, setEnviados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState(null)
  const [mostrarEnviar, setMostrarEnviar] = useState(false)
  const [mostrarPlantillas, setMostrarPlantillas] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const reqs = [api('/api/proyectos/enviados')]
      if (!esDespachante) reqs.push(api('/api/proyectos/recibidos'))
      const [env, rec] = await Promise.all(reqs)
      setEnviados(env)
      setRecibidos(rec || [])
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const lista = tab === 'recibidos' ? recibidos : enviados

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">A la firma</div>
          <div className="page-sub">Envío y seguimiento de proyectos</div>
        </div>
        {!esDefensora && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setMostrarPlantillas(true)}>
              <Icono nombre="doc" size={15} style={{ verticalAlign: '-3px', marginRight: 5 }} />Mis plantillas
            </button>
            <button className="btn btn-teal" onClick={() => setMostrarEnviar(true)}>+ Enviar proyecto</button>
          </div>
        )}
      </div>

      {/* Controles: pestañas (recibidos/enviados) + vista (tablero/lista) */}
      <div className="row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 8 }}>
          {!esDespachante && (
            <>
              <button className={'btn btn-sm ' + (tab === 'recibidos' ? 'btn-navy' : 'btn-ghost')} onClick={() => setTab('recibidos')}>
                Recibidos {recibidos.filter((p) => p.estado === 'enviado').length > 0 && `(${recibidos.filter((p) => p.estado === 'enviado').length})`}
              </button>
              <button className={'btn btn-sm ' + (tab === 'enviados' ? 'btn-navy' : 'btn-ghost')} onClick={() => setTab('enviados')}>Enviados</button>
            </>
          )}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className={'btn btn-sm ' + (vista === 'tablero' ? 'btn-navy' : 'btn-ghost')} onClick={() => setVista('tablero')}>Tablero</button>
          <button className={'btn btn-sm ' + (vista === 'lista' ? 'btn-navy' : 'btn-ghost')} onClick={() => setVista('lista')}>Lista</button>
        </div>
      </div>

      {cargando ? (
        <div className="card"><div className="loading-center"><span className="spin" /></div></div>
      ) : vista === 'tablero' ? (
        <Tablero lista={lista} tab={tab} onAbrir={setSeleccionado} />
      ) : lista.length === 0 ? (
        <div className="card"><div className="empty">{tab === 'recibidos' ? 'No tenés proyectos para revisar.' : 'No enviaste proyectos todavía.'}</div></div>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Expediente</th><th>Título</th>
                  <th>{tab === 'recibidos' ? 'De' : 'Para'}</th>
                  <th>Estado</th><th>Enviado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const est = ESTADO_LABEL[p.estado] || { txt: p.estado, cls: 'badge-archivo' }
                  return (
                    <tr key={p.id} onClick={() => setSeleccionado(p)}>
                      <td className="mono">{p.expediente_numero}</td>
                      <td>{p.titulo}</td>
                      <td>{tab === 'recibidos' ? p.remitente_nombre : p.destinatario_nombre}</td>
                      <td><span className={'badge ' + est.cls}>{est.txt}</span></td>
                      <td className="mono">{fechaHora(p.fecha_envio)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {seleccionado && (
        <DetalleProyecto
          proyecto={seleccionado}
          onClose={() => setSeleccionado(null)}
          onCambio={() => { setSeleccionado(null); cargar() }}
        />
      )}
      {mostrarEnviar && (
        <EnviarProyecto onClose={() => setMostrarEnviar(false)} onEnviado={() => { setMostrarEnviar(false); cargar() }} />
      )}
      {mostrarPlantillas && <MisPlantillas onClose={() => setMostrarPlantillas(false)} />}
    </div>
  )
}

// ── Tablero (kanban) por estado ────────────────────────────────
const COLS_KANBAN = [
  { estado: 'enviado', titulo: 'A la firma · esperando', color: 'var(--amber)' },
  { estado: 'en_correccion', titulo: 'Devuelto para corregir', color: 'var(--muted)' },
  { estado: 'subido', titulo: 'Subido al expediente', color: 'var(--green)' },
]

function Tablero({ lista, tab, onAbrir }) {
  return (
    <div className="kanban">
      {COLS_KANBAN.map((col) => {
        const items = lista.filter((p) => p.estado === col.estado)
        return (
          <div key={col.estado} className="kanban-col">
            <div className="kanban-col-head">
              <span><span style={{ color: col.color }}>●</span> {col.titulo}</span>
              <span className="kanban-count">{items.length}</span>
            </div>
            <div className="kanban-col-body">
              {items.length === 0 ? (
                <div className="kanban-vacio">— sin proyectos —</div>
              ) : items.map((p) => (
                <div key={p.id} className="kanban-card" style={{ borderLeftColor: col.color }} onClick={() => onAbrir(p)}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{p.expediente_numero}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, margin: '3px 0', lineHeight: 1.35 }}>{p.titulo}</div>
                  <div className="tl-meta">{tab === 'recibidos' ? 'De ' + (p.remitente_nombre || '—') : 'Para ' + (p.destinatario_nombre || '—')} · {fechaHora(p.fecha_envio)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Descargar el proyecto en Word o PDF ────────────────────────
function nombreDescarga(p, ext, version) {
  const num = (p.expediente_numero || String(p.id)).replace(/\//g, '-')
  const car = (p.expediente_caratula || '').split(' S/')[0].slice(0, 40)
  const base = `Proyecto ${num}${car ? ' - ' + car : ''}`.replace(/[<>:"/\\|?*\n\r\t]+/g, ' ').trim()
  return base + (version ? ` (versión ${version})` : '') + ext
}

async function descargarProyecto(p, formato, version) {
  try {
    const q = `formato=${formato}` + (version ? `&version=${version}` : '')
    const resp = await fetch(`${API_BASE}/api/proyectos/${p.id}/descargar?${q}`, {
      headers: { Authorization: `Bearer ${obtenerToken()}` },
    })
    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}))
      throw new Error(d.detail || 'No se pudo descargar')
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreDescarga(p, formato === 'pdf' ? '.pdf' : '.docx', version)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch (e) {
    avisar(e.message, 'error')
  }
}

const MOTIVO_VERSION = {
  envio: 'Enviado', correccion: 'Reenviado corregido', devolucion: 'Devuelto', final: 'Versión subida',
}

// ── Detalle de un proyecto + acciones ──────────────────────────
function DetalleProyecto({ proyecto, onClose, onCambio }) {
  const { usuario } = useAuth()
  const [det, setDet] = useState(null)
  const [comentario, setComentario] = useState('')
  const [archivos, setArchivos] = useState([])
  const [dictamenFile, setDictamenFile] = useState(null)
  const [nuevoWord, setNuevoWord] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [guardado, setGuardado] = useState('')  // '' | pendiente | guardando | guardado | error
  const [verCambios, setVerCambios] = useState(null)  // {antes, despues} | null
  const [verVersiones, setVerVersiones] = useState(false)
  const htmlActual = useRef(null)
  const pendiente = useRef(null)
  const timer = useRef(null)

  const p = det || proyecto
  const soyDestinatario = p.destinatario_id === usuario?.id
  const soyRemitente = p.remitente_id === usuario?.id
  const esSecretaria = usuario?.rol === 'secretaria'
  const tieneDoc = !!det?.documento_html
  const editable = tieneDoc && ((soyDestinatario && p.estado === 'enviado') || (soyRemitente && p.estado === 'en_correccion'))

  useEffect(() => {
    api(`/api/proyectos/${proyecto.id}`)
      .then((d) => { setDet(d); htmlActual.current = d.documento_html })
      .catch((e) => setError(e.message))
  }, [proyecto.id])

  // Si se cierra la pestaña con cambios sin guardar, el navegador avisa
  useEffect(() => {
    const aviso = (e) => { if (pendiente.current !== null) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', aviso)
    return () => { window.removeEventListener('beforeunload', aviso); clearTimeout(timer.current) }
  }, [])

  function alCambiar(html) {
    htmlActual.current = html
    pendiente.current = html
    setGuardado('pendiente')
    clearTimeout(timer.current)
    timer.current = setTimeout(guardar, 1200)
  }

  async function guardar() {
    clearTimeout(timer.current)
    const html = pendiente.current
    if (html === null) return true
    pendiente.current = null
    setGuardado('guardando')
    try {
      await api(`/api/proyectos/${proyecto.id}/documento`, { method: 'PUT', body: { html } })
      setGuardado((g) => (pendiente.current === null ? 'guardado' : g))
      return true
    } catch (e) {
      if (pendiente.current === null) pendiente.current = html
      setGuardado('error')
      setError('No se pudieron guardar las correcciones: ' + e.message)
      return false
    }
  }

  async function cerrar() {
    if (pendiente.current !== null) await guardar()
    onClose()
  }

  function ultimaDelDespachante() {
    const vs = (det?.documento_versiones || []).filter((v) => v.autor_id === p.remitente_id && v.motivo !== 'final')
    return vs.length ? vs[vs.length - 1] : null
  }

  function abrirCambios() {
    const antes = ultimaDelDespachante()
    setVerCambios({ antes: antes?.html || '', despues: htmlActual.current || '' })
  }

  async function accion(ruta, { conComentario = false, conArchivos = false, requiereComentario = false, conDictamen = false, conWord = false } = {}) {
    setError('')
    if (requiereComentario && !comentario.trim()) { setError('Escribí un comentario.'); return }
    if (conDictamen && !tieneDoc && !dictamenFile) { setError('Adjuntá el PDF del dictamen subido.'); return }
    setCargando(true)
    try {
      if (!(await guardar())) return
      const fd = new FormData()
      if (conComentario) fd.append('comentario', comentario)
      if (conArchivos) archivos.forEach((a) => fd.append('archivos', a))
      if (conDictamen && dictamenFile) fd.append('dictamen', dictamenFile)
      if (conWord && nuevoWord) fd.append('documento_word', nuevoWord)
      const resp = await fetch(`${API_BASE}/api/proyectos/${proyecto.id}/${ruta}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}` },
        body: fd,
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d.detail || 'Error en la acción')
      }
      onCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const versiones = det?.documento_versiones || []
  const hayCambiosPosibles = tieneDoc && ultimaDelDespachante() && (versiones.length > 1 || editable)

  return (
    <Modal titulo={`Proyecto · ${p.expediente_numero}`} ancho={1000} onClose={cerrar}>
      {error && <div className="alert alert-red">{error}</div>}

      {/* Encabezado del proyecto */}
      <div style={{ background: 'linear-gradient(135deg,var(--navy),var(--navy2))', color: '#fff', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{p.titulo}</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, lineHeight: 1.5 }}>{p.expediente_caratula}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
          De <strong>{p.remitente_nombre}</strong> · Para <strong>{p.destinatario_nombre}</strong> · versión {p.version}
        </div>
        {p.datos && (
          <div style={{ marginTop: 10, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5 }}>
            <Icono nombre="doc" size={13} style={{ verticalAlign: '-2px', marginRight: 5, opacity: .85 }} />{p.datos}
          </div>
        )}
      </div>

      {!det && !error && <div className="loading-center"><span className="spin" /></div>}

      {/* Proyecto de dictamen */}
      {tieneDoc && (
        <div style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 2 }}>Proyecto de dictamen</div>
              <div className="tl-meta">
                {guardado === 'pendiente' || guardado === 'guardando' ? 'Guardando...'
                  : guardado === 'guardado' ? 'Cambios guardados'
                  : guardado === 'error' ? 'Sin guardar'
                  : det.documento_editor ? `Última modificación: ${det.documento_editor}, ${fechaHora(det.documento_actualizado)}` : ''}
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {hayCambiosPosibles && (
                verCambios
                  ? <button className="btn btn-ghost btn-sm" onClick={() => setVerCambios(null)}>Volver al documento</button>
                  : <button className="btn btn-ghost btn-sm" onClick={abrirCambios}>Ver cambios</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={async () => { await guardar(); descargarProyecto(p, 'docx') }}>
                <Icono nombre="exportar" size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Word
              </button>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await guardar(); descargarProyecto(p, 'pdf') }}>
                <Icono nombre="exportar" size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />PDF
              </button>
            </div>
          </div>

          {p.estado === 'subido' && det.corregido_por_firmante !== null && det.corregido_por_firmante !== undefined && (
            <div className={'alert ' + (det.corregido_por_firmante ? 'alert-warn' : 'alert-ok')} style={{ marginBottom: 10 }}>
              {det.corregido_por_firmante
                ? `Se subió con correcciones de ${p.destinatario_nombre}. Este es el proyecto final; con "Ver cambios" se ve qué se modificó.`
                : soyRemitente ? 'Se subió tal cual lo armaste.' : `Se subió tal cual lo armó ${p.remitente_nombre}.`}
            </div>
          )}
          {editable && soyDestinatario && (
            <div className="alert alert-ok" style={{ marginBottom: 10 }}>
              Podés corregir el proyecto directamente en la hoja. Los cambios se guardan solos.
            </div>
          )}
          {editable && soyRemitente && (
            <div className="alert alert-warn" style={{ marginBottom: 10 }}>
              Te lo devolvieron para corregir. Corregilo acá mismo (se guarda solo) y después tocá "Reenviar corregido".
            </div>
          )}

          {verCambios ? (
            <>
              <div className="tl-meta" style={{ marginBottom: 6 }}>
                En verde lo que se agregó y en rojo tachado lo que se sacó, respecto de lo que envió {p.remitente_nombre}.
              </div>
              <CambiosDocumento antes={verCambios.antes} despues={verCambios.despues} />
            </>
          ) : (
            <EditorDocumento key={det.id + '-' + p.estado} inicial={det.documento_html} membrete={det.membrete} editable={editable} onChange={alCambiar} />
          )}

          {versiones.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setVerVersiones((v) => !v)}>
                {verVersiones ? 'Ocultar versiones anteriores' : `Versiones anteriores (${versiones.length})`}
              </button>
              {verVersiones && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6 }}>
                  {versiones.map((v) => (
                    <div key={v.n} className="row" style={{ justifyContent: 'space-between', padding: '7px 11px', borderBottom: '1px solid #edf0f5', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 13 }}>
                        <strong>{v.n}.</strong> {MOTIVO_VERSION[v.motivo] || v.motivo} por {v.autor} · <span className="tl-meta">{fechaHora(v.fecha)}</span>
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => descargarProyecto(p, 'docx', v.n)}>Word</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => descargarProyecto(p, 'pdf', v.n)}>PDF</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Archivos con vista previa */}
      {p.archivos?.length > 0 && (
        <div style={{ margin: '6px 0 14px' }}>
          <div className="card-title" style={{ marginBottom: 8 }}>
            Otros archivos ({p.archivos.length}) — se ven acá, sin descargar
          </div>
          {p.archivos.map((a, i) => <PreviewArchivo key={i} archivo={a} abiertoInicial={!tieneDoc} />)}
        </div>
      )}

      {/* Hilo de comentarios */}
      <div className="card-title" style={{ margin: '12px 0 6px' }}>Conversación</div>
      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
        {(p.comentarios || []).map((c, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #edf0f5' }}>
            <div className="row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 12 }}>{c.autor}</strong>
              <span className="tl-meta">{fechaHora(c.fecha)}</span>
              {c.tipo === 'devolucion' && <span className="badge badge-archivo">devolución</span>}
              {c.tipo === 'subido' && <span className="badge badge-sentencia">subido</span>}
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{c.texto}</div>
          </div>
        ))}
      </div>

      {/* Acciones según rol / estado */}
      {det && p.estado !== 'subido' && (
        <>
          {/* Destinatario: devolver / subir / (secretaria) reenviar a defensora */}
          {soyDestinatario && p.estado === 'enviado' && (
            <div>
              <div className="field">
                <label>Comentario para {p.remitente_nombre}</label>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué hay que corregir..." />
              </div>
              <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" disabled={cargando} onClick={() => accion('devolver', { conComentario: true, requiereComentario: true })}>
                  ↩ Devolver con comentarios{tieneDoc ? ' (para que lo corrija)' : ''}
                </button>
                {esSecretaria && (
                  <button className="btn btn-navy" disabled={cargando} onClick={() => accion('reenviar-a-defensora')}>→ Reenviar a defensora</button>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div className="field">
                  <label>
                    {tieneDoc
                      ? 'Adjuntar el PDF firmado (opcional: si no, queda guardada la versión final del proyecto)'
                      : 'Subir dictamen al expediente — adjuntá el PDF del dictamen subido *'}
                  </label>
                  <input type="file" accept=".pdf" onChange={(e) => setDictamenFile(e.target.files[0])} />
                </div>
                <button className="btn btn-green" disabled={cargando || (!tieneDoc && !dictamenFile)} onClick={() => accion('subido', { conComentario: true, conDictamen: true })}>
                  {cargando ? <span className="spin" /> : '✓ Confirmar: dictamen subido al expediente'}
                </button>
              </div>
            </div>
          )}

          {/* Remitente: reenviar corregido tras devolución */}
          {soyRemitente && p.estado === 'en_correccion' && (
            <div>
              <div className="field">
                <label>Nota de la corrección (opcional)</label>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué corregiste..." />
              </div>
              {tieneDoc ? (
                <div className="field">
                  <label>O reemplazar el proyecto por otro Word (.docx, opcional)</label>
                  <input type="file" accept=".docx" onChange={(e) => setNuevoWord(e.target.files[0] || null)} />
                </div>
              ) : (
                <div className="field">
                  <label>Adjuntar versión corregida (PDF, opcional)</label>
                  <input type="file" accept=".pdf,.doc,.docx" multiple onChange={(e) => setArchivos([...e.target.files])} />
                </div>
              )}
              <button className="btn btn-teal" disabled={cargando} onClick={() => accion('reenviar', { conComentario: true, conArchivos: true, conWord: true })}>
                {cargando ? <span className="spin" /> : '↑ Reenviar corregido'}
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ── Mis plantillas (Word) para los proyectos ───────────────────
function agruparPlantillas(lista) {
  const grupos = {}
  lista.forEach((pl) => {
    const g = pl.categoria || 'Sin categoría'
    ;(grupos[g] = grupos[g] || []).push(pl)
  })
  return Object.entries(grupos).sort(([a], [b]) =>
    a === 'Sin categoría' ? 1 : b === 'Sin categoría' ? -1 : a.localeCompare(b, 'es'))
}

function MisPlantillas({ onClose, onCambio }) {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [archivo, setArchivo] = useState(null)
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)  // {id, nombre, categoria}
  const [viendo, setViendo] = useState(null)      // {id, nombre, html}
  const inputRef = useRef(null)

  async function cargar() {
    try { setLista(await api('/api/proyectos/plantillas')) } catch (e) { setError(e.message) } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  const categorias = [...new Set(lista.map((p) => p.categoria).filter(Boolean))].sort()

  async function subir() {
    setError('')
    if (!archivo) { setError('Elegí el archivo Word.'); return }
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('nombre', nombre)
      fd.append('categoria', categoria)
      await api('/api/proyectos/plantillas', { method: 'POST', body: fd, isForm: true })
      setArchivo(null); setNombre('')
      if (inputRef.current) inputRef.current.value = ''
      avisar('Plantilla agregada')
      await cargar()
      onCambio && onCambio()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubiendo(false)
    }
  }

  async function guardarEdicion() {
    try {
      await api(`/api/proyectos/plantillas/${editando.id}`, { method: 'PUT', body: { nombre: editando.nombre, categoria: editando.categoria } })
      setEditando(null)
      await cargar()
      onCambio && onCambio()
    } catch (e) { avisar(e.message, 'error') }
  }

  async function borrar(pl) {
    if (!(await confirmar({ titulo: 'Borrar plantilla', mensaje: `¿Borrar la plantilla "${pl.nombre}"? Los proyectos ya enviados con ella no se modifican.`, ok: 'Borrar', peligro: true }))) return
    try {
      await api(`/api/proyectos/plantillas/${pl.id}`, { method: 'DELETE' })
      await cargar()
      onCambio && onCambio()
    } catch (e) { avisar(e.message, 'error') }
  }

  async function ver(pl) {
    try {
      const d = await api(`/api/proyectos/plantillas/${pl.id}/html`)
      setViendo({ id: pl.id, nombre: pl.nombre, html: d.html, membrete: d.membrete })
    } catch (e) { avisar(e.message, 'error') }
  }

  return (
    <Modal titulo="Mis plantillas para proyectos" ancho={viendo ? 960 : 720} onClose={onClose}>
      {error && <div className="alert alert-red">{error}</div>}

      {viendo ? (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>{viendo.nombre}</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setViendo(null)}>← Volver a la lista</button>
          </div>
          <EditorDocumento key={viendo.id} inicial={viendo.html} membrete={viendo.membrete} editable={false} />
        </>
      ) : (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 16, background: '#f7f8fc' }}>
            <div className="card-title" style={{ marginBottom: 4 }}>Agregar una plantilla (Word .docx)</div>
            <div className="tl-meta" style={{ marginBottom: 10 }}>
              En el Word podés escribir <strong>@numero</strong>, <strong>@caratula</strong>, <strong>@juzgado</strong>, <strong>@fecha</strong> y <strong>@mes</strong>: al armar el proyecto se completan solos con los datos del expediente y la fecha del día.
            </div>
            <div className="field">
              <input ref={inputRef} type="file" accept=".docx"
                onChange={(e) => { const f = e.target.files[0] || null; setArchivo(f); if (f && !nombre) setNombre(f.name.replace(/\.docx$/i, '')) }} />
            </div>
            <div className="field-row">
              <div className="field"><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Dictamen alimentos" /></div>
              <div className="field">
                <label>Categoría (opcional)</label>
                <input list="categorias-plantillas" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Alimentos, Capacidad..." />
                <datalist id="categorias-plantillas">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <button className="btn btn-teal" disabled={subiendo || !archivo} onClick={subir}>
              {subiendo ? <span className="spin" /> : '+ Agregar plantilla'}
            </button>
          </div>

          {cargando ? <div className="loading-center"><span className="spin" /></div>
            : lista.length === 0 ? <div className="empty">Todavía no cargaste ninguna plantilla.</div>
            : agruparPlantillas(lista).map(([grupo, items]) => (
              <div key={grupo} style={{ marginBottom: 14 }}>
                <div className="card-title" style={{ marginBottom: 6 }}>{grupo}</div>
                {items.map((pl) => (
                  <div key={pl.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 6 }}>
                    {editando?.id === pl.id ? (
                      <div>
                        <div className="field-row">
                          <div className="field"><label>Nombre</label><input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} /></div>
                          <div className="field"><label>Categoría</label><input list="categorias-plantillas" value={editando.categoria || ''} onChange={(e) => setEditando({ ...editando, categoria: e.target.value })} /></div>
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn btn-teal btn-sm" onClick={guardarEdicion}>Guardar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <span>
                          <Icono nombre="doc" size={14} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                          <strong style={{ fontSize: 13.5 }}>{pl.nombre}</strong>
                          {pl.archivo_nombre && <span className="tl-meta" style={{ marginLeft: 6 }}>{pl.archivo_nombre}</span>}
                        </span>
                        <span className="row" style={{ gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => ver(pl)}>Ver</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditando({ id: pl.id, nombre: pl.nombre, categoria: pl.categoria })}>Cambiar nombre</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => borrar(pl)}>Borrar</button>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </>
      )}
    </Modal>
  )
}

// ── Enviar un proyecto nuevo ───────────────────────────────────
function EnviarProyecto({ onClose, onEnviado }) {
  const [busqueda, setBusqueda] = useState('')
  const [expedientes, setExpedientes] = useState([])
  const [expediente, setExpediente] = useState(null)
  const [destinatarios, setDestinatarios] = useState([])
  const [destinatarioId, setDestinatarioId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [datos, setDatos] = useState('')
  const [archivos, setArchivos] = useState([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Proyecto de dictamen: redactado sobre una plantilla, o un Word adjunto
  const [modo, setModo] = useState('plantilla')  // plantilla | word
  const [plantillas, setPlantillas] = useState(null)
  const [plantillaId, setPlantillaId] = useState('')  // '' = sin elegir, 'blanco' = hoja en blanco
  const [docInicial, setDocInicial] = useState(null)
  const [membrete, setMembrete] = useState(null)
  const [cargaDoc, setCargaDoc] = useState(0)
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false)
  const [word, setWord] = useState(null)
  const [mostrarPlantillas, setMostrarPlantillas] = useState(false)
  const docHtml = useRef('')
  const baseUrl = useRef('')  // Word de la plantilla ya completado con los datos del expediente
  const tocado = useRef(false)

  // Cargar posibles destinatarios (secretarias + defensora) y mis plantillas
  useEffect(() => {
    api('/api/usuarios/').then((us) => {
      setDestinatarios(us.filter((u) => u.rol === 'secretaria' || u.rol === 'defensora'))
    }).catch(() => {})
    cargarPlantillas()
  }, [])

  function cargarPlantillas() {
    api('/api/proyectos/plantillas').then(setPlantillas).catch(() => setPlantillas([]))
  }

  // Buscar expedientes (debounce)
  useEffect(() => {
    if (!busqueda.trim()) { setExpedientes([]); return }
    const t = setTimeout(() => {
      api('/api/expedientes/', { params: { busqueda, limit: 15 } }).then(setExpedientes).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda])

  // Arma el proyecto desde la plantilla: los @numero, @caratula, @juzgado,
  // @fecha y @mes vienen ya completados con los datos del expediente.
  async function armar(valor, exp) {
    tocado.current = false
    baseUrl.current = ''
    if (!valor) { setDocInicial(null); setMembrete(null); docHtml.current = ''; return }
    if (valor === 'blanco') {
      setMembrete(null)
      setDocInicial('<p><br></p>'); docHtml.current = '<p><br></p>'; setCargaDoc((n) => n + 1)
      return
    }
    if (!exp) { setError('Primero elegí el expediente.'); return }
    setCargandoPlantilla(true)
    try {
      const d = await api(`/api/proyectos/plantillas/${valor}/armar`, { params: { expediente_id: exp.id } })
      baseUrl.current = d.base_url
      setMembrete(d.membrete)
      setDocInicial(d.html); docHtml.current = d.html; setCargaDoc((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargandoPlantilla(false)
    }
  }

  async function elegirPlantilla(valor) {
    if (valor === plantillaId) return
    if (tocado.current && !(await confirmar({ titulo: 'Cambiar de plantilla', mensaje: 'Se pierde lo que ya escribiste en el proyecto. ¿Cambiar igual?', ok: 'Cambiar' }))) return
    setPlantillaId(valor)
    await armar(valor, expediente)
  }

  async function elegirExpediente(x) {
    if (!titulo || (expediente && titulo === `Proyecto ${expediente.numero}`)) setTitulo(`Proyecto ${x.numero}`)
    // Si ya había una plantilla armada con otro expediente, se vuelve a armar con este
    if (plantillaId && plantillaId !== 'blanco' && expediente?.id !== x.id) {
      if (tocado.current && !(await confirmar({ titulo: 'Cambiar de expediente', mensaje: 'El proyecto se vuelve a armar con los datos del nuevo expediente y se pierde lo que ya escribiste. ¿Seguir?', ok: 'Seguir' }))) return
      setExpediente(x)
      await armar(plantillaId, x)
      return
    }
    setExpediente(x)
  }

  async function cerrar() {
    if ((tocado.current || word) && !(await confirmar({ titulo: 'Salir sin enviar', mensaje: 'El proyecto todavía no se envió. ¿Salir igual? Se pierde lo escrito.', ok: 'Salir', peligro: true }))) return
    onClose()
  }

  async function enviar() {
    setError('')
    if (!expediente) { setError('Elegí un expediente.'); return }
    if (!destinatarioId) { setError('Elegí a quién se lo mandás.'); return }
    if (modo === 'word' && !word) { setError('Adjuntá el Word del proyecto.'); return }
    if (modo === 'plantilla') {
      const texto = new DOMParser().parseFromString(docHtml.current || '', 'text/html').body.textContent.trim()
      if (!plantillaId || !texto) { setError('Redactá el proyecto (elegí una plantilla o una hoja en blanco).'); return }
    }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('expediente_id', expediente.id)
      fd.append('destinatario_id', destinatarioId)
      fd.append('titulo', titulo || `Proyecto ${expediente.numero}`)
      fd.append('datos', datos)
      archivos.forEach((a) => fd.append('archivos', a))
      if (modo === 'word') {
        fd.append('documento_word', word)
      } else {
        fd.append('documento_html', docHtml.current)
        if (plantillaId && plantillaId !== 'blanco') fd.append('plantilla_id', plantillaId)
        if (baseUrl.current) fd.append('documento_base_url', baseUrl.current)
      }
      const resp = await fetch(API_BASE + '/api/proyectos/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obtenerToken()}` },
        body: fd,
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d.detail || 'Error al enviar')
      }
      onEnviado()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const grupos = agruparPlantillas(plantillas || [])

  return (
    <Modal
      titulo="Enviar proyecto a la firma"
      ancho={modo === 'plantilla' && docInicial ? 1000 : 720}
      onClose={cerrar}
      footer={
        <>
          <button className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
          <button className="btn btn-teal" onClick={enviar} disabled={enviando}>{enviando ? <span className="spin" /> : 'Enviar a la firma'}</button>
        </>
      }
    >
      {error && <div className="alert alert-red">{error}</div>}

      {/* Selección de expediente */}
      <div className="field">
        <label>Expediente *</label>
        {expediente ? (
          <div className="row" style={{ justifyContent: 'space-between', background: '#f7f8fc', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 11px' }}>
            <span><span className="mono">{expediente.numero}</span> · {expediente.caratula?.slice(0, 60)}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setExpediente(null); setBusqueda('') }}>Cambiar</button>
          </div>
        ) : (
          <>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por número o carátula..." autoFocus />
            {expedientes.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                {expedientes.map((x) => (
                  <div key={x.id} onClick={() => elegirExpediente(x)}
                    style={{ padding: '8px 11px', borderBottom: '1px solid #edf0f5', cursor: 'pointer', fontSize: 13 }}>
                    <span className="mono">{x.numero}</span> · {x.caratula?.slice(0, 55)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label>Enviar a *</label>
          <select value={destinatarioId} onChange={(e) => setDestinatarioId(e.target.value)}>
            <option value="">— Elegir destinatario —</option>
            {destinatarios.map((d) => <option key={d.id} value={d.id}>{d.nombre} ({d.rol})</option>)}
          </select>
        </div>
        <div className="field"><label>Título</label><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Proyecto de dictamen..." /></div>
      </div>
      <div className="field"><label>Notas para quien firma (opcional)</label><textarea value={datos} onChange={(e) => setDatos(e.target.value)} placeholder="Lo que la secretaria/defensora necesita saber..." style={{ minHeight: 60 }} /></div>

      {/* Proyecto de dictamen */}
      <div className="field">
        <label>Proyecto de dictamen *</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={'btn ' + (modo === 'plantilla' ? 'btn-navy' : 'btn-ghost')} onClick={() => setModo('plantilla')}>
            <Icono nombre="firma" size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />Redactarlo acá sobre una plantilla
          </button>
          <button type="button" className={'btn ' + (modo === 'word' ? 'btn-navy' : 'btn-ghost')} onClick={() => setModo('word')}>
            <Icono nombre="doc" size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />Adjuntar un Word ya redactado
          </button>
        </div>
      </div>

      {modo === 'word' ? (
        <div className="field">
          <label>Archivo Word (.docx)</label>
          <input type="file" accept=".docx" onChange={(e) => setWord(e.target.files[0] || null)} />
          <div className="tl-meta" style={{ marginTop: 4 }}>Quien firma lo va a poder leer y corregir acá mismo, sin descargarlo.</div>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="field" style={{ flex: '1 1 260px', marginBottom: 0 }}>
              <label>Plantilla</label>
              <select value={plantillaId} onChange={(e) => elegirPlantilla(e.target.value)} disabled={plantillas === null || !expediente}>
                <option value="">— Elegir plantilla —</option>
                {grupos.map(([g, items]) => (
                  <optgroup key={g} label={g}>
                    {items.map((pl) => <option key={pl.id} value={pl.id}>{pl.nombre}</option>)}
                  </optgroup>
                ))}
                <option value="blanco">Hoja en blanco</option>
              </select>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setMostrarPlantillas(true)}>Mis plantillas</button>
          </div>
          {!expediente && (
            <div className="tl-meta" style={{ marginTop: -6, marginBottom: 10 }}>Primero elegí el expediente: la plantilla se completa sola con sus datos.</div>
          )}
          {plantillas && plantillas.length === 0 && !docInicial && (
            <div className="alert alert-warn">
              Todavía no cargaste plantillas. Podés subir tus modelos en Word con "Mis plantillas", o empezar con una hoja en blanco.
            </div>
          )}
          {cargandoPlantilla && <div className="loading-center"><span className="spin" /></div>}
          {docInicial && !cargandoPlantilla && (
            <EditorDocumento
              key={cargaDoc}
              inicial={docInicial}
              membrete={membrete}
              onChange={(h) => { docHtml.current = h; tocado.current = true }}
            />
          )}
        </>
      )}

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Otros archivos del expediente (opcional)</label>
        <input type="file" accept=".pdf,.doc,.docx" multiple onChange={(e) => setArchivos([...e.target.files])} />
      </div>

      {mostrarPlantillas && <MisPlantillas onClose={() => setMostrarPlantillas(false)} onCambio={cargarPlantillas} />}
    </Modal>
  )
}
