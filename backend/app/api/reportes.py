"""
Endpoints de reportes:
- Expedientes por juzgado
- Expedientes sin movimiento en X días
- Intervenciones por despachante
"""

from fastapi import APIRouter, Depends, Query, Body, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import io
from app.database import get_db
from app.models import Expediente, Historial, Usuario, Audiencia, Proyecto, EntradaSalida

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
from app.utils.deps import obtener_usuario_actual, requerir_rol


@router.get("/backups")
async def listar_backups(_u: Usuario = Depends(obtener_usuario_actual)):
    """Lista las copias de seguridad disponibles (solo base local SQLite)."""
    return {"backups": backup_svc.listar_backups(), "nube": backup_svc.usa_nube()}


@router.post("/backup")
async def hacer_backup_ahora(_u: Usuario = Depends(obtener_usuario_actual)):
    """Hace una copia de seguridad ahora mismo (local + nube si está configurada)."""
    b = backup_svc.hacer_backup()
    return {"ok": bool(b), "nombre": b.name if b else None}


@router.get("/backups/descargar/{nombre}")
async def descargar_backup(nombre: str, _u: Usuario = Depends(obtener_usuario_actual)):
    """Descarga una copia de seguridad para guardarla aparte."""
    p = backup_svc.BACKUP_DIR / Path(nombre).name
    if not p.exists():
        raise HTTPException(status_code=404, detail="Copia no encontrada")
    return StreamingResponse(
        io.BytesIO(p.read_bytes()),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{Path(nombre).name}"'},
    )


