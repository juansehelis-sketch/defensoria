"""
Endpoints para Entrada/Salida (registro diario, reemplaza Excel).
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from datetime import date
from app.database import get_db
from app.models import EntradaSalida, Expediente, Usuario, Notificacion, BorradoListado
from app.schemas import (
    EntradaSalida as EntradaSalidaSchema, EntradaSalidaCreate,
    BorradoListado as BorradoListadoSchema,
)
from app.utils.deps import obtener_usuario_actual

router = APIRouter(prefix="/api/entrada-salida", tags=["entrada-salida"])


@router.post("/", response_model=EntradaSalidaSchema)
async def crear_entrada_salida(
    entrada_create: EntradaSalidaCreate,
    db: Session = Depends(get_db)
):
    """
    Crea un registro de Entrada/Salida.
    Puede estar vinculado a un expediente existente o crear uno nuevo.
    """
    # Si viene número de expediente, asociarlo (creando el expediente si no existe)
    expediente_id = None
    if entrada_create.numero_expediente:
        numero = entrada_create.numero_expediente.replace("*", "").strip()
        expediente = db.query(Expediente).filter(Expediente.numero == numero).first()
        if not expediente:
            # Crear el registro único del expediente con los datos del listado
            despachante = None
            if entrada_create.asignacion:
                despachante = db.query(Usuario).filter(
                    Usuario.nombre == entrada_create.asignacion.strip()
                ).first()
            expediente = Expediente(
                numero=numero,
                juzgado=entrada_create.juzgado,
                caratula=entrada_create.autos,
                estado="activo",
                despachante_id=despachante.id if despachante else None,
                fecha_entrada=entrada_create.fecha,
                conexos=[],
                observaciones=entrada_create.observaciones or "",
            )
            db.add(expediente)
            db.flush()
        expediente_id = expediente.id

    nueva_entrada = EntradaSalida(
        fecha=entrada_create.fecha,
        juzgado=entrada_create.juzgado,
        expediente_id=expediente_id,
        autos=entrada_create.autos,
        asignacion=entrada_create.asignacion,
        pase_firma=entrada_create.pase_firma,
        subido_lex=entrada_create.subido_lex,
        observaciones=entrada_create.observaciones,
        subido_defensa=entrada_create.subido_defensa,
        urgente=entrada_create.urgente,
    )

    db.add(nueva_entrada)

    # Si es urgente y está asignado a alguien, notificarle en su pantalla de inicio
    if entrada_create.urgente and entrada_create.asignacion:
        asignado = db.query(Usuario).filter(
            Usuario.nombre == entrada_create.asignacion.strip()
        ).first()
        if asignado:
            db.add(Notificacion(
                usuario_id=asignado.id,
                tipo="expediente_urgente",
                contenido=f"Se te asignó un expediente URGENTE: {entrada_create.numero_expediente or ''} — {entrada_create.autos[:80]}",
                expediente_id=expediente_id,
            ))

    db.commit()
    db.refresh(nueva_entrada)

    return nueva_entrada


@router.get("/", response_model=list[EntradaSalidaSchema])
async def listar_entrada_salida(
    fecha_inicio: date = Query(None),
    fecha_fin: date = Query(None),
    juzgado: str = Query(None),
    asignacion: str = Query(None),
    busqueda: str = Query(None),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    """
    Lista el listado diario (Entrada/Salida) con filtros opcionales.
    Es la pantalla principal compartida.
    """
    query = _aplicar_filtros(
        db.query(EntradaSalida), fecha_inicio, fecha_fin, juzgado, asignacion, busqueda
    )
    registros = (
        query.order_by(EntradaSalida.fecha.desc(), EntradaSalida.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return registros


@router.get("/total")
async def total_entrada_salida(
    fecha_inicio: date = Query(None),
    fecha_fin: date = Query(None),
    juzgado: str = Query(None),
    asignacion: str = Query(None),
    busqueda: str = Query(None),
    db: Session = Depends(get_db),
):
    """Cantidad total de registros que cumplen los filtros (para la paginación)."""
    query = _aplicar_filtros(
        db.query(func.count(EntradaSalida.id)), fecha_inicio, fecha_fin, juzgado, asignacion, busqueda
    )
    return {"total": query.scalar()}


def _aplicar_filtros(query, fecha_inicio, fecha_fin, juzgado, asignacion, busqueda):
    """Aplica los filtros comunes a una query de EntradaSalida."""
    if fecha_inicio:
        query = query.filter(EntradaSalida.fecha >= fecha_inicio)
    if fecha_fin:
        query = query.filter(EntradaSalida.fecha <= fecha_fin)
    if juzgado:
        query = query.filter(EntradaSalida.juzgado == juzgado)
    if asignacion:
        query = query.filter(EntradaSalida.asignacion == asignacion)
    if busqueda:
        like = f"%{busqueda}%"
        query = query.outerjoin(Expediente, EntradaSalida.expediente_id == Expediente.id).filter(or_(
            EntradaSalida.autos.ilike(like),
            EntradaSalida.observaciones.ilike(like),
            EntradaSalida.juzgado.ilike(like),
            Expediente.numero.ilike(like),
        ))
    return query


@router.get("/borrados", response_model=list[BorradoListadoSchema])
async def listar_borrados(db: Session = Depends(get_db)):
    """Papelera: filas del listado que se borraron (las más recientes primero)."""
    return (
        db.query(BorradoListado)
        .order_by(BorradoListado.fecha_borrado.desc())
        .limit(300)
        .all()
    )


@router.get("/{entrada_id}", response_model=EntradaSalidaSchema)
async def obtener_entrada_salida(entrada_id: int, db: Session = Depends(get_db)):
    """
    Obtiene un registro específico.
    """
    entrada = db.query(EntradaSalida).filter(EntradaSalida.id == entrada_id).first()

    if not entrada:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro no encontrado"
        )

    return entrada


# Campos editables inline desde el listado (tipo Excel)
_EDITABLES = {"fecha", "juzgado", "autos", "asignacion", "pase_firma",
              "subido_lex", "observaciones", "urgente", "subido_defensa", "cancelada"}
_CAMPOS_FECHA = {"fecha", "pase_firma", "subido_lex"}


def _a_fecha(valor):
    """'' o None → None; 'aaaa-mm-dd' → date."""
    if valor in (None, "", "null"):
        return None
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError:
        return None


@router.put("/{entrada_id}", response_model=EntradaSalidaSchema)
async def actualizar_entrada_salida(
    entrada_id: int,
    entrada_update: dict,
    db: Session = Depends(get_db)
):
    """
    Actualiza un registro del listado (edición inline tipo Excel).
    Acepta cualquiera de los campos editables; las fechas se pueden vaciar (None).
    """
    entrada = db.query(EntradaSalida).filter(EntradaSalida.id == entrada_id).first()
    if not entrada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    for key, value in entrada_update.items():
        if key not in _EDITABLES:
            continue
        if key in _CAMPOS_FECHA:
            value = _a_fecha(value)
        setattr(entrada, key, value)

    # Si se editaron las observaciones y hay un "conexos:", se suman solos al
    # legajo de la persona (cuando el expediente ya tiene legajo).
    if "observaciones" in entrada_update and entrada.expediente_id:
        from app.services import legajos as legajos_svc
        exp = db.query(Expediente).filter(Expediente.id == entrada.expediente_id).first()
        legajos_svc.capturar_desde_observaciones(db, exp, entrada.observaciones)

    db.commit()
    db.refresh(entrada)
    return entrada


@router.delete("/{entrada_id}")
async def eliminar_entrada_salida(
    entrada_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Elimina una fila del listado, guardando una copia en la papelera
    (borrados_listado) por si hace falta revisarla después.
    """
    entrada = db.query(EntradaSalida).filter(EntradaSalida.id == entrada_id).first()
    if not entrada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    # Capturar los datos antes de tocar la sesión
    snap = {
        "fecha": entrada.fecha,
        "juzgado": entrada.juzgado,
        "numero_expediente": entrada.numero_expediente,
        "autos": entrada.autos,
        "asignacion": entrada.asignacion,
        "observaciones": entrada.observaciones,
        "borrado_por": usuario.nombre,
    }

    # Guardar copia en la papelera (best-effort: si falla, igual se borra la fila)
    try:
        db.add(BorradoListado(**snap))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[!] No se pudo registrar en la papelera: {e}")

    # Borrar la fila
    entrada = db.query(EntradaSalida).filter(EntradaSalida.id == entrada_id).first()
    if entrada:
        db.delete(entrada)
        db.commit()
    return {"message": "Registro eliminado"}


