"""
Modelos / Plantillas: carpetas por tipo de proceso, con sus modelos de documento.
Más adelante se conectarán con formularios que autocompletan los datos del expediente.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pathlib import Path
import io
import uuid

from app.database import get_db
from app.models import CarpetaModelo, Plantilla, Expediente, Usuario
from app.schemas import CarpetaModelo as CarpetaSchema, Plantilla as PlantillaSchema
from app.utils.deps import obtener_usuario_actual
from app.services import storage, plantillas as plantillas_svc

router = APIRouter(prefix="/api/modelos", tags=["modelos"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


# ── Carpetas (tipos de proceso) ────────────────────────────────

@router.get("/carpetas", response_model=list[CarpetaSchema])
async def listar_carpetas(categoria: str = "modelos", db: Session = Depends(get_db)):
    """Lista las carpetas de una biblioteca (modelos / jurisprudencia / doctrina /
    dictamenes), con sus elementos adentro."""
    return (
        db.query(CarpetaModelo)
        .filter(CarpetaModelo.categoria == categoria)
        .order_by(CarpetaModelo.nombre.asc())
        .all()
    )


@router.post("/carpetas", response_model=CarpetaSchema)
async def crear_carpeta(
    datos: dict,
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Crea una carpeta nueva (tipo de proceso o temática) en una biblioteca."""
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Poné un nombre para la carpeta")
    categoria = (datos.get("categoria") or "modelos").strip() or "modelos"
    carpeta = CarpetaModelo(nombre=nombre, categoria=categoria)
    db.add(carpeta)
    db.commit()
    db.refresh(carpeta)
    return carpeta


# ── Variables @ disponibles (para la ayuda del editor) ─────────

@router.get("/variables")
async def listar_variables():
    """Catálogo de variables @ que se pueden usar en los modelos."""
    return [
        {"token": tok, "etiqueta": etq, "grupo": grupo}
        for tok, etq, grupo in plantillas_svc.CATALOGO
    ]


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
        datos_archivo = await archivo.read()
        storage.guardar(nombre_guardado, datos_archivo, archivo.content_type)
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


@router.put("/plantillas/{plantilla_id}", response_model=PlantillaSchema)
async def editar_plantilla(
    plantilla_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Edita el nombre o el texto de un modelo."""
    plantilla = db.query(Plantilla).filter(Plantilla.id == plantilla_id).first()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Modelo no encontrado")
    if datos.get("nombre"):
        plantilla.nombre = datos["nombre"].strip()
    if "contenido" in datos:
        plantilla.contenido = (datos["contenido"] or None)
    db.commit()
    db.refresh(plantilla)
    return plantilla


# ── Armar un escrito (rellenar las @ con datos del expediente) ──

@router.post("/plantillas/{plantilla_id}/armar")
async def armar_escrito(
    plantilla_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """
    Toma un modelo y un expediente, y devuelve el texto con las @variables
    reemplazadas por los datos reales. 'faltantes' lista los datos que no
    estaban cargados (quedan como [completar: ...] en el texto).
    """
    plantilla = db.query(Plantilla).filter(Plantilla.id == plantilla_id).first()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Modelo no encontrado")
    if not (plantilla.contenido or "").strip():
        raise HTTPException(status_code=400, detail="Este modelo no tiene texto con variables")

    exp = db.query(Expediente).filter(Expediente.id == datos.get("expediente_id")).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")

    ctx = plantillas_svc.construir_contexto(db, exp)
    texto, faltantes = plantillas_svc.rellenar(plantilla.contenido or "", ctx)
    return {"texto": texto, "faltantes": faltantes, "plantilla": plantilla.nombre}


@router.post("/exportar-docx")
async def exportar_docx(
    datos: dict = Body(...),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """Convierte un texto (ya armado y editado) en un archivo Word para descargar."""
    from docx import Document

    texto = datos.get("texto") or ""
    nombre = (datos.get("nombre") or "escrito").strip() or "escrito"

    doc = Document()
    for parrafo in texto.split("\n"):
        doc.add_paragraph(parrafo)
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    seguro = "".join(c for c in nombre if c.isalnum() or c in " -_").strip() or "escrito"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{seguro}.docx"'},
    )
