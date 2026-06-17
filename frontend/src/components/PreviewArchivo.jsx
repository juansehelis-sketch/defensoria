/**
 * Vista previa de un archivo sin descargarlo.
 * - PDF → iframe embebido.
 * - Word (.doc/.docx) → se convierte a HTML en el servidor y se muestra formateado.
 * - Imágenes → se muestran.
 * - Otros → link para abrir.
 */

import { useEffect, useState } from 'react'
import { api, urlArchivo } from '../utils/api'
import Icono from './Icono'

export default function PreviewArchivo({ archivo, alturaPdf = 500, abiertoInicial = true }) {
  // El tipo se detecta desde la URL (siempre tiene la extensión real)
  const ext = ((archivo.url || archivo.nombre || '').split('.').pop() || '').toLowerCase()
  const fileSrc = urlArchivo(archivo.url)
  const esPdf = ext === 'pdf'
  const esDoc = ext === 'doc' || ext === 'docx'
  const esImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)

  const [docHtml, setDocHtml] = useState(null)
  const [cargandoDoc, setCargandoDoc] = useState(false)
  const [errDoc, setErrDoc] = useState('')
  const [abierto, setAbierto] = useState(abiertoInicial)

  useEffect(() => {
    if (!esDoc || !abierto || docHtml !== null) return
    setCargandoDoc(true)
    api('/api/proyectos/preview-docx', { params: { url: archivo.url } })
      .then((d) => setDocHtml(d.html))
      .catch(() => setErrDoc('No se pudo previsualizar el documento.'))
      .finally(() => setCargandoDoc(false))
  }, [archivo.url, esDoc, abierto])

  const iconoNombre = esImg ? 'archivo' : esDoc || esPdf ? 'doc' : 'clip'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ background: '#f7f8fc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: abierto ? '1px solid var(--border)' : 'none' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}><Icono nombre={iconoNombre} size={14} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 5 }} />{archivo.nombre}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setAbierto((v) => !v)}>{abierto ? 'Ocultar' : 'Ver'}</button>
          <a className="btn btn-ghost btn-sm" href={fileSrc} target="_blank" rel="noreferrer">Abrir aparte</a>
        </div>
      </div>
      {abierto && (
        <div style={{ background: '#fff', maxHeight: alturaPdf + 60, overflow: 'auto' }}>
          {esPdf && <iframe src={fileSrc} title={archivo.nombre} style={{ width: '100%', height: alturaPdf, border: 'none', display: 'block' }} />}
          {esImg && <img src={fileSrc} alt={archivo.nombre} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />}
          {esDoc && (
            <div style={{ padding: '16px 22px' }}>
              {cargandoDoc ? <span className="spin" />
                : errDoc ? <div className="muted">{errDoc} <a href={fileSrc} target="_blank" rel="noreferrer">Abrir archivo</a></div>
                : <div style={{ fontSize: 13.5, lineHeight: 1.65, fontFamily: 'Georgia, serif' }} dangerouslySetInnerHTML={{ __html: docHtml || '' }} />}
            </div>
          )}
          {!esPdf && !esImg && !esDoc && (
            <div className="muted" style={{ padding: 14 }}>Vista previa no disponible. <a href={fileSrc} target="_blank" rel="noreferrer">Abrir archivo</a></div>
          )}
        </div>
      )}
    </div>
  )
}
