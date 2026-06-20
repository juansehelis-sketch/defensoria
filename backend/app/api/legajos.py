"""
Legajos por persona: agrupan todos los expedientes/conexos de un NNA.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Legajo, Expediente, EntradaSalida, Usuario
from app.schemas import Legajo as LegajoSchema, LegajoCreate
from app.utils.deps import obtener_usuario_actual
from app.services import legajos as legajos_svc

router = APIRouter(prefix="/api/legajos", tags=["legajos"])


@router.get("/", response_model=list[LegajoSchema])
async def listar(buscar: str = None, db: Session = Depends(get_db)):
    q = db.query(Legajo)
    if buscar:
        q = q.filter(Legajo.nombre.ilike(f"%{buscar}%"))
    return q.order_by(Legajo.nombre.asc()).all()


@router.post("/", response_model=LegajoSchema)
async def crear(datos: LegajoCreate, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    legajo = Legajo(**datos.model_dump())
    db.add(legajo)
    db.commit()
    db.refresh(legajo)
    return legajo


@router.get("/{legajo_id}", response_model=LegajoSchema)
async def obtener(legajo_id: int, db: Session = Depends(get_db)):
    legajo = db.query(Legajo).filter(Legajo.id == legajo_id).first()
    if not legajo:
        raise HTTPException(status_code=404, detail="Legajo no encontrado")
    return legajo


@router.put("/{legajo_id}", response_model=LegajoSchema)
async def actualizar(legajo_id: int, datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    legajo = db.query(Legajo).filter(Legajo.id == legajo_id).first()
    if not legajo:
        raise HTTPException(status_code=404, detail="Legajo no encontrado")
    for campo in ("nombre", "dni", "fecha_nacimiento", "observaciones", "numeros"):
        if campo in datos:
            setattr(legajo, campo, datos[campo])
    db.commit()
    db.refresh(legajo)
    return legajo


@router.delete("/{legajo_id}")
async def eliminar(legajo_id: int, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    legajo = db.query(Legajo).filter(Legajo.id == legajo_id).first()
    if legajo:
        for e in legajo.expedientes:
            e.legajo_id = None
        db.delete(legajo)
        db.commit()
    return {"ok": True}


@router.post("/{legajo_id}/numeros")
async def agregar_numero(legajo_id: int, datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    legajo = db.query(Legajo).filter(Legajo.id == legajo_id).first()
    if not legajo:
        raise HTTPException(status_code=404, detail="Legajo no encontrado")
    if legajos_svc.agregar_numeros(legajo, [datos.get("numero", "")]):
        db.commit()
    return {"numeros": legajo.numeros or []}


@router.delete("/{legajo_id}/numeros/{numero:path}")
async def quitar_numero(legajo_id: int, numero: str, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    legajo = db.query(Legajo).filter(Legajo.id == legajo_id).first()
    if not legajo:
        raise HTTPException(status_code=404, detail="Legajo no encontrado")
    legajo.numeros = [n for n in (legajo.numeros or []) if n != numero]
    db.commit()
    return {"numeros": legajo.numeros}


@router.post("/desde-expediente", response_model=LegajoSchema)
async def desde_expediente(datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """
    Crea (o devuelve) el legajo de la persona de un expediente, y le captura los
    conexos que ya estén anotados en las observaciones del expediente y del listado.
    """
    exp = db.query(Expediente).filter(Expediente.id == datos.get("expediente_id")).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    legajo = legajos_svc.asegurar_legajo(db, exp)
    # sumar el propio número + conexos de observaciones (expediente + listado)
    textos = [exp.observaciones or ""]
    for es in db.query(EntradaSalida).filter(EntradaSalida.expediente_id == exp.id).all():
        textos.append(es.observaciones or "")
    nums = ([exp.numero] if exp.numero else [])
    for t in textos:
        nums += legajos_svc.extraer_conexos(t)
    legajos_svc.agregar_numeros(legajo, nums)
    db.commit()
    db.refresh(legajo)
    return legajo


@router.post("/{legajo_id}/vincular")
async def vincular_expediente(legajo_id: int, datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """Vincula un expediente existente a un legajo y suma su número."""
    legajo = db.query(Legajo).filter(Legajo.id == legajo_id).first()
    exp = db.query(Expediente).filter(Expediente.id == datos.get("expediente_id")).first()
    if not legajo or not exp:
        raise HTTPException(status_code=404, detail="No encontrado")
    exp.legajo_id = legajo.id
    legajos_svc.agregar_numeros(legajo, [exp.numero])
    db.commit()
    return {"ok": True}