@router.post("/backups/restaurar")
async def restaurar_backup(datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """Restaura la base desde una copia (hace un resguardo del estado actual primero)."""
    res = backup_svc.restaurar(Path(datos.get("nombre", "")).name, db)
    if not res:
        raise HTTPException(status_code=400, detail="No se pudo restaurar (¿existe la copia?)")
    return res


@router.get("/auditoria")
async def auditoria(limit: int = 60, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """Historial de cambios: quién hizo qué y cuándo (acciones importantes)."""
    from app.models import Auditoria
    items = db.query(Auditoria).order_by(Auditoria.fecha_creacion.desc()).limit(limit).all()
    return [{
        "usuario": a.usuario_nombre, "accion": a.accion,
        "entidad": a.entidad, "detalle": a.detalle, "fecha": a.fecha_creacion,
    } for a in items]


# ── Días ocultos del listado (feriados / asuetos marcados a mano) ──
# Los fines de semana se ocultan solos en el frontend; acá se guardan los
# días hábiles que la oficina decide ocultar (feriados, asuetos, etc.).

@router.get("/feriados")
async def listar_feriados(db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    from app.models import DiaNoHabil
    items = db.query(DiaNoHabil).order_by(DiaNoHabil.fecha.asc()).all()
    return [{"id": f.id, "fecha": f.fecha, "motivo": f.motivo} for f in items]


@router.post("/feriados")
async def agregar_feriado(datos: dict = Body(...), db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    from app.models import DiaNoHabil
    from datetime import date as _date
    try:
        fecha = _date.fromisoformat((datos.get("fecha") or "").strip())
    except Exception:
        raise HTTPException(status_code=400, detail="Fecha inválida")
    if not db.query(DiaNoHabil).filter(DiaNoHabil.fecha == fecha).first():
        db.add(DiaNoHabil(fecha=fecha, motivo=(datos.get("motivo") or "").strip() or None))
        db.commit()
    return {"ok": True}


@router.delete("/feriados/{feriado_id}")
async def quitar_feriado(feriado_id: int, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    from app.models import DiaNoHabil
    f = db.query(DiaNoHabil).filter(DiaNoHabil.id == feriado_id).first()
    if f:
        db.delete(f)
        db.commit()
    return {"ok": True}


# ── Resumen diario de pendientes por mail ──────────────────────

@router.get("/mail-estado")
async def mail_estado(_u: Usuario = Depends(obtener_usuario_actual)):
    """Indica si el correo está configurado (para mostrarlo en la app)."""
    from app.services import mail
    return {"configurado": mail.mail_configurado()}


@router.post("/resumen-diario")
async def enviar_resumen_diario(_a: Usuario = Depends(requerir_rol("admin", "defensora")), db: Session = Depends(get_db)):
    """Envía ahora el resumen de pendientes a cada integrante (con email real)."""
    from app.services import mail
    return mail.enviar_resumen_diario(db)


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
    """Cuánto tiene cada persona entre manos (proyectos y expedientes)."""
    filas = []
    # El administrador es una cuenta de sistema: no trabaja expedientes, no va al reporte.
    for u in db.query(Usuario).filter(Usuario.activo == True, Usuario.rol != "admin").all():  # noqa: E712
        recibidos = db.query(func.count(Proyecto.id)).filter(Proyecto.destinatario_id == u.id, Proyecto.estado == "enviado").scalar() or 0
        enviados = db.query(func.count(Proyecto.id)).filter(Proyecto.remitente_id == u.id, Proyecto.estado.in_(["enviado", "en_correccion"])).scalar() or 0
        exp_activos = None
        if u.rol == "despachante":
            exp_activos = db.query(func.count(Expediente.id)).filter(Expediente.despachante_id == u.id, Expediente.estado == "activo").scalar() or 0
        filas.append({
            "persona": u.nombre, "rol": u.rol,
            "recibidos_pendientes": recibidos, "enviados_pendientes": enviados,
            "expedientes_activos": exp_activos,
        })
    filas.sort(key=lambda f: f["recibidos_pendientes"] + f["enviados_pendientes"], reverse=True)
    return filas


# ── Tablero de estadísticas generales ──────────────────────────

def _es_texto_fecha(s: str) -> bool:
    """True si el 'juzgado' es en realidad una fecha mal cargada (dato sucio)."""
    import re
    s = (s or "").strip()
    return bool(re.match(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", s) or re.match(r"^\d{4}-\d{2}-\d{2}", s))


def _objeto_de_autos(autos: str) -> str:
    """Extrae el objeto del proceso de la carátula ('GONZALEZ S/ ALIMENTOS' → 'ALIMENTOS')."""
    import re
    import unicodedata
    s = (autos or "").upper()
    if " S/" not in s:
        return "SIN CLASIFICAR"
    s = s.split(" S/")[-1].strip()
    s = s.split(" (")[0]
    s = re.sub(r"\bURGENTE\b", " ", s)  # el urgente es una marca, no un tipo distinto
    s = re.sub(r"[^A-ZÁÉÍÓÚÑÜ0-9\s\.]", " ", s)
    s = " ".join(s.split()).strip(" .")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return s[:45] or "SIN CLASIFICAR"


@router.get("/estadisticas")
async def estadisticas(anio: int, mes: int = 0, db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """
    Estadísticas del período (mes=0 → año completo), generadas solas a partir
    del trabajo cargado: vistas, demoras, personas, tipos de proceso, juzgados,
    audiencias, proyectos y totales generales.
    """
    from datetime import date as _date
    from collections import Counter, defaultdict

    if mes:
        ini = _date(anio, mes, 1)
        fin = _date(anio + (1 if mes == 12 else 0), 1 if mes == 12 else mes + 1, 1)
    else:
        ini, fin = _date(anio, 1, 1), _date(anio + 1, 1, 1)

    # Vistas que ENTRARON en el período
    entradas = (
        db.query(EntradaSalida.fecha, EntradaSalida.juzgado, EntradaSalida.autos,
                 EntradaSalida.asignacion, EntradaSalida.urgente, EntradaSalida.observaciones)
        .filter(EntradaSalida.fecha >= ini, EntradaSalida.fecha < fin).all()
    )
    # Vistas que se RESOLVIERON (subidas al Lex) en el período
    resueltas_rows = (
        db.query(EntradaSalida.fecha, EntradaSalida.pase_firma, EntradaSalida.subido_lex, EntradaSalida.asignacion)
        .filter(EntradaSalida.subido_lex >= ini, EntradaSalida.subido_lex < fin).all()
    )
    pendientes_rows = (
        db.query(EntradaSalida.asignacion)
        .filter(EntradaSalida.subido_lex.is_(None), EntradaSalida.cancelada.isnot(True)).all()
    )

    urgentes = sum(1 for e in entradas if e.urgente)
    repetidas = sum(1 for e in entradas if "vino repetido" in (e.observaciones or "").lower())

    # Demoras promedio (días corridos)
    def _prom(valores):
        valores = [v for v in valores if v is not None and v >= 0]
        return round(sum(valores) / len(valores), 1) if valores else None
    demora_total = _prom([(r.subido_lex - r.fecha).days for r in resueltas_rows if r.fecha and r.subido_lex])
    demora_a_firma = _prom([(r.pase_firma - r.fecha).days for r in resueltas_rows if r.fecha and r.pase_firma])
    demora_firma_a_lex = _prom([(r.subido_lex - r.pase_firma).days for r in resueltas_rows if r.pase_firma and r.subido_lex])

    # Por persona (asignación de la vista)
    por_persona = defaultdict(lambda: {"ingresadas": 0, "resueltas": 0, "pendientes": 0, "urgentes": 0, "a_la_firma": 0})
    for e in entradas:
        p = (e.asignacion or "Sin asignar").strip() or "Sin asignar"
        por_persona[p]["ingresadas"] += 1
        if e.urgente:
            por_persona[p]["urgentes"] += 1
    for r in resueltas_rows:
        p = (r.asignacion or "Sin asignar").strip() or "Sin asignar"
        por_persona[p]["resueltas"] += 1
    for r in pendientes_rows:
        p = (r.asignacion or "Sin asignar").strip() or "Sin asignar"
        por_persona[p]["pendientes"] += 1
    proyectos_env = (
        db.query(Usuario.nombre, func.count(Proyecto.id))
        .join(Proyecto, Proyecto.remitente_id == Usuario.id)
        .filter(Proyecto.fecha_envio >= ini, Proyecto.fecha_envio < fin)
        .group_by(Usuario.nombre).all()
    )
    for nombre, c in proyectos_env:
        por_persona[nombre]["a_la_firma"] = c
    personas = [{"persona": k, **v} for k, v in por_persona.items()]
    personas.sort(key=lambda x: x["ingresadas"], reverse=True)

    # Por tipo de proceso (objeto de la carátula)
    tipos = Counter(_objeto_de_autos(e.autos) for e in entradas)
    top = tipos.most_common(12)
    otros = sum(c for _, c in tipos.items()) - sum(c for _, c in top)
    por_tipo = [{"tipo": t.title(), "cantidad": c} for t, c in top]
    if otros > 0:
        por_tipo.append({"tipo": "Otros", "cantidad": otros})

    # Por juzgado (ignorando los datos sucios donde quedó una fecha)
    juzgados = Counter()
    for e in entradas:
        j = (e.juzgado or "").strip()
        if not j or _es_texto_fecha(j):
            juzgados["Sin dato"] += 1
        else:
            juzgados[j] += 1
    por_juzgado = [{"juzgado": j, "cantidad": c} for j, c in juzgados.most_common()]

    # Evolución de los últimos 12 meses (independiente del período elegido)
    hoy = _date.today()
    evolucion = []
    a, m = hoy.year, hoy.month
    for _ in range(12):
        i0 = _date(a, m, 1)
        f0 = _date(a + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1)
        ing = db.query(func.count(EntradaSalida.id)).filter(EntradaSalida.fecha >= i0, EntradaSalida.fecha < f0).scalar() or 0
        res = db.query(func.count(EntradaSalida.id)).filter(EntradaSalida.subido_lex >= i0, EntradaSalida.subido_lex < f0).scalar() or 0
        evolucion.append({"anio": a, "mes": m, "ingresadas": ing, "resueltas": res})
        m -= 1
        if m == 0:
            a, m = a - 1, 12
    evolucion.reverse()

    # Audiencias del período
    auds = db.query(Audiencia).filter(Audiencia.fecha >= ini, Audiencia.fecha < fin).all()
    aud_modalidad, aud_persona = Counter(), Counter()
    for x in auds:
        aud_modalidad[x.modalidad or "Sin definir"] += 1
        if x.asignado_a:
            aud_persona[x.asignado_a] += 1

    # Proyectos a la firma del período
    p_enviados = db.query(func.count(Proyecto.id)).filter(Proyecto.fecha_envio >= ini, Proyecto.fecha_envio < fin).scalar() or 0
    p_subidos_rows = db.query(Proyecto.fecha_envio, Proyecto.fecha_subido).filter(
        Proyecto.estado == "subido", Proyecto.fecha_subido >= ini, Proyecto.fecha_subido < fin).all()
    p_correccion = db.query(func.count(Proyecto.id)).filter(Proyecto.estado == "en_correccion").scalar() or 0
    demora_proyectos = _prom([(s.date() - e.date()).days for e, s in p_subidos_rows if e and s])

    # Totales generales
    from app.models import Legajo, LugarMapa, InternadoLugar
    totales = {
        "expedientes_activos": db.query(func.count(Expediente.id)).filter(Expediente.estado == "activo").scalar() or 0,
        "expedientes_archivados": db.query(func.count(Expediente.id)).filter(Expediente.estado == "archivo").scalar() or 0,
        "expedientes_nuevos_periodo": db.query(func.count(Expediente.id)).filter(Expediente.fecha_creacion >= ini, Expediente.fecha_creacion < fin).scalar() or 0,
        "legajos": db.query(func.count(Legajo.id)).scalar() or 0,
        "instituciones": db.query(func.count(LugarMapa.id)).scalar() or 0,
        "personas_alojadas": db.query(func.count(InternadoLugar.id)).scalar() or 0,
    }

    return {
        "anio": anio, "mes": mes,
        "vistas": {
            "ingresadas": len(entradas), "resueltas": len(resueltas_rows),
            "pendientes": len(pendientes_rows), "urgentes": urgentes, "repetidas": repetidas,
        },
        "demoras": {
            "total": demora_total,            # de que entra a que se sube al Lex
            "hasta_firma": demora_a_firma,    # de que entra al pase a la firma
            "firma_a_lex": demora_firma_a_lex,
            "proyectos": demora_proyectos,    # del envío del proyecto a su subida
        },
        "por_persona": personas,
        "por_tipo": por_tipo,
        "por_juzgado": por_juzgado,
        "evolucion": evolucion,
        "audiencias": {"total": len(auds), "por_modalidad": dict(aud_modalidad), "por_persona": dict(aud_persona)},
        "proyectos": {"enviados": p_enviados, "subidos": len(p_subidos_rows), "en_correccion": p_correccion},
        "totales": totales,
    }


# ── Grilla de asignación (objetos de proceso × integrantes) ────

_GRILLA_COLUMNAS = [
    {"nombre": "Laura", "cargo": "Sec."}, {"nombre": "Brenda", "cargo": "Sec."},
    {"nombre": "Silvana", "cargo": "Sec."}, {"nombre": "Josefina", "cargo": "Prosec."},
    {"nombre": "Clarisa", "cargo": "J. de Desp."}, {"nombre": "Sofía", "cargo": "J. de Desp."},
    {"nombre": "Augusto", "cargo": "Oficial Mayor"}, {"nombre": "Camila", "cargo": "Oficial"},
    {"nombre": "Delfina", "cargo": "Escribiente"}, {"nombre": "Tobías", "cargo": "Escrib. Auxiliar"},
    {"nombre": "Juan Sebastián", "cargo": "Auxiliar"}, {"nombre": "Catalina", "cargo": "Trab. Social"},
    {"nombre": "Julia", "cargo": "Trab. Social"},
]

_GRILLA_FILAS = [
    ("Det. de la Cap.", {"Josefina": "1-2", "Clarisa": "6-5", "Sofía": "0-7", "Augusto": "3-4",
                         "Camila": "8 todas · 9 solo recién iniciadas", "Delfina": "9"}),
    ("Diligencias preparatorias", {"Josefina": "1-2", "Clarisa": "6-5", "Sofía": "0-7", "Augusto": "3-4", "Camila": "8 y 9"}),
    ("Curatelas Art. 12", {"Tobías": "Todas"}),
    ("Divorcio · Homologaciones · Inf. Sumaria", {"Tobías": "Todas"}),
    ("Alimentos", {"Clarisa": "0-1", "Sofía": "5-6", "Augusto": "7", "Camila": "3", "Delfina": "8-9-4", "Tobías": "2"}),
    ("Patrimonial", {"Josefina": "6-0", "Clarisa": "2-7", "Sofía": "3-8", "Augusto": "9-1", "Camila": "4-5"}),
    ("Desalojo", {"Delfina": "3-4-5-6-7-8-9", "Tobías": "0-1-2"}),
    ("DVF", {"Josefina": "9", "Clarisa": "2", "Sofía": "8", "Augusto": "5", "Camila": "6",
             "Delfina": "7-0", "Tobías": "3", "Juan Sebastián": "1-4"}),
    ("Adopciones", {"Josefina": "5", "Delfina": "0-1-2-3-4-7-8-9", "Juan Sebastián": "6"}),
    ("Autorización · Reintegro de Hijo · Restitución Inter. · Exequatur · Priv. del Cuid. Pers.",
     {"Laura": "0-1-2-3", "Brenda": "4-5-7", "Silvana": "6-8-9"}),
    ("Cuid. Personal · Reg. de Com. · Filiaciones · Impugnaciones",
     {"Laura": "0-1-2-3", "Brenda": "4-5-7", "Silvana": "6-8-9"}),
    ("Control de Leg.", {"Catalina": "0-1-2-3-4", "Julia": "5-6-7-8-9"}),
    ("Guardas y Tutelas", {"Catalina": "0-1-2-3-4", "Julia": "5-6-7-8-9"}),
    ("Inter. de Menores de Edad · Dilig. Prep. de Menores de Edad",
     {"Josefina": "9", "Clarisa": "1", "Augusto": "5", "Camila": "7", "Tobías": "0-2-4-8-6", "Juan Sebastián": "3"}),
]

_GRILLA_INICIAL = {
    "titulo": "Grilla de asignación — Febrero 2026",
    "columnas": _GRILLA_COLUMNAS,
    "filas": [{"objeto": o, "celdas": c} for o, c in _GRILLA_FILAS],
}


@router.get("/grilla")
async def obtener_grilla(db: Session = Depends(get_db), _u: Usuario = Depends(obtener_usuario_actual)):
    """Grilla de asignación de la defensoría (se crea con la grilla vigente la primera vez)."""
    from app.models import GrillaAsignacion
    g = db.query(GrillaAsignacion).first()
    if not g:
        g = GrillaAsignacion(datos=_GRILLA_INICIAL)
        db.add(g)
        db.commit()
        db.refresh(g)
    return {"datos": g.datos, "fecha_actualizacion": g.fecha_actualizacion}


@router.put("/grilla")
async def guardar_grilla(cuerpo: dict = Body(...), db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)):
    """Guarda la grilla completa (edición libre para todo el equipo)."""
    from app.models import GrillaAsignacion
    datos = cuerpo.get("datos")
    if not isinstance(datos, dict) or not isinstance(datos.get("filas"), list):
        raise HTTPException(status_code=400, detail="Grilla inválida.")
    g = db.query(GrillaAsignacion).first()
    if not g:
        g = GrillaAsignacion()
        db.add(g)
    g.datos = datos
    from app.utils.auditoria import registrar
    registrar(db, usuario, "editó", "grilla de asignación", datos.get("titulo") or "")
    db.commit()
    return {"ok": True}
