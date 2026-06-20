"""
Agenda personal: cada usuario tiene sus propias tareas (mis tareas).
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Tarea, Usuario
from app.schemas import Tarea as TareaSchema, TareaCreate
from app.utils.deps import obtener_usuario_actual

router = APIRouter(prefix="/api/tareas", tags=["tareas"])

_EDITABLES = {"titulo", "detalle", "fecha_limite", "hecha", "expediente_id"}


@router.get("/", response_model=list[TareaSchema])
async def listar(
    incluir_hechas: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    q = db.query(Tarea).filter(Tarea.usuario_id == usuario.id)
    if not incluir_hechas:
        q = q.filter(Tarea.hecha == False)  # noqa: E712
    # Primero las que tienen fecha (más cercana arriba), después las sin fecha.
    return q.order_by(
        Tarea.hecha.asc(),
        Tarea.fecha_limite.is_(None),
        Tarea.fecha_limite.asc(),
        Tarea.id.desc(),
    ).all()


@router.post("/", response_model=TareaSchema)
async def crear(datos: TareaCreate, db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)):
    tarea = Tarea(usuario_id=usuario.id, **datos.model_dump())
    db.add(tarea)
    db.commit()
    db.refresh(tarea)
    return tarea


@router.put("/{tarea_id}", response_model=TareaSchema)
async def actualizar(tarea_id: int, datos: dict = Body(...), db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)):
    tarea = db.query(Tarea).filter(Tarea.id == tarea_id, Tarea.usuario_id == usuario.id).first()
    if not tarea:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    for campo in _EDITABLES:
        if campo in datos:
            setattr(tarea, campo, datos[campo])
    db.commit()
    db.refresh(tarea)
    return tarea


@router.delete("/{tarea_id}")
async def eliminar(tarea_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)):
    tarea = db.query(Tarea).filter(Tarea.id == tarea_id, Tarea.usuario_id == usuario.id).first()
    if tarea:
        db.delete(tarea)
        db.commit()
    return {"ok": True}
