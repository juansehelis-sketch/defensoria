"""
Chat interno de la dependencia: mensajes entre integrantes del equipo y grupos,
con archivos adjuntos. Todo queda dentro del sistema (no hace falta WhatsApp).

Los mensajes nuevos se traen por consulta periódica del frontend (?desde_id=),
que es lo que mejor aguanta el servidor gratuito.
"""

import uuid
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChatConversacion, ChatMiembro, ChatMensaje, Usuario
from app.utils.deps import obtener_usuario_actual
from app.services import storage
from app.utils.tiempo import ahora

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Tope de tamaño por archivo (el almacenamiento es compartido con los adjuntos).
MAX_ARCHIVO_MB = 25


# ═══════════════════════════════════════════════════════════════
# Ayudas internas
# ═══════════════════════════════════════════════════════════════

def _miembro(db: Session, conversacion_id: int, usuario_id: int) -> ChatMiembro:
    """Devuelve la membresía del usuario en la conversación, o 403/404."""
    conv = db.query(ChatConversacion).filter(ChatConversacion.id == conversacion_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="La conversación no existe")
    m = (
        db.query(ChatMiembro)
        .filter(ChatMiembro.conversacion_id == conversacion_id, ChatMiembro.usuario_id == usuario_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=403, detail="No participás de esta conversación")
    return m


def _serializar_mensaje(msg: ChatMensaje) -> dict:
    return {
        "id": msg.id,
        "conversacion_id": msg.conversacion_id,
        "autor_id": msg.autor_id,
        "autor_nombre": msg.autor.nombre if msg.autor else None,
        "texto": None if msg.borrado else msg.texto,
        "archivo_url": None if msg.borrado else msg.archivo_url,
        "archivo_nombre": None if msg.borrado else msg.archivo_nombre,
        "archivo_tipo": None if msg.borrado else msg.archivo_tipo,
        "archivo_tamano": None if msg.borrado else msg.archivo_tamano,
        "borrado": bool(msg.borrado),
        "fecha_creacion": msg.fecha_creacion,
    }


def _titulo(conv: ChatConversacion, yo_id: int) -> str:
    """Nombre visible: el del grupo, o el de la otra persona si es directo."""
    if conv.tipo == "grupo":
        return conv.nombre or "Grupo"
    otro = next((m.usuario for m in conv.miembros if m.usuario_id != yo_id and m.usuario), None)
    return otro.nombre if otro else "Conversación"


def _serializar_conversacion(db: Session, conv: ChatConversacion, yo: Usuario, mi_miembro: ChatMiembro) -> dict:
    ultimo = (
        db.query(ChatMensaje)
        .filter(ChatMensaje.conversacion_id == conv.id)
        .order_by(ChatMensaje.id.desc())
        .first()
    )
    no_leidos = (
        db.query(func.count(ChatMensaje.id))
        .filter(
            ChatMensaje.conversacion_id == conv.id,
            ChatMensaje.id > (mi_miembro.ultimo_leido_id or 0),
            ChatMensaje.autor_id != yo.id,
        )
        .scalar()
    ) or 0

    if ultimo is None:
        resumen = ""
    elif ultimo.borrado:
        resumen = "Mensaje eliminado"
    elif ultimo.texto:
        resumen = ultimo.texto
    elif ultimo.archivo_nombre:
        resumen = ultimo.archivo_nombre
    else:
        resumen = ""

    return {
        "id": conv.id,
        "tipo": conv.tipo,
        "nombre": conv.nombre,
        "titulo": _titulo(conv, yo.id),
        "creador_id": conv.creador_id,
        "miembros": [
            {
                "id": m.usuario_id,
                "nombre": m.usuario.nombre if m.usuario else "—",
                "cargo": m.usuario.cargo if m.usuario else None,
                "rol": m.usuario.rol if m.usuario else None,
            }
            for m in conv.miembros
            if m.usuario
        ],
        "ultimo_mensaje": resumen[:120],
        # El id del último mensaje deja saber al frontend si llegó algo nuevo
        # (para el aviso sonoro y la notificación del navegador).
        "ultimo_mensaje_id": (ultimo.id if ultimo else 0),
        "ultimo_autor": (ultimo.autor.nombre if ultimo and ultimo.autor else None),
        "ultimo_autor_id": (ultimo.autor_id if ultimo else None),
        "fecha_ultimo_mensaje": conv.fecha_ultimo_mensaje,
        "no_leidos": int(no_leidos),
    }


def _mis_conversaciones(db: Session, yo: Usuario):
    """Pares (conversación, mi membresía) ordenados por actividad reciente."""
    filas = (
        db.query(ChatConversacion, ChatMiembro)
        .join(ChatMiembro, ChatMiembro.conversacion_id == ChatConversacion.id)
        .filter(ChatMiembro.usuario_id == yo.id)
        .order_by(ChatConversacion.fecha_ultimo_mensaje.desc())
        .all()
    )
    return filas


# ═══════════════════════════════════════════════════════════════
# Conversaciones
# ═══════════════════════════════════════════════════════════════

@router.get("/conversaciones")
async def listar_conversaciones(db: Session = Depends(get_db), yo: Usuario = Depends(obtener_usuario_actual)):
    """Todas mis conversaciones, con el último mensaje y los no leídos."""
    return [_serializar_conversacion(db, conv, yo, m) for conv, m in _mis_conversaciones(db, yo)]


@router.post("/directo")
async def abrir_directo(
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Abre (o recupera) la conversación de a dos con otra persona."""
    otro_id = datos.get("usuario_id")
    if not otro_id:
        raise HTTPException(status_code=400, detail="Falta indicar con quién hablar")
    if int(otro_id) == yo.id:
        raise HTTPException(status_code=400, detail="No podés abrir una conversación con vos mismo")

    otro = db.query(Usuario).filter(Usuario.id == int(otro_id), Usuario.activo == True).first()  # noqa: E712
    if not otro:
        raise HTTPException(status_code=404, detail="Esa persona no está en el sistema")

    # ¿Ya existe un directo con los dos?
    mias = {c.id for c, _ in _mis_conversaciones(db, yo)}
    existente = (
        db.query(ChatConversacion)
        .join(ChatMiembro, ChatMiembro.conversacion_id == ChatConversacion.id)
        .filter(
            ChatConversacion.tipo == "directo",
            ChatConversacion.id.in_(mias or {0}),
            ChatMiembro.usuario_id == otro.id,
        )
        .first()
    )
    if existente:
        m = _miembro(db, existente.id, yo.id)
        return _serializar_conversacion(db, existente, yo, m)

    conv = ChatConversacion(tipo="directo", creador_id=yo.id, fecha_ultimo_mensaje=ahora())
    db.add(conv)
    db.flush()
    db.add(ChatMiembro(conversacion_id=conv.id, usuario_id=yo.id))
    db.add(ChatMiembro(conversacion_id=conv.id, usuario_id=otro.id))
    db.commit()
    db.refresh(conv)
    return _serializar_conversacion(db, conv, yo, _miembro(db, conv.id, yo.id))


@router.post("/grupos")
async def crear_grupo(
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Crea un grupo con el nombre y las personas indicadas."""
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Ponele un nombre al grupo")
    ids = {int(i) for i in (datos.get("miembros") or [])}
    ids.add(yo.id)
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Elegí al menos una persona más")

    conv = ChatConversacion(tipo="grupo", nombre=nombre, creador_id=yo.id, fecha_ultimo_mensaje=ahora())
    db.add(conv)
    db.flush()
    for uid in ids:
        if db.query(Usuario).filter(Usuario.id == uid, Usuario.activo == True).first():  # noqa: E712
            db.add(ChatMiembro(conversacion_id=conv.id, usuario_id=uid))
    db.commit()
    db.refresh(conv)
    return _serializar_conversacion(db, conv, yo, _miembro(db, conv.id, yo.id))


@router.put("/grupos/{conversacion_id}")
async def editar_grupo(
    conversacion_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Cambia el nombre del grupo o quiénes lo integran."""
    _miembro(db, conversacion_id, yo.id)
    conv = db.query(ChatConversacion).filter(ChatConversacion.id == conversacion_id).first()
    if conv.tipo != "grupo":
        raise HTTPException(status_code=400, detail="Solo se pueden editar los grupos")

    if "nombre" in datos:
        nombre = (datos.get("nombre") or "").strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El grupo necesita un nombre")
        conv.nombre = nombre

    if "miembros" in datos:
        nuevos = {int(i) for i in (datos.get("miembros") or [])}
        nuevos.add(yo.id)  # quien edita no se saca a sí mismo por accidente
        actuales = {m.usuario_id: m for m in conv.miembros}
        for uid in nuevos - set(actuales):
            if db.query(Usuario).filter(Usuario.id == uid, Usuario.activo == True).first():  # noqa: E712
                db.add(ChatMiembro(conversacion_id=conv.id, usuario_id=uid))
        for uid in set(actuales) - nuevos:
            db.delete(actuales[uid])

    db.commit()
    db.refresh(conv)
    return _serializar_conversacion(db, conv, yo, _miembro(db, conv.id, yo.id))


@router.delete("/conversaciones/{conversacion_id}")
async def salir(
    conversacion_id: int,
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Sale del grupo (o borra la conversación si queda vacía)."""
    m = _miembro(db, conversacion_id, yo.id)
    conv = db.query(ChatConversacion).filter(ChatConversacion.id == conversacion_id).first()
    db.delete(m)
    db.flush()
    quedan = (
        db.query(func.count(ChatMiembro.id))
        .filter(ChatMiembro.conversacion_id == conversacion_id)
        .scalar()
    ) or 0
    if quedan == 0:
        db.delete(conv)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# Mensajes
# ═══════════════════════════════════════════════════════════════

@router.get("/conversaciones/{conversacion_id}/mensajes")
async def listar_mensajes(
    conversacion_id: int,
    desde_id: int = 0,
    limite: int = 200,
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """
    Mensajes de la conversación. Con ?desde_id= trae solo los posteriores
    (es lo que usa la pantalla para ir sumando los nuevos).
    """
    _miembro(db, conversacion_id, yo.id)
    q = db.query(ChatMensaje).filter(ChatMensaje.conversacion_id == conversacion_id)
    if desde_id:
        mensajes = q.filter(ChatMensaje.id > desde_id).order_by(ChatMensaje.id.asc()).all()
    else:
        # Sin desde_id: los últimos N, devueltos en orden cronológico.
        mensajes = list(reversed(q.order_by(ChatMensaje.id.desc()).limit(max(1, min(limite, 500))).all()))
    return [_serializar_mensaje(m) for m in mensajes]


def _registrar(db: Session, conv: ChatConversacion, msg: ChatMensaje, mi_miembro: ChatMiembro):
    """Guarda el mensaje, mueve la conversación arriba y me lo marca como leído."""
    db.add(msg)
    db.flush()
    conv.fecha_ultimo_mensaje = msg.fecha_creacion or ahora()
    mi_miembro.ultimo_leido_id = msg.id
    db.commit()
    db.refresh(msg)


@router.post("/conversaciones/{conversacion_id}/mensajes")
async def enviar_mensaje(
    conversacion_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Manda un mensaje de texto."""
    m = _miembro(db, conversacion_id, yo.id)
    texto = (datos.get("texto") or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="El mensaje está vacío")
    if len(texto) > 5000:
        raise HTTPException(status_code=400, detail="El mensaje es demasiado largo")

    conv = db.query(ChatConversacion).filter(ChatConversacion.id == conversacion_id).first()
    msg = ChatMensaje(conversacion_id=conversacion_id, autor_id=yo.id, texto=texto, fecha_creacion=ahora())
    _registrar(db, conv, msg, m)
    return _serializar_mensaje(msg)


@router.post("/conversaciones/{conversacion_id}/archivo")
async def enviar_archivo(
    conversacion_id: int,
    archivo: UploadFile = File(...),
    texto: str = Form(""),
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Manda un archivo (con un texto opcional)."""
    m = _miembro(db, conversacion_id, yo.id)
    if not archivo or not archivo.filename:
        raise HTTPException(status_code=400, detail="No se recibió ningún archivo")

    datos = await archivo.read()
    if len(datos) > MAX_ARCHIVO_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"El archivo supera los {MAX_ARCHIVO_MB} MB")

    nombre_guardado = f"{uuid.uuid4().hex}{Path(archivo.filename).suffix}"
    try:
        storage.guardar(nombre_guardado, datos, archivo.content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo guardar el archivo: {e}")

    conv = db.query(ChatConversacion).filter(ChatConversacion.id == conversacion_id).first()
    msg = ChatMensaje(
        conversacion_id=conversacion_id,
        autor_id=yo.id,
        texto=(texto or "").strip() or None,
        archivo_url=f"/uploads/{nombre_guardado}",
        archivo_nombre=archivo.filename,
        archivo_tipo=archivo.content_type,
        archivo_tamano=len(datos),
        fecha_creacion=ahora(),
    )
    _registrar(db, conv, msg, m)
    return _serializar_mensaje(msg)


@router.post("/conversaciones/{conversacion_id}/leido")
async def marcar_leido(
    conversacion_id: int,
    datos: dict = Body(default={}),
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Marca la conversación como leída hasta el último mensaje."""
    m = _miembro(db, conversacion_id, yo.id)
    hasta = datos.get("hasta_id")
    if not hasta:
        hasta = (
            db.query(func.max(ChatMensaje.id))
            .filter(ChatMensaje.conversacion_id == conversacion_id)
            .scalar()
        ) or 0
    if int(hasta) > (m.ultimo_leido_id or 0):
        m.ultimo_leido_id = int(hasta)
        db.commit()
    return {"ok": True, "ultimo_leido_id": m.ultimo_leido_id or 0}


@router.delete("/mensajes/{mensaje_id}")
async def borrar_mensaje(
    mensaje_id: int,
    db: Session = Depends(get_db),
    yo: Usuario = Depends(obtener_usuario_actual),
):
    """Borra un mensaje propio (queda como 'Mensaje eliminado')."""
    msg = db.query(ChatMensaje).filter(ChatMensaje.id == mensaje_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="El mensaje no existe")
    _miembro(db, msg.conversacion_id, yo.id)
    if msg.autor_id != yo.id and yo.rol not in ("admin", "defensora"):
        raise HTTPException(status_code=403, detail="Solo podés borrar tus propios mensajes")
    msg.borrado = True
    db.commit()
    return {"ok": True}
