"""
Modelos / Plantillas: carpetas por tipo de proceso, con sus modelos de documento.
Más adelante se conectarán con formularios que autocompletan los datos del expediente.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pathlib import Path
import shutil
import uuid

from app.database import get_db
from app.models import CarpetaModelo, Plantilla
from app.schemas import CarpetaModelo as CarpetaSchema, Plantilla as PlantillaSchema
from app.utils.deps import obtener_usuario_actual
from app.models import Usuario
from app.services import storage

router = APIRouter(prefix="/api/modelos", tags=["modelos"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


# ── Carpetas (tipos de proceso) ────────────────────────────────

@router.get("/carpetas", response_model=list[CarpetaSchema])
async def listar_carpetas(db: Session = Depends(get_db)):
    """Lista las carpetas con sus modelos adentro."""
    return db.query(CarpetaModelo).order_by(CarpetaModelo.nombre.asc()).all()


@router.post("/carpetas", response_model=CarpetaSchema)
async def crear_carpeta(
    datos: dict,
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Crea una carpeta nueva (tipo de proceso)."""
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Poné un nombre para la carpeta")
    carpeta = CarpetaModelo(nombre=nombre)
    db.add(carpeta)
    db.commit()
    db.refresh(carpeta)
    return carpeta


@router.delete("/carpetas/{carpeta_id}")
async def eliminar_carpeta(
    carpeta_id: int,
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Elimina una carpeta y todos sus modelos."""
    carpeta = db.query(CarpetaModelo).filter(CarpetaModelo.id == carpeta_id).first()
    if carpeta:
        db.delete(carpeta)
        db.commit()
    return {"message": "ok"}


# ── Plantillas (modelos) ───────────────────────────────────────

@router.post("/plantillas", response_model=PlantillaSchema)
async def crear_plantilla(
    carpeta_id: int = Form(...),
    nombre: str = Form(...),
    contenido: str = Form(""),
    archivo: UploadFile = File(None),
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Agrega un modelo a una carpeta (texto y/o archivo adjunto)."""
    carpeta = db.query(CarpetaModelo).filter(CarpetaModelo.id == carpeta_id).first()
    if not carpeta:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada")

    archivo_url = None
    if archivo and archivo.filename:
        ext = Path(archivo.filename).suffix
        nombre_guardado = f"{uuid.uuid4().hex}{ext}"
        contenido = await archivo.read()
        storage.guardar(nombre_guardado, contenido, archivo.content_type)
        archivo_url = f"/uploads/{nombre_guardado}"

    plantilla = Plantilla(
        carpeta_id=carpeta_id,
        nombre=nombre,
        contenido=contenido or None,
        archivo_url=archivo_url,
    )
    db.add(plantilla)
    db.commit()
    db.refresh(plantilla)
    return plantilla


@router.delete("/plantillas/{plantilla_id}")
async def eliminar_plantilla(
    plantilla_id: int,
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Elimina un modelo."""
    plantilla = db.query(Plantilla).filter(Plantilla.id == plantilla_id).first()
    if plantilla:
        db.delete(plantilla)
        db.commit()
    return {"message": "ok"}
