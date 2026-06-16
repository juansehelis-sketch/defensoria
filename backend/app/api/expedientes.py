"""
Endpoints de expedientes: ABM, búsqueda, upload PDF.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import date
from pathlib import Path
import re
import shutil
from app.database import get_db
from app.models import Expediente, Usuario, EntradaSalida, Defendido
from app.schemas import (
    Expediente as ExpedienteSchema, ExpedienteCreate, ExpedienteUpdate,
    Defendido as DefendidoSchema, DefendidoCreate,
)
from app.services.pdf_parser import parsear_pdf_desde_archivo, parsear_listado_de_pases
from app.config import asignar_expediente
from app.utils.deps import obtener_usuario_actual

router = APIRouter(prefix="/api/expedientes", tags=["expedientes"])

# Carpeta para uploads
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/", response_model=ExpedienteSchema)
async def crear_expediente(expediente_create: ExpedienteCreate, db: Session = Depends(get_db)):
    """
    Crea un nuevo expediente manualmente.
    """
    # Verificar que no exista
    existente = db.query(Expediente).filter(Expediente.numero == expediente_create.numero).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El expediente {expediente_create.numero} ya existe"
        )

    # Buscar al despachante por nombre
    despachante = None
    if expediente_create.despachante_asignado:
        despachante = db.query(Usuario).filter(
            Usuario.nombre == expediente_create.despachante_asignado
        ).first()

    nuevo_expediente = Expediente(
        numero=expediente_create.numero,
        juzgado=expediente_create.juzgado,
        caratula=expediente_create.caratula,
        tipo_proceso=expediente_create.tipo_proceso,
        estado=expediente_create.estado,
        despachante_id=despachante.id if despachante else None,
        fecha_entrada=expediente_create.fecha_entrada,
        conexos=expediente_create.conexos or [],
        observaciones=expediente_create.observaciones,
    )

    db.add(nuevo_expediente)
    db.commit()
    db.refresh(nuevo_expediente)

    return nuevo_expediente


@router.get("/", response_model=list[ExpedienteSchema])
async def listar_expedientes(
    estado: str = None,
    juzgado: str = None,
    despachante: str = None,
    busqueda: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Lista expedientes con filtros opcionales.
    """
    query = db.query(Expediente)

    if estado:
        query = query.filter(Expediente.estado == estado)

    if juzgado:
        query = query.filter(Expediente.juzgado == juzgado)

    if despachante:
        query = query.filter(
            Expediente.despachante.has(Usuario.nombre == despachante)
        )

    if busqueda:
        query = query.filter(
            or_(
                Expediente.numero.ilike(f"%{busqueda}%"),
                Expediente.caratula.ilike(f"%{busqueda}%"),
                Expediente.observaciones.ilike(f"%{busqueda}%"),
            )
        )

    expedientes = query.order_by(Expediente.fecha_entrada.desc()).offset(skip).limit(limit).all()
    return expedientes


@router.get("/por-numero")
async def buscar_por_numero(numero: str, db: Session = Depends(get_db)):
    """
    Busca un expediente por su número exacto (para autocompletar al cargar).
    Devuelve {existe, ...datos} para rellenar juzgado/carátula/observaciones/asignación.
    """
    num = (numero or "").replace("*", "").strip()
    expediente = db.query(Expediente).filter(Expediente.numero == num).first()
    if not expediente:
        return {"existe": False}
    return {
        "existe": True,
        "numero": expediente.numero,
        "juzgado": expediente.juzgado,
        "caratula": expediente.caratula,
        "observaciones": expediente.observaciones,
        "asignacion": expediente.despachante.nombre if expediente.despachante else "",
    }


@router.get("/{expediente_id}", response_model=ExpedienteSchema)
async def obtener_expediente(expediente_id: int, db: Session = Depends(get_db)):
    """
    Obtiene un expediente específico.
    """
    expediente = db.query(Expediente).filter(Expediente.id == expediente_id).first()

    if not expediente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expediente no encontrado"
        )

    return expediente


