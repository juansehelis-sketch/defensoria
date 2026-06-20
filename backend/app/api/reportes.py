"""
Endpoints de reportes:
- Expedientes por juzgado
- Expedientes sin movimiento en X días
- Intervenciones por despachante
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import io
from app.database import get_db
from app.models import Expediente, Historial, Usuario, Audiencia, Proyecto

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


# ── Copias de seguridad de la base local ───────────────────────
from app.services import backup as backup_svc
from app.utils.deps import obtener_usuario_actual


@router.get("/backups")
async def listar_backups(_u: Usuario = Depends(obtener_usuario_actual)):
    """Lista las copias de seguridad disponibles (solo base local SQLite)."""
    return {"backups": backup_svc.listar_backups()}


@router.post("/backup")
async def hacer_backup_ahora(_u: Usuario = Depends(obtener_usuario_actual)):
    """Hace una copia de seguridad ahora mismo."""
    b = backup_svc.hacer_backup()
    return {"ok": bool(b), "nombre": b.name if b else None}


# ── Reporte mensual (para elevar a la Defensoría General) ──────

def _rango_mes(anio: int, mes: int):
    ini = datetime(anio, mes, 1)
    fin = datetime(anio + (1 if mes == 12 else 0), 1 if mes == 12 else mes + 1, 1)
    return ini, fin  # intervalo [ini, fin)


def _datos_mensuales(db, anio, mes):
    ini, fin = _rango_mes(anio, mes)
    interv = (
        db.query(Historial.tipo, func.count(Historial.id))
        .filter(Historial.fecha_creacion >= ini, Historial.fecha_creacion < fin)
        .group_by(Historial.tipo).all()
    )
    prod = (
        db.query(Usuario.nombre, func.count(Historial.id))
        .join(Historial, Historial.usuario_id == Usuario.id)
        .filter(Historial.fecha_creacion >= ini, Historial.fecha_creacion < fin)
        .group_by(Usuario.nombre).order_by(func.count(Historial.id).desc()).all()
    )
    auds = db.query(Audiencia).filter(Audiencia.fecha >= ini.date(), Audiencia.fecha < fin.date()).all()
    por_modalidad, por_persona = {}, {}
    for a in auds:
        m = a.modalidad or "Sin definir"
        por_modalidad[m] = por_modalidad.get(m, 0) + 1
        if a.asignado_a:
            por_persona[a.asignado_a] = por_persona.get(a.asignado_a, 0) + 1
    enviados = db.query(func.count(Proyecto.id)).filter(Proyecto.fecha_envio >= ini, Proyecto.fecha_envio < fin).scalar() or 0
    subidos = db.query(func.count(Proyecto.id)).filter(Proyecto.estado == "subido", Proyecto.fecha_subido >= ini, Proyecto.fecha_subido < fin).scalar() or 0
    return {
        "anio": anio, "mes": mes,
        "intervenciones_por_tipo": [{"tipo": (t or "otro"), "cantidad": c} for t, c in interv],
        "productividad": [{"persona": n, "intervenciones": c} for n, c in prod],
        "audiencias": {"total": len(auds), "por_modalidad": por_modalidad, "por_persona": por_persona},
        "proyectos": {"enviados": enviados, "subidos": subidos},
    }


@router.get("/mensual")
async def reporte_mensual(anio: int, mes: int, db: Session = Depends(get_db)):
    """Resumen del mes: intervenciones por tipo, productividad, audiencias, proyectos."""
    return _datos_mensuales(db, anio, mes)


@router.get("/mensual/excel")
async def reporte_mensual_excel(anio: int, mes: int, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """Descarga el reporte mensual como Excel."""
    from openpyxl import Workbook
    d = _datos_mensuales(db, anio, mes)
    wb = Workbook()
    ws = wb.active
    ws.title = "Reporte mensual"
    ws.append([f"Reporte mensual — {mes:02d}/{anio}"])
    ws.append([])
    ws.append(["Intervenciones por tipo", "Cantidad"])
    for x in d["intervenciones_por_tipo"]:
        ws.append([x["tipo"], x["cantidad"]])
    ws.append([])
    ws.append(["Productividad (por persona)", "Intervenciones"])
    for x in d["productividad"]:
        ws.append([x["persona"], x["intervenciones"]])
    ws.append([])
    ws.append(["Audiencias del mes", d["audiencias"]["total"]])
    for k, v in d["audiencias"]["por_modalidad"].items():
        ws.append([k, v])
    ws.append([])
    ws.append(["Proyectos enviados a la firma", d["proyectos"]["enviados"]])
    ws.append(["Dictámenes subidos", d["proyectos"]["subidos"]])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="reporte_{anio}_{mes:02d}.xlsx"'},
    )


@router.get("/carga-equipo")
async def carga_equipo(db: Session = Depends(get_db)):
    """Cuánto tiene cada persona pendiente y qué está demorado."""
    hace7 = datetime.now() - timedelta(days=7)
    filas = []
    for u in db.query(Usuario).filter(Usuario.activo == True).all():  # noqa: E712
        recibidos = db.query(func.count(Proyecto.id)).filter(Proyecto.destinatario_id == u.id, Proyecto.estado == "enviado").scalar() or 0
        enviados = db.query(func.count(Proyecto.id)).filter(Proyecto.remitente_id == u.id, Proyecto.estado.in_(["enviado", "en_correccion"])).scalar() or 0
        demorados = db.query(func.count(Proyecto.id)).filter(Proyecto.destinatario_id == u.id, Proyecto.estado == "enviado", Proyecto.fecha_envio < hace7).scalar() or 0
        exp_activos = None
        if u.rol == "despachante":
            exp_activos = db.query(func.count(Expediente.id)).filter(Expediente.despachante_id == u.id, Expediente.estado == "activo").scalar() or 0
        filas.append({
            "persona": u.nombre, "rol": u.rol,
            "recibidos_pendientes": recibidos, "enviados_pendientes": enviados,
            "demorados": demorados, "expedientes_activos": exp_activos,
        })
    filas.sort(key=lambda f: f["recibidos_pendientes"] + f["enviados_pendientes"], reverse=True)
    return filas
