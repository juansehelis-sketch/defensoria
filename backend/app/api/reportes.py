"""
Endpoints de reportes:
- Expedientes por juzgado
- Expedientes sin movimiento en X días
- Intervenciones por despachante
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Expediente, Historial, Usuario

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


@router.get("/por-juzgado")
async def expedientes_por_juzgado(db: Session = Depends(get_db)):
    """Cantidad de expedientes agrupados por juzgado."""
    resultados = (
        db.query(Expediente.juzgado, func.count(Expediente.id))
        .group_by(Expediente.juzgado)
        .order_by(func.count(Expediente.id).desc())
        .all()
    )
    return [{"juzgado": j or "(sin juzgado)", "cantidad": c} for j, c in resultados]


@router.get("/sin-movimiento")
async def expedientes_sin_movimiento(
    dias: int = Query(30, description="Días sin intervención"),
    db: Session = Depends(get_db),
):
    """
    Expedientes activos que no tuvieron ninguna intervención en los últimos X días.
    """
    limite = datetime.now() - timedelta(days=dias)

    expedientes = db.query(Expediente).filter(Expediente.estado == "activo").all()
    sin_movimiento = []

    for exp in expedientes:
        ultima = (
            db.query(func.max(Historial.fecha_creacion))
            .filter(Historial.expediente_id == exp.id)
            .scalar()
        )
        # Sin intervenciones, o la última es anterior al límite
        referencia = ultima or exp.fecha_creacion
        if referencia and referencia < limite:
            sin_movimiento.append({
                "id": exp.id,
                "numero": exp.numero,
                "caratula": exp.caratula,
                "juzgado": exp.juzgado,
                "ultima_intervencion": str(ultima) if ultima else None,
                "dias_sin_movimiento": (datetime.now() - referencia).days,
            })

    sin_movimiento.sort(key=lambda x: x["dias_sin_movimiento"], reverse=True)
    return {"dias_umbral": dias, "total": len(sin_movimiento), "expedientes": sin_movimiento}


@router.get("/intervenciones-por-despachante")
async def intervenciones_por_despachante(
    fecha_inicio: str = Query(None),
    fecha_fin: str = Query(None),
    db: Session = Depends(get_db),
):
    """Cantidad de intervenciones cargadas por cada despachante."""
    query = (
        db.query(Usuario.nombre, func.count(Historial.id))
        .join(Historial, Historial.usuario_id == Usuario.id)
    )

    if fecha_inicio:
        query = query.filter(Historial.fecha_creacion >= fecha_inicio)
    if fecha_fin:
        query = query.filter(Historial.fecha_creacion <= fecha_fin)

    resultados = (
        query.group_by(Usuario.nombre)
        .order_by(func.count(Historial.id).desc())
        .all()
    )
    return [{"despachante": n, "intervenciones": c} for n, c in resultados]