@router.put("/{expediente_id}", response_model=ExpedienteSchema)
async def actualizar_expediente(
    expediente_id: int,
    expediente_update: ExpedienteUpdate,
    db: Session = Depends(get_db)
):
    """
    Actualiza un expediente.
    """
    expediente = db.query(Expediente).filter(Expediente.id == expediente_id).first()

    if not expediente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expediente no encontrado"
        )

    # Actualizar campos
    if expediente_update.estado is not None:
        expediente.estado = expediente_update.estado

    if expediente_update.despachante_asignado is not None:
        despachante = db.query(Usuario).filter(
            Usuario.nombre == expediente_update.despachante_asignado
        ).first()
        expediente.despachante_id = despachante.id if despachante else None

    if expediente_update.observaciones is not None:
        expediente.observaciones = expediente_update.observaciones

    if expediente_update.resumen is not None:
        expediente.resumen = expediente_update.resumen

    db.commit()
    db.refresh(expediente)

    return expediente


# ── Defendidos del expediente ──────────────────────────────────

@router.post("/{expediente_id}/cancelar-vista")
async def cancelar_vista(
    expediente_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Cancela la vista del expediente: marca la fila del listado como cancelada
    (se pinta verde) y agrega a observaciones 'Vista cancelada el DD/MM/AAAA'.
    """
    from app.models import EntradaSalida, Historial, Notificacion
    expediente = db.query(Expediente).filter(Expediente.id == expediente_id).first()
    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")

    # Fila abierta más reciente (sin subir y sin cancelar); si no hay, la última
    fila = (
        db.query(EntradaSalida)
        .filter(EntradaSalida.expediente_id == expediente_id)
        .filter(EntradaSalida.subido_lex.is_(None))
        .filter(EntradaSalida.cancelada.isnot(True))
        .order_by(EntradaSalida.fecha.desc(), EntradaSalida.id.desc())
        .first()
    )
    if fila is None:
        fila = (
            db.query(EntradaSalida)
            .filter(EntradaSalida.expediente_id == expediente_id)
            .order_by(EntradaSalida.fecha.desc(), EntradaSalida.id.desc())
            .first()
        )
    if fila is None:
        raise HTTPException(status_code=404, detail="El expediente no tiene filas en el listado")

    hoy_txt = date.today().strftime("%d/%m/%Y")
    nota = f"Vista cancelada el {hoy_txt}"
    fila.cancelada = True
    # La nota va PRIMERO (antes de los conexos / lo que hubiera)
    fila.observaciones = (nota + " · " + fila.observaciones) if fila.observaciones else nota

    db.add(Historial(
        expediente_id=expediente_id,
        tipo="otro",
        descripcion=nota,
        usuario_id=usuario.id,
    ))

    # Notificar al despachante asignado (si no es quien la canceló)
    destinatario = expediente.despachante
    if destinatario is None and fila.asignacion:
        destinatario = db.query(Usuario).filter(Usuario.nombre == fila.asignacion).first()
    if destinatario and destinatario.id != usuario.id:
        db.add(Notificacion(
            usuario_id=destinatario.id,
            tipo="vista_cancelada",
            contenido=f"Se canceló la vista del expte. {expediente.numero} (lo marcó {usuario.nombre})",
            expediente_id=expediente_id,
        ))

    db.commit()
    return {"message": "Vista cancelada", "fila_id": fila.id, "observaciones": fila.observaciones}


@router.get("/{expediente_id}/defendidos", response_model=list[DefendidoSchema])
async def listar_defendidos(expediente_id: int, db: Session = Depends(get_db)):
    """Lista los defendidos/representados de un expediente."""
    return (
        db.query(Defendido)
        .filter(Defendido.expediente_id == expediente_id)
        .order_by(Defendido.id.asc())
        .all()
    )


@router.post("/defendidos", response_model=DefendidoSchema)
async def crear_defendido(datos: DefendidoCreate, db: Session = Depends(get_db)):
    """Agrega un defendido a un expediente."""
    expediente = db.query(Expediente).filter(Expediente.id == datos.expediente_id).first()
    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    defendido = Defendido(**datos.model_dump())
    db.add(defendido)
    db.commit()
    db.refresh(defendido)
    return defendido


@router.put("/defendidos/{defendido_id}", response_model=DefendidoSchema)
async def actualizar_defendido(defendido_id: int, datos: dict, db: Session = Depends(get_db)):
    """Edita un defendido."""
    defendido = db.query(Defendido).filter(Defendido.id == defendido_id).first()
    if not defendido:
        raise HTTPException(status_code=404, detail="Defendido no encontrado")
    for campo in ("nombre", "fecha_nacimiento", "dni", "vinculo", "observaciones"):
        if campo in datos:
            setattr(defendido, campo, datos[campo])
    db.commit()
    db.refresh(defendido)
    return defendido


@router.delete("/defendidos/{defendido_id}")
async def eliminar_defendido(defendido_id: int, db: Session = Depends(get_db)):
    """Elimina un defendido."""
    defendido = db.query(Defendido).filter(Defendido.id == defendido_id).first()
    if defendido:
        db.delete(defendido)
        db.commit()
    return {"message": "ok"}


@router.delete("/{expediente_id}")
async def eliminar_expediente(expediente_id: int, db: Session = Depends(get_db)):
    """
    Elimina un expediente (soft delete o hard delete según política).
    """
    expediente = db.query(Expediente).filter(Expediente.id == expediente_id).first()

    if not expediente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expediente no encontrado"
        )

    # Cambiar a estado "archivo" en lugar de eliminar
    expediente.estado = "archivo"
    db.commit()

    return {"message": f"Expediente {expediente.numero} archivado"}


def _limpiar_observaciones(obs: str) -> str:
    """
    Limpia las observaciones que se copian a una entrada nueva:
    saca los segmentos que son solo guiones, los de 'vista cancelada' y los de
    'vencen medidas'. Conserva el resto (ej. los conexos).
    """
    if not obs:
        return ""
    segmentos = re.split(r"\s*·\s*|\n", obs)
    limpios = []
    for s in segmentos:
        st = s.strip()
        if not st:
            continue
        if set(st) <= set("-–— "):       # solo guiones
            continue
        low = st.lower()
        if "vista cancelada" in low or "vencen medidas" in low:
            continue
        limpios.append(st)
    return " · ".join(limpios)


def _enriquecer_expedientes(db: Session, lista: list, juzgado_pdf: str) -> list:
    """
    Para cada expediente parseado del PDF, cruza con la base:
    - toma la ÚLTIMA persona que lo llevó (despachante actual del expediente),
    - toma las observaciones de la última vez que vino (limpiadas),
    - completa juzgado/carátula desde la base si faltan,
    - aplica las reglas especiales (Art. 42, Violencia Familiar en 3/9/7).
    """
    enriquecidos = []
    for e in lista:
        existente = db.query(Expediente).filter(Expediente.numero == e["numero"]).first()

        persona_base = ""
        obs_origen = ""
        if existente:
            if existente.despachante:
                persona_base = existente.despachante.nombre
            # Observaciones de la última vez que vino (última fila del listado)
            ultima = (
                db.query(EntradaSalida)
                .filter(EntradaSalida.expediente_id == existente.id)
                .order_by(EntradaSalida.fecha.desc(), EntradaSalida.id.desc())
                .first()
            )
            obs_origen = (ultima.observaciones if ultima and ultima.observaciones
                          else (existente.observaciones or ""))

        observaciones = _limpiar_observaciones(obs_origen)
        caratula = e.get("caratula") or (existente.caratula if existente else "")
        juzgado = e.get("juzgado") or (existente.juzgado if existente else juzgado_pdf)

        # Aplicar reglas especiales sobre la persona base
        asignacion_final, alertas = asignar_expediente(
            numero_expediente=e["numero"],
            caratula=caratula,
            persona_original=persona_base,
            obs=observaciones,
        )

        enriquecidos.append({
            "numero": e["numero"],
            "juzgado": juzgado,
            "caratula": caratula,
            "observaciones": observaciones,
            "asignacion_original": persona_base,
            "asignacion_final": asignacion_final,
            "alertas": alertas,
            "ya_existe": bool(existente),
        })
    return enriquecidos


@router.post("/parsear-pdf/")
async def parsear_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Parsea un PDF y retorna lista de expedientes con asignación automática
    (cruzada con la base). No guarda nada, solo muestra el preview.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se aceptan archivos PDF"
        )

    try:
        # Guardar PDF temporalmente
        temp_path = UPLOAD_DIR / file.filename
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Parsear y enriquecer con la base (asignación según última persona + reglas)
        expedientes, juzgado = parsear_pdf_desde_archivo(str(temp_path))
        expedientes = _enriquecer_expedientes(db, expedientes, juzgado)

        # Limpiar archivo temporal
        temp_path.unlink()

        return {
            "juzgado": juzgado,
            "expedientes": expedientes,
            "total": len(expedientes)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al parsear PDF: {str(e)}"
        )


@router.post("/bulk-from-pdf/")
async def crear_expedientes_desde_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Parsea un PDF y crea expedientes en BD con asignación automática.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se aceptan archivos PDF"
        )

    try:
        # Guardar PDF temporalmente
        temp_path = UPLOAD_DIR / file.filename
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Parsear y enriquecer (asignación según última persona + reglas)
        expedientes_parseados, juzgado = parsear_pdf_desde_archivo(str(temp_path))
        expedientes_parseados = _enriquecer_expedientes(db, expedientes_parseados, juzgado)

        agregados = []
        errores = []
        hoy = date.today()

        for exp_data in expedientes_parseados:
            try:
                # Despachante final (puede venir de la última persona o de una regla)
                despachante = None
                if exp_data["asignacion_final"]:
                    despachante = db.query(Usuario).filter(
                        Usuario.nombre == exp_data["asignacion_final"]
                    ).first()

                # Crear el expediente único si no existe; si existe, actualizar asignación
                expediente = db.query(Expediente).filter(
                    Expediente.numero == exp_data["numero"]
                ).first()

                if not expediente:
                    expediente = Expediente(
                        numero=exp_data["numero"],
                        juzgado=exp_data["juzgado"] or juzgado,
                        caratula=exp_data["caratula"],
                        estado="activo",
                        despachante_id=despachante.id if despachante else None,
                        fecha_entrada=hoy,
                        observaciones="",
                        conexos=[],
                    )
                    db.add(expediente)
                    db.flush()
                elif despachante:
                    expediente.despachante_id = despachante.id

                # Agregar la fila al listado del día (entrada de hoy).
                # Preferimos la carátula de la base (completa) sobre la del PDF
                # (que puede venir recortada por el formato del listado).
                caratula_completa = expediente.caratula or exp_data["caratula"]
                db.add(EntradaSalida(
                    fecha=hoy,
                    juzgado=exp_data["juzgado"] or juzgado,
                    expediente_id=expediente.id,
                    autos=caratula_completa,
                    asignacion=exp_data["asignacion_final"],
                    observaciones=exp_data.get("observaciones", ""),
                    subido_defensa=False,
                ))
                db.commit()

                agregados.append({
                    "numero": exp_data["numero"],
                    "id": expediente.id,
                    "asignacion": exp_data["asignacion_final"],
                    "ya_existia": exp_data["ya_existe"],
                    "alertas": exp_data["alertas"],
                })

            except Exception as e:
                db.rollback()
                errores.append({"numero": exp_data["numero"], "error": str(e)})

        temp_path.unlink()

        return {
            "creados": agregados,
            "errores": errores,
            "total_creados": len(agregados),
            "total_errores": len(errores)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar PDF: {str(e)}"
        )
