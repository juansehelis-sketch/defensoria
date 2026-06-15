"""
Panel de pendientes por usuario y notificaciones.
Cada usuario ve qué tiene asignado, qué espera respuesta y novedades recientes.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Expediente, Notificacion, Proyecto, Usuario, Audiencia, EntradaSalida
from app.schemas import Notificacion as NotificacionSchema, EntradaSalida as EntradaSalidaSchema
from app.utils.deps import obtener_usuario_actual

router = APIRouter(prefix="/api/panel", tags=["panel"])


@router.get("/resumen")
async def resumen_panel(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Devuelve el resumen del panel del usuario logueado:
    - expedientes asignados
    - proyectos esperando respuesta (flujo de trabajo)
    - próximas audiencias de sus expedientes
    - novedades / notificaciones recientes
    """
    # Expedientes asignados al usuario
    asignados = (
        db.query(Expediente)
        .filter(Expediente.despachante_id == usuario.id)
        .filter(Expediente.estado == "activo")
        .order_by(Expediente.fecha_actualizacion.desc())
        .all()
    )

    # Proyectos que mandé y están esperando respuesta (enviados, sin subir)
    esperando = (
        db.query(Proyecto)
        .filter(Proyecto.remitente_id == usuario.id)
        .filter(Proyecto.estado == "enviado")
        .all()
    )

    # Proyectos que me mandaron y tengo que resolver (firmar / subir / devolver)
    para_revisar = (
        db.query(Proyecto)
        .filter(Proyecto.destinatario_id == usuario.id)
        .filter(Proyecto.estado == "enviado")
        .all()
    )

    # Próximas audiencias (de los expedientes asignados)
    hoy = datetime.now().date()
    proximas_audiencias = (
        db.query(Audiencia)
        .join(Expediente, Audiencia.expediente_id == Expediente.id)
        .filter(Expediente.despachante_id == usuario.id)
        .filter(Audiencia.fecha >= hoy)
        .filter(Audiencia.estado == "programada")
        .order_by(Audiencia.fecha.asc())
        .limit(10)
        .all()
    )

    # Notificaciones no leídas
    notificaciones = (
        db.query(Notificacion)
        .filter(Notificacion.usuario_id == usuario.id)
        .order_by(Notificacion.fecha_creacion.desc())
        .limit(20)
        .all()
    )

    return {
        "usuario": {"id": usuario.id, "nombre": usuario.nombre, "rol": usuario.rol},
        "expedientes_asignados": len(asignados),
        "asignados": [
            {
                "id": e.id,
                "numero": e.numero,
                "caratula": e.caratula,
                "juzgado": e.juzgado,
                "estado": e.estado,
            }
            for e in asignados[:15]
        ],
        "proyectos_esperando": len(esperando),
        "proyectos_para_revisar": len(para_revisar),
        "proximas_audiencias": [
            {
                "id": a.id,
                "fecha": str(a.fecha),
                "hora": str(a.hora),
                "juzgado": a.juzgado,
                "expediente_id": a.expediente_id,
            }
            for a in proximas_audiencias
        ],
        "notificaciones_no_leidas": sum(1 for n in notificaciones if not n.leida),
    }


def _mis_filas(db, usuario):
    """
    Query base: filas del listado asignadas al usuario que siguen PENDIENTES
    (sin subir al Lex y sin la vista cancelada). Las canceladas dejan de ser
    pendientes y por eso no aparecen en Inicio.
    """
    return (
        db.query(EntradaSalida)
        .filter(EntradaSalida.asignacion == usuario.nombre)
        .filter(EntradaSalida.subido_lex.is_(None))
        .filter(EntradaSalida.cancelada.isnot(True))
    )


@router.get("/pendientes", response_model=list[EntradaSalidaSchema])
async def expedientes_pendientes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Pendientes SIN ENVIAR a la firma (pase_firma vacío), más nuevos primero.
    Al enviar un proyecto, la fila pasa a 'enviados a la firma'.
    """
    return (
        _mis_filas(db, usuario)
        .filter(EntradaSalida.pase_firma.is_(None))
        .order_by(EntradaSalida.fecha.desc(), EntradaSalida.id.desc())
        .limit(500)
        .all()
    )


@router.get("/enviados-firma", response_model=list[EntradaSalidaSchema])
async def expedientes_enviados_firma(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Expedientes que YA envié a la firma (pase_firma cargado) y todavía no subidos.
    Más nuevos primero.
    """
    return (
        _mis_filas(db, usuario)
        .filter(EntradaSalida.pase_firma.isnot(None))
        .order_by(EntradaSalida.pase_firma.desc(), EntradaSalida.id.desc())
        .limit(500)
        .all()
    )


@router.get("/notificaciones", response_model=list[NotificacionSchema])
async def listar_notificaciones(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Lista las notificaciones del usuario (más recientes primero)."""
    return (
        db.query(Notificacion)
        .filter(Notificacion.usuario_id == usuario.id)
        .order_by(Notificacion.fecha_creacion.desc())
        .limit(50)
        .all()
    )


@router.put("/notificaciones/{notif_id}/leer")
async def marcar_leida(
    notif_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Marca una notificación como leída."""
    notif = (
        db.query(Notificacion)
        .filter(Notificacion.id == notif_id, Notificacion.usuario_id == usuario.id)
        .first()
    )
    if notif:
        notif.leida = True
        db.commit()
    return {"message": "ok"}
