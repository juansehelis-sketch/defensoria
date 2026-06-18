/**
 * Desde un expediente: elegís un modelo (de la biblioteca de Modelos) y se
 * arma el escrito con los datos de ESE expediente.
 */
import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import Modal from './Modal'
import ArmarEscrito from './ArmarEscrito'
import Icono from './Icono'

export default function ArmarDesdeExpediente({ expedienteId, onClose }) {
  const [carpetas, setCarpetas] = useState(null)
  const [elegida, setElegida] = useState(null)

  useEffect(() => {
    api('/api/modelos/carpetas', { params: { categoria: 'modelos' } })
      .then(setCarpetas).catch(() => setCarpetas([]))
  }, [])

  if (elegida) return <ArmarEscrito plantilla={elegida} expedienteId={expedienteId} onClose={onClose} />

  const conModelos = (carpetas || []).filter((c) => c.plantillas.some((p) => p.contenido))

  return (
    <Modal titulo="Armar escrito · elegí un modelo" ancho={620} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cancelar</button>}>
      {carpetas === null ? (
        <div className="loading-center"><span className="spin" /></div>
      ) : !conModelos.length ? (
        <div className="empty">No hay modelos con texto cargados todavía.<br />Cargalos en la solapa <strong>Modelos</strong> (con variables @).</div>
      ) : (
        conModelos.map((c) => (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 8 }}><Icono nombre="archivo" size={14} color="var(--teal)" /> {c.nombre}</div>
            {c.plantillas.filter((p) => p.contenido).map((p) => (
              <div key={p.id} className="row" style={{ justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', marginBottom: 6 }}>
                <span style={{ minWidth: 0 }}><Icono nombre="doc" size={14} color="var(--teal)" style={{ verticalAlign: '-2px', marginRight: 6 }} />{p.nombre}</span>
                <button className="btn btn-teal btn-sm" onClick={() => setElegida(p)}>Usar</button>
              </div>
            ))}
          </div>
        ))
      )}
    </Modal>
  )
}
