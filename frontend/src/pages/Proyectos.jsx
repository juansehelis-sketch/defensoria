/**
 * "A la firma" — flujo de trabajo de proyectos (reemplaza el correo).
 *
 * - Despachante: envía proyectos a una secretaria o a la defensora; ve sus enviados.
 * - Secretaria: recibe de despachantes (puede devolver con comentarios, marcar subido
 *   o reenviar a la defensora); además envía sus propios proyectos.
 * - Defensora: recibe los proyectos a la firma (devuelve con comentarios o marca subido).
 */

import { useEffect, useState } from 'react'
import { api, obtenerToken, API_BASE } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Icono from '../components/Icono'
import { fechaHora } from '../utils/format'
import Modal from '../components/Modal'
import PreviewArchivo from '../components/PreviewArchivo'

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
          <button className="btn btn-teal" onClick={() => setMostrarEnviar(true)}>+ Enviar proyecto</button>
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

// ── Detalle de un proyecto + acciones ──────────────────────────
function DetalleProyecto({ proyecto, onClose, onCambio }) {
  const { usuario } = useAuth()
  const [comentario, setComentario] = useState('')
  const [archivos, setArchivos] = useState([])
  const [dictamenFile, setDictamenFile] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const soyDestinatario = proyecto.destinatario_id === usuario?.id
  const soyRemitente = proyecto.remitente_id === usuario?.id
  const esSecretaria = usuario?.rol === 'secretaria'

  async function accion(ruta, { conComentario = false, conArchivos = false, requiereComentario = false, conDictamen = false } = {}) {
    setError('')
    if (requiereComentario && !comentario.trim()) { setError('Escribí un comentario.'); return }
    if (conDictamen && !dictamenFile) { setError('Adjuntá el PDF del dictamen subido.'); return }
    setCargando(true)
    try {
      const fd = new FormData()
      if (conComentario) fd.append('comentario', comentario)
      if (conArchivos) archivos.forEach((a) => fd.append('archivos', a))
      if (conDictamen) fd.append('dictamen', dictamenFile)
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

  return (
    <Modal titulo={`Proyecto · ${proyecto.expediente_numero}`} ancho={960} onClose={onClose}>
      {error && <div className="alert alert-red">{error}</div>}

      {/* Encabezado del proyecto */}
      <div style={{ background: 'linear-gradient(135deg,var(--navy),var(--navy2))', color: '#fff', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{proyecto.titulo}</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, lineHeight: 1.5 }}>{proyecto.expediente_caratula}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
          De <strong>{proyecto.remitente_nombre}</strong> · Para <strong>{proyecto.destinatario_nombre}</strong> · versión {proyecto.version}
        </div>
        {proyecto.datos && (
          <div style={{ marginTop: 10, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5 }}>
            <Icono nombre="doc" size={13} style={{ verticalAlign: '-2px', marginRight: 5, opacity: .85 }} />{proyecto.datos}
          </div>
        )}
      </div>

      {/* Archivos con vista previa */}
      {proyecto.archivos?.length > 0 && (
        <div style={{ margin: '6px 0 14px' }}>
          <div className="card-title" style={{ marginBottom: 8 }}>
            Archivos del proyecto ({proyecto.archivos.length}) — se ven acá, sin descargar
          </div>
          {proyecto.archivos.map((a, i) => <PreviewArchivo key={i} archivo={a} />)}
        </div>
      )}

      {/* Hilo de comentarios */}
      <div className="card-title" style={{ margin: '12px 0 6px' }}>Conversación</div>
      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
        {(proyecto.comentarios || []).map((c, i) => (
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
      {proyecto.estado !== 'subido' && (
        <>
          {/* Destinatario: devolver / subir / (secretaria) reenviar a defensora */}
          {soyDestinatario && proyecto.estado === 'enviado' && (
            <div>
              <div className="field">
                <label>Comentario (para devolver)</label>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué hay que corregir..." />
              </div>
              <div className="row" style={{ marginBottom: 14 }}>
                <button className="btn btn-ghost" disabled={cargando} onClick={() => accion('devolver', { conComentario: true, requiereComentario: true })}>↩ Devolver con comentarios</button>
                {esSecretaria && (
                  <button className="btn btn-navy" disabled={cargando} onClick={() => accion('reenviar-a-defensora')}>→ Reenviar a defensora</button>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div className="field">
                  <label>Subir dictamen al expediente — adjuntá el PDF del dictamen subido *</label>
                  <input type="file" accept=".pdf" onChange={(e) => setDictamenFile(e.target.files[0])} />
                </div>
                <button className="btn btn-green" disabled={cargando || !dictamenFile} onClick={() => accion('subido', { conComentario: true, conDictamen: true })}>
                  {cargando ? <span className="spin" /> : '✓ Confirmar: dictamen subido al expediente'}
                </button>
              </div>
            </div>
          )}

          {/* Remitente: reenviar corregido tras devolución */}
          {soyRemitente && proyecto.estado === 'en_correccion' && (
            <div>
              <div className="field">
                <label>Nota de la corrección (opcional)</label>
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué corregiste..." />
              </div>
              <div className="field">
                <label>Adjuntar versión corregida (PDF, opcional)</label>
                <input type="file" accept=".pdf,.doc,.docx" multiple onChange={(e) => setArchivos([...e.target.files])} />
              </div>
              <button className="btn btn-teal" disabled={cargando} onClick={() => accion('reenviar', { conComentario: true, conArchivos: true })}>
                {cargando ? <span className="spin" /> : '↑ Reenviar corregido'}
              </button>
            </div>
          )}
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

  // Cargar posibles destinatarios (secretarias + defensora)
  useEffect(() => {
    api('/api/usuarios/').then((us) => {
      setDestinatarios(us.filter((u) => u.rol === 'secretaria' || u.rol === 'defensora'))
    }).catch(() => {})
  }, [])

  // Buscar expedientes (debounce)
  useEffect(() => {
    if (!busqueda.trim()) { setExpedientes([]); return }
    const t = setTimeout(() => {
      api('/api/expedientes/', { params: { busqueda, limit: 15 } }).then(setExpedientes).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda])

  async function enviar() {
    setError('')
    if (!expediente) { setError('Elegí un expediente.'); return }
    if (!destinatarioId) { setError('Elegí a quién se lo mandás.'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('expediente_id', expediente.id)
      fd.append('destinatario_id', destinatarioId)
      fd.append('titulo', titulo || `Proyecto ${expediente.numero}`)
      fd.append('datos', datos)
      archivos.forEach((a) => fd.append('archivos', a))
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

  return (
    <Modal
      titulo="Enviar proyecto a la firma"
      ancho={680}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-teal" onClick={enviar} disabled={enviando}>{enviando ? <span className="spin" /> : 'Enviar'}</button>
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
                  <div key={x.id} onClick={() => { setExpediente(x); if (!titulo) setTitulo(`Proyecto ${x.numero}`) }}
                    style={{ padding: '8px 11px', borderBottom: '1px solid #edf0f5', cursor: 'pointer', fontSize: 13 }}>
                    <span className="mono">{x.numero}</span> · {x.caratula?.slice(0, 55)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="field">
        <label>Enviar a *</label>
        <select value={destinatarioId} onChange={(e) => setDestinatarioId(e.target.value)}>
          <option value="">— Elegir destinatario —</option>
          {destinatarios.map((d) => <option key={d.id} value={d.id}>{d.nombre} ({d.rol})</option>)}
        </select>
      </div>

      <div className="field"><label>Título</label><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Proyecto de dictamen..." /></div>
      <div className="field"><label>Datos / notas del expediente</label><textarea value={datos} onChange={(e) => setDatos(e.target.value)} placeholder="Lo que la secretaria/defensora necesita saber..." /></div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Adjuntar PDFs del expediente</label>
        <input type="file" accept=".pdf,.doc,.docx" multiple onChange={(e) => setArchivos([...e.target.files])} />
      </div>
    </Modal>
  )
}