@router.post("/export/excel")
async def exportar_excel(
    fecha_inicio: date = Query(None),
    fecha_fin: date = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exporta registros de Entrada/Salida a Excel.
    Retorna un archivo descargable.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from io import BytesIO

    # Buscar registros
    query = db.query(EntradaSalida)

    if fecha_inicio:
        query = query.filter(EntradaSalida.fecha >= fecha_inicio)

    if fecha_fin:
        query = query.filter(EntradaSalida.fecha <= fecha_fin)

    registros = query.order_by(EntradaSalida.fecha.asc()).all()

    # Crear workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Entrada/Salida"

    # Encabezados
    headers = [
        "Fecha", "Juzgado", "Expediente", "Autos",
        "Asignación", "Pase a la firma", "Subido al Lex",
        "Observaciones", "Subido al Defensa"
    ]

    header_fill = PatternFill(start_color="1B2B42", end_color="1B2B42", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col)
        cell.value = header
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # Datos
    for row, reg in enumerate(registros, 2):
        ws.cell(row, 1).value = reg.fecha
        ws.cell(row, 2).value = reg.juzgado
        ws.cell(row, 3).value = reg.expediente.numero if reg.expediente else ""
        ws.cell(row, 4).value = reg.autos
        ws.cell(row, 5).value = reg.asignacion
        ws.cell(row, 6).value = reg.pase_firma
        ws.cell(row, 7).value = reg.subido_lex
        ws.cell(row, 8).value = reg.observaciones
        ws.cell(row, 9).value = "Sí" if reg.subido_defensa else "No"

    # Ajustar ancho de columnas
    for col in ws.columns:
        max_length = 15
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        ws.column_dimensions[col[0].column_letter].width = max_length + 2

    # Guardar en BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return {
        "filename": "entrada_salida.xlsx",
        "data": output.getvalue().hex()  # Convertir a hex para enviar en JSON
    }
