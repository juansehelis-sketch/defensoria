"""
Buscador global: un solo endpoint que busca en expedientes, personas,
legajos y la biblioteca, para el cuadro de búsqueda del encabezado.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.database import get_db
from app.models import Expediente, Defendido, Legajo, Plantilla, CarpetaModelo

router = APIRouter(prefix="/api/buscar", tags=["buscar"])

VACIO = {"expedientes": [], "personas": [], "legajos": [], "modelos": []}


@router.get("/")
async def buscar_global(q: str = "", db: Session = Depends(get_db)):
    t = (q or "").strip().lower()
    if len(t) < 2:
        return VACIO
    like = f"%{t}%"

    exps = (
        db.query(Expediente)
        .filter(or_(
            func.lower(Expediente.numero).like(like),
            func.lower(func.coalesce(Expediente.caratula, "")).like(like),
        ))
        .order_by(Expediente.numero.asc())
        .limit(8).all()
    )
    expedientes = [{"id": e.id, "numero": e.numero, "caratula": e.caratula} for e in exps]

    defs = (
        db.query(Defendido)
        .filter(or_(
            func.lower(func.coalesce(Defendido.nombre, "")).like(like),
            func.lower(func.coalesce(Defendido.dni, "")).like(like),
        ))
        .limit(8).all()
    )
    personas = [{
        "nombre": d.nombre, "dni": d.dni,
        "expediente_id": d.expediente_id,
        "expediente_numero": d.expediente.numero if d.expediente else None,
    } for d in defs]

    legs = (
        db.query(Legajo)
        .filter(or_(
            func.lower(func.coalesce(Legajo.nombre, "")).like(like),
            func.lower(func.coalesce(Legajo.dni, "")).like(like),
        ))
        .limit(8).all()
    )
    legajos = [{"id": l.id, "nombre": l.nombre, "dni": l.dni} for l in legs]

    plts = (
        db.query(Plantilla, CarpetaModelo.nombre, CarpetaModelo.categoria)
        .join(CarpetaModelo, Plantilla.carpeta_id == CarpetaModelo.id)
        .filter(or_(
            func.lower(Plantilla.nombre).like(like),
            func.lower(func.coalesce(Plantilla.descripcion, "")).like(like),
            func.lower(func.coalesce(Plantilla.etiquetas, "")).like(like),
        ))
        .limit(8).all()
    )
    modelos = [{"id": p.id, "nombre": p.nombre, "carpeta": cn, "categoria": cat} for p, cn, cat in plts]

    return {"expedientes": expedientes, "personas": personas, "legajos": legajos, "modelos": modelos}
