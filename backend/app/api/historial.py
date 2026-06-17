"""
Endpoints del historial (timeline) de cada expediente.
Permite cargar intervenciones y adjuntar archivos.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from pathlib import Path
import shutil
import uuid
from app.database import get_db
from app.models import Historial, Expediente, Usuario, Notificacion
from app.schemas import Historial as HistorialSchema
from app.utils.deps import obtener_usuario_actual
from app.services import storage

router = APIRouter(prefix="/api/historial", tags=["historial"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.get("/expediente/{expediente_id}", response_model=list[HistorialSchema])
async def listar_historial(expediente_id: int, db: Session = Depends(get_db)):
    """Lista las intervenciones de un expediente, de la más nueva a la más vieja."""
    intervenciones = (
        db.query(Historial)
        .filter(Historial.expediente_id == expediente_id)
        .order_by(Historial.fecha_creacion.desc())
        .all()
    )
    return intervenciones


@router.post("/", response_model=HistorialSchema)
async def crear_intervencion(
    expediente_id: int = Form(...),
    tipo: str = Form(...),
    descripcion: str = Form(...),
    archivo: UploadFile = File(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Carga una intervención en el historial de un expediente.
    Acepta un archivo adjunto opcional (PDF/Word).
    """
    expediente = db.query(Expediente).filter(Expediente.id == expediente_id).first()
    if not expediente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expediente no encontrado")

    # Guardar adjunto si vino
    archivo_url = None
    if archivo and archivo.filename:
        # Nombre único para evitar colisiones
        ext = Path(archivo.filename).suffix
        nombre_guardado = f"{uuid.uuid4().hex}{ext}"
        contenido = await archivo.read()
        storage.guardar(nombre_guardado, contenido, archivo.content_type)
        archivo_url = f"/uploads/{nombre_guardado}"

    intervencion = Historial(
        expediente_id=expediente_id,
        tipo=tipo,
        descripcion=descripcion,
        usuario_id=usuario.id,
        archivo_url=archivo_url,
    )
    db.add(intervencion)

    # Marcar el expediente como actualizado y notificar al despachante asignado
    if expediente.despachante_id and expediente.despachante_id != usuario.id:
        db.add(Notificacion(
            usuario_id=expediente.despachante_id,
            tipo="expediente_actualizado",
            contenido=f"El expediente {expediente.numero} fue actualizado por {usuario.nombre}",
            expediente_id=expediente.id,
        ))

    db.commit()
    db.refresh(intervencion)
    return intervencion


@router.delete("/{intervencion_id}")
async def eliminar_intervencion(
    intervencion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Elimina una intervención (solo quien la cargó o un admin)."""
    intervencion = db.query(Historial).filter(Historial.id == intervencion_id).first()
    if not intervencion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intervención no encontrada")

    if intervencion.usuario_id != usuario.id and usuario.rol != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No podés eliminar esta intervención")

    db.delete(intervencion)
    db.commit()
    return {"message": "Intervención eliminada"}
