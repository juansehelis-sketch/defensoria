"""
Mapa de instituciones: lugares (hospitales, hogares, salud mental, etc.) donde
hay personas internadas. ABM simple con coordenadas para el mapa del frontend.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import LugarMapa, Usuario
from app.utils.deps import obtener_usuario_actual

router = APIRouter(prefix="/api/mapa", tags=["mapa"])


def _dump(l: LugarMapa) -> dict:
    return {
        "id": l.id, "nombre": l.nombre, "tipo": l.tipo,
        "direccion": l.direccion, "telefono": l.telefono,
        "observaciones": l.observaciones, "lat": l.lat, "lng": l.lng,
    }


@router.get("/lugares")
async def listar(db: Session = Depends(get_db)):
    return [_dump(l) for l in db.query(LugarMapa).order_by(LugarMapa.nombre.asc()).all()]


@router.post("/lugares")
async def crear(datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    if not (datos.get("nombre") or "").strip():
        raise HTTPException(status_code=400, detail="Falta el nombre del lugar.")
    if datos.get("lat") is None or datos.get("lng") is None:
        raise HTTPException(status_code=400, detail="Falta marcar la ubicación en el mapa.")
    l = LugarMapa(
        nombre=datos["nombre"].strip(),
        tipo=(datos.get("tipo") or "otro"),
        direccion=(datos.get("direccion") or "").strip() or None,
        telefono=(datos.get("telefono") or "").strip() or None,
        observaciones=(datos.get("observaciones") or "").strip() or None,
        lat=float(datos["lat"]),
        lng=float(datos["lng"]),
    )
    db.add(l)
    db.commit()
    db.refresh(l)
    return _dump(l)


@router.put("/lugares/{lugar_id}")
async def editar(lugar_id: int, datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    l = db.query(LugarMapa).filter(LugarMapa.id == lugar_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Lugar no encontrado")
    if "nombre" in datos and (datos["nombre"] or "").strip():
        l.nombre = datos["nombre"].strip()
    if "tipo" in datos:
        l.tipo = datos["tipo"] or "otro"
    for campo in ("direccion", "telefono", "observaciones"):
        if campo in datos:
            setattr(l, campo, (datos[campo] or "").strip() or None)
    if datos.get("lat") is not None:
        l.lat = float(datos["lat"])
    if datos.get("lng") is not None:
        l.lng = float(datos["lng"])
    db.commit()
    db.refresh(l)
    return _dump(l)


@router.delete("/lugares/{lugar_id}")
async def borrar(lugar_id: int, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    l = db.query(LugarMapa).filter(LugarMapa.id == lugar_id).first()
    if l:
        db.delete(l)
        db.commit()
    return {"ok": True}
