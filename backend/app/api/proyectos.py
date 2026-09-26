"""
Proyectos "a la firma": el flujo de trabajo interno que reemplaza el correo.

Flujo:
  1) Un remitente (despachante o secretaria) ENVÍA el proyecto de un expediente a
     un destinatario (secretaria o defensora), con archivos y datos.
     → se estampa "Pase a la firma" = hoy en el listado, y se notifica.
  2) El destinatario puede:
       - DEVOLVER con comentarios → estado "en_correccion", se notifica al remitente.
       - MARCAR SUBIDO → estado "subido", se estampa "Subido al Lex" = hoy, se notifica.
     La secretaria además puede REENVIAR A LA DEFENSORA.
  3) El remitente, si fue devuelto, REENVÍA una versión corregida.
Todo queda registrado en el historial del expediente.

El proyecto de dictamen viaja DENTRO del sistema: se redacta sobre una plantilla
Word propia (PlantillaFirma) o se adjunta un Word, y quien firma lo corrige ahí
mismo, sin descargar nada. Se guarda como HTML + Word base (services/documentos.py)
y se puede bajar en Word o PDF en cualquier momento.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Body
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, date
from pathlib import Path
from typing import List
from html import escape
import re
import shutil
import uuid

from app.database import get_db
from app.models import Proyecto, Expediente, EntradaSalida, Usuario, Notificacion, Historial, PlantillaFirma
from app.schemas import Proyecto as ProyectoSchema, ProyectoDetalle, PlantillaFirma as PlantillaFirmaSchema
from app.utils.deps import obtener_usuario_actual, requerir_rol
from app.services import storage, documentos
from app.utils.tiempo import ahora, hoy

router = APIRouter(prefix="/api/proyectos", tags=["proyectos"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def _guardar_archivos(archivos: List[UploadFile]) -> list:
    """Guarda los PDFs adjuntos y devuelve [{nombre, url}]."""
    guardados = []
    for arch in archivos or []:
        if not arch or not arch.filename:
            continue
        ext = Path(arch.filename).suffix
        nombre_guardado = f"{uuid.uuid4().hex}{ext}"
        storage.guardar(nombre_guardado, arch.file.read(), arch.content_type)
        guardados.append({"nombre": arch.filename, "url": f"/uploads/{nombre_guardado}"})
    return guardados


def _entrada_para_estampar(db: Session, expediente: Expediente) -> EntradaSalida:
    """
    Devuelve la fila del listado sobre la que estampar las fechas del flujo.
    Usa la última entrada abierta (sin 'subido al lex'); si no hay, crea una nueva de hoy.
    """
    entrada = (
        db.query(EntradaSalida)
        .filter(EntradaSalida.expediente_id == expediente.id)
        .filter(EntradaSalida.subido_lex.is_(None))
        .order_by(EntradaSalida.fecha.desc())
        .first()
    )
    if entrada is None:
        entrada = EntradaSalida(
            fecha=hoy(),
            juzgado=expediente.juzgado,
            expediente_id=expediente.id,
            autos=expediente.caratula,
            asignacion=expediente.despachante.nombre if expediente.despachante else "",
            observaciones="",
            subido_defensa=False,
        )
        db.add(entrada)
        db.flush()
    return entrada


def _registrar_historial(db: Session, expediente_id: int, usuario: Usuario, tipo: str, desc: str):
    db.add(Historial(
        expediente_id=expediente_id,
        tipo=tipo,
        descripcion=desc,
        usuario_id=usuario.id,
    ))


@router.get("/preview-docx")
async def preview_docx(url: str, usuario: Usuario = Depends(obtener_usuario_actual)):
    """Devuelve el contenido de un .docx como HTML para previsualizar sin descargar."""
    datos = storage.leer(Path(url).name)
    if datos is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    try:
        return {"html": documentos.docx_a_html(datos)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo leer el documento: {e}")


# ── Documento del proyecto: helpers ────────────────────────────

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _leer_word(archivo: UploadFile) -> bytes:
    nombre = (archivo.filename or "").lower()
    if not nombre.endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="El archivo tiene que ser un Word .docx. Si es un .doc viejo, abrilo en Word y "
                   "guardalo como \"Documento de Word (.docx)\".",
        )
    datos = archivo.file.read()
    if len(datos) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El Word es demasiado grande (máximo 15 MB).")
    if not documentos.docx_valido(datos):
        raise HTTPException(status_code=400, detail="No se pudo abrir el Word. Revisá que no esté dañado.")
    return datos


def _guardar_bytes(datos: bytes, ext: str, content_type: str) -> str:
    nombre = f"{uuid.uuid4().hex}{ext}"
    storage.guardar(nombre, datos, content_type)
    return f"/uploads/{nombre}"


def _cargar_word_en_proyecto(p: Proyecto, archivo: UploadFile):
    """El Word adjuntado pasa a ser el proyecto (base + texto editable)."""
    datos = _leer_word(archivo)
    url = _guardar_bytes(datos, ".docx", _DOCX_MIME)
    p.documento_base_url = url
    p.documento_original_url = url
    p.documento_html = documentos.docx_a_html(datos)
    p.documento_editado = False


def _agregar_version(p: Proyecto, usuario: Usuario, motivo: str, siempre: bool = False):
    """Guarda una foto del documento en el historial de versiones."""
    if not p.documento_html:
        return
    versiones = list(p.documento_versiones or [])
    if not siempre and versiones and \
            documentos.formato_plano(versiones[-1].get("html")) == documentos.formato_plano(p.documento_html):
        return
    versiones.append({
        "n": len(versiones) + 1, "autor": usuario.nombre, "autor_id": usuario.id, "rol": usuario.rol,
        "fecha": ahora().isoformat(), "motivo": motivo, "html": p.documento_html,
    })
    p.documento_versiones = versiones


def _corregido_por_firmante(p: Proyecto):
    """¿El documento actual difiere de lo último que armó el despachante?"""
    if not p.documento_html:
        return None
    propias = [v for v in (p.documento_versiones or []) if v.get("autor_id") == p.remitente_id]
    if not propias:
        return None
    return documentos.formato_plano(propias[-1].get("html")) != documentos.formato_plano(p.documento_html)


def _puede_editar(p: Proyecto, usuario: Usuario) -> bool:
    return (p.destinatario_id == usuario.id and p.estado == "enviado") or \
           (p.remitente_id == usuario.id and p.estado == "en_correccion")


def _base_bytes(p: Proyecto):
    if not p.documento_base_url:
        return None
    return storage.leer(Path(p.documento_base_url).name)


def _nombre_archivo(p: Proyecto, ext: str) -> str:
    num = (p.expediente_numero or str(p.id)).replace("/", "-")
    car = (p.expediente_caratula or "").split(" S/")[0][:40]
    base = f"Proyecto {num}" + (f" - {car}" if car else "")
    return re.sub(r'[<>:"/\\|?*\n\r\t]+', " ", base).strip() + ext


# ── Plantillas del usuario ─────────────────────────────────────

@router.get("/plantillas", response_model=list[PlantillaFirmaSchema])
async def listar_plantillas(db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)):
    """Mis plantillas Word para los proyectos a la firma."""
    return (
        db.query(PlantillaFirma)
        .filter(PlantillaFirma.usuario_id == usuario.id)
        .order_by(PlantillaFirma.categoria, PlantillaFirma.nombre)
        .all()
    )


@router.post("/plantillas", response_model=PlantillaFirmaSchema)
async def subir_plantilla(
    nombre: str = Form(""),
    categoria: str = Form(""),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    datos = _leer_word(archivo)
    pl = PlantillaFirma(
        usuario_id=usuario.id,
        nombre=(nombre.strip() or Path(archivo.filename).stem)[:150],
        categoria=categoria.strip()[:100] or None,
        archivo_url=_guardar_bytes(datos, ".docx", _DOCX_MIME),
        archivo_nombre=archivo.filename,
    )
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return pl


def _mi_plantilla(db, plantilla_id: int, usuario: Usuario) -> PlantillaFirma:
    pl = db.query(PlantillaFirma).filter(PlantillaFirma.id == plantilla_id).first()
    if not pl or pl.usuario_id != usuario.id:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return pl


@router.put("/plantillas/{plantilla_id}", response_model=PlantillaFirmaSchema)
async def editar_plantilla(
    plantilla_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    pl = _mi_plantilla(db, plantilla_id, usuario)
    if "nombre" in datos and str(datos["nombre"] or "").strip():
        pl.nombre = str(datos["nombre"]).strip()[:150]
    if "categoria" in datos:
        pl.categoria = (str(datos["categoria"] or "").strip()[:100]) or None
    db.commit()
    db.refresh(pl)
    return pl


@router.delete("/plantillas/{plantilla_id}")
async def borrar_plantilla(plantilla_id: int, db: Session = Depends(get_db),
                           usuario: Usuario = Depends(obtener_usuario_actual)):
    # El archivo queda guardado: los proyectos ya armados con ella lo siguen usando
    db.delete(_mi_plantilla(db, plantilla_id, usuario))
    db.commit()
    return {"ok": True}


@router.get("/plantillas/{plantilla_id}/html")
async def plantilla_html(plantilla_id: int, db: Session = Depends(get_db),
                         usuario: Usuario = Depends(obtener_usuario_actual)):
    """Texto de la plantilla listo para redactar en el editor."""
    pl = _mi_plantilla(db, plantilla_id, usuario)
    datos = storage.leer(Path(pl.archivo_url).name)
    if datos is None:
        raise HTTPException(status_code=404, detail="No se encontró el archivo de la plantilla")
    return {"html": documentos.docx_a_html(datos)}


# ── Listados ───────────────────────────────────────────────────

@router.get("/recibidos", response_model=list[ProyectoSchema])
async def proyectos_recibidos(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Proyectos que me enviaron (bandeja de entrada)."""
    return (
        db.query(Proyecto)
        .filter(Proyecto.destinatario_id == usuario.id)
        .order_by(Proyecto.fecha_envio.desc())
        .all()
    )


@router.get("/enviados", response_model=list[ProyectoSchema])
async def proyectos_enviados(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Proyectos que yo envié."""
    return (
        db.query(Proyecto)
        .filter(Proyecto.remitente_id == usuario.id)
        .order_by(Proyecto.fecha_envio.desc())
        .all()
    )


@router.get("/expediente/{expediente_id}", response_model=list[ProyectoSchema])
async def proyectos_de_expediente(expediente_id: int, db: Session = Depends(get_db)):
    """Proyectos asociados a un expediente (se ven en la ficha)."""
    return (
        db.query(Proyecto)
        .filter(Proyecto.expediente_id == expediente_id)
        .order_by(Proyecto.fecha_envio.desc())
        .all()
    )


# ── Enviar un proyecto ─────────────────────────────────────────

@router.post("/", response_model=ProyectoSchema)
async def enviar_proyecto(
    expediente_id: int = Form(...),
    destinatario_id: int = Form(...),
    titulo: str = Form(""),
    datos: str = Form(""),
    archivos: List[UploadFile] = File(default=[]),
    documento_html: str = Form(""),
    plantilla_id: int | None = Form(None),
    documento_word: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Crea y envía un proyecto a la firma. Estampa 'Pase a la firma' = hoy.
    El proyecto de dictamen llega de dos formas: un Word adjuntado
    (documento_word) o redactado en el editor (documento_html, sobre la
    plantilla plantilla_id o en hoja en blanco)."""
    expediente = db.query(Expediente).filter(Expediente.id == expediente_id).first()
    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")

    destinatario = db.query(Usuario).filter(Usuario.id == destinatario_id).first()
    if not destinatario:
        raise HTTPException(status_code=404, detail="Destinatario no encontrado")
    if destinatario.rol not in ("secretaria", "defensora"):
        raise HTTPException(status_code=400, detail="Solo se puede enviar a una secretaria o a la defensora")

    guardados = _guardar_archivos(archivos)

    # Estampar pase a la firma en el listado
    entrada = _entrada_para_estampar(db, expediente)
    entrada.pase_firma = hoy()

    proyecto = Proyecto(
        expediente_id=expediente_id,
        entrada_salida_id=entrada.id,
        remitente_id=usuario.id,
        destinatario_id=destinatario_id,
        titulo=titulo or f"Proyecto {expediente.numero}",
        datos=datos,
        estado="enviado",
        version=1,
        archivos=guardados,
        comentarios=[{
            "autor": usuario.nombre, "rol": usuario.rol,
            "fecha": ahora().isoformat(), "texto": datos or "Proyecto enviado", "tipo": "envio",
        }],
    )
    if documento_word is not None and documento_word.filename:
        _cargar_word_en_proyecto(proyecto, documento_word)
    elif documento_html.strip():
        proyecto.documento_html = documentos.sanitizar(documento_html)
        if plantilla_id:
            proyecto.documento_base_url = _mi_plantilla(db, plantilla_id, usuario).archivo_url
    if proyecto.documento_html:
        proyecto.documento_actualizado = ahora()
        proyecto.documento_editor = usuario.nombre
        _agregar_version(proyecto, usuario, "envio", siempre=True)
    db.add(proyecto)

    destino_txt = "la Defensora" if destinatario.rol == "defensora" else destinatario.nombre
    db.add(Notificacion(
        usuario_id=destinatario_id,
        tipo="proyecto_recibido",
        contenido=f"{usuario.nombre} envió a la firma de {destino_txt} — expte. {expediente.numero}",
        expediente_id=expediente_id,
    ))
    _registrar_historial(db, expediente_id, usuario, "otro",
                         f"Envió a la firma de {destino_txt}.")

    db.commit()
    db.refresh(proyecto)
    return proyecto


# ── Acciones del destinatario / remitente ──────────────────────

def _get_proyecto(db, proyecto_id) -> Proyecto:
    p = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return p


@router.post("/{proyecto_id}/devolver", response_model=ProyectoSchema)
async def devolver_con_comentarios(
    proyecto_id: int,
    comentario: str = Form(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """El destinatario devuelve el proyecto con comentarios para corregir."""
    p = _get_proyecto(db, proyecto_id)
    if p.destinatario_id != usuario.id:
        raise HTTPException(status_code=403, detail="Solo el destinatario puede devolver el proyecto")

    p.estado = "en_correccion"
    _agregar_version(p, usuario, "devolucion")
    p.comentarios = (p.comentarios or []) + [{
        "autor": usuario.nombre, "rol": usuario.rol,
        "fecha": ahora().isoformat(), "texto": comentario, "tipo": "devolucion",
    }]
    db.add(Notificacion(
        usuario_id=p.remitente_id,
        tipo="proyecto_devuelto",
        contenido=f"{usuario.nombre} lo devolvió con comentarios — expte. {p.expediente_numero}",
        expediente_id=p.expediente_id,
    ))
    _registrar_historial(db, p.expediente_id, usuario, "otro",
                         f"Proyecto devuelto con comentarios: {comentario}")
    from app.utils.auditoria import registrar
    registrar(db, usuario, "devolvió", "proyecto", f"Expte. {p.expediente_numero} — {p.titulo}")
    db.commit()
    db.refresh(p)
    return p


@router.post("/{proyecto_id}/reenviar", response_model=ProyectoSchema)
async def reenviar_corregido(
    proyecto_id: int,
    comentario: str = Form(""),
    archivos: List[UploadFile] = File(default=[]),
    documento_word: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """El remitente reenvía una versión corregida tras una devolución
    (corregida en el editor, o reemplazada por otro Word)."""
    p = _get_proyecto(db, proyecto_id)
    if p.remitente_id != usuario.id:
        raise HTTPException(status_code=403, detail="Solo el remitente puede reenviar el proyecto")

    if documento_word is not None and documento_word.filename:
        _cargar_word_en_proyecto(p, documento_word)
        p.documento_actualizado = ahora()
        p.documento_editor = usuario.nombre
    _agregar_version(p, usuario, "correccion", siempre=True)
    guardados = _guardar_archivos(archivos)
    p.estado = "enviado"
    p.version = (p.version or 1) + 1
    p.fecha_envio = ahora()
    if guardados:
        p.archivos = (p.archivos or []) + guardados
    p.comentarios = (p.comentarios or []) + [{
        "autor": usuario.nombre, "rol": usuario.rol,
        "fecha": ahora().isoformat(),
        "texto": comentario or f"Versión corregida (v{p.version})", "tipo": "correccion",
    }]

    # Re-estampar pase a la firma con la fecha del reenvío
    if p.entrada_salida_id:
        entrada = db.query(EntradaSalida).filter(EntradaSalida.id == p.entrada_salida_id).first()
        if entrada:
            entrada.pase_firma = hoy()

    db.add(Notificacion(
        usuario_id=p.destinatario_id,
        tipo="proyecto_recibido",
        contenido=f"{usuario.nombre} reenvió una versión corregida del expte. {p.expediente_numero}",
        expediente_id=p.expediente_id,
    ))
    _registrar_historial(db, p.expediente_id, usuario, "otro",
                         f"Reenvió versión corregida (v{p.version}).")
    db.commit()
    db.refresh(p)
    return p


@router.post("/{proyecto_id}/reenviar-a-defensora", response_model=ProyectoSchema)
async def reenviar_a_defensora(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """La secretaria reenvía el proyecto a la defensora."""
    if usuario.rol != "secretaria":
        raise HTTPException(status_code=403, detail="Solo una secretaria puede reenviar a la defensora")
    p = _get_proyecto(db, proyecto_id)
    if p.destinatario_id != usuario.id:
        raise HTTPException(status_code=403, detail="Solo podés reenviar un proyecto que recibiste")

    defensora = db.query(Usuario).filter(Usuario.rol == "defensora", Usuario.activo == True).first()
    if not defensora:
        raise HTTPException(status_code=400, detail="No hay una defensora cargada en el sistema")

    p.destinatario_id = defensora.id
    p.estado = "enviado"
    p.fecha_envio = ahora()
    p.comentarios = (p.comentarios or []) + [{
        "autor": usuario.nombre, "rol": usuario.rol,
        "fecha": ahora().isoformat(),
        "texto": f"Reenviado a la defensora ({defensora.nombre})", "tipo": "envio",
    }]
    db.add(Notificacion(
        usuario_id=defensora.id,
        tipo="proyecto_recibido",
        contenido=f"{usuario.nombre} envió a la firma de la Defensora — expte. {p.expediente_numero}",
        expediente_id=p.expediente_id,
    ))
    _registrar_historial(db, p.expediente_id, usuario, "otro", "Proyecto derivado a la defensora.")
    db.commit()
    db.refresh(p)
    return p


@router.post("/{proyecto_id}/subido", response_model=ProyectoSchema)
async def marcar_subido(
    proyecto_id: int,
    comentario: str = Form(""),
    dictamen: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    El destinatario confirma que subió el dictamen al expediente real.
    Si el proyecto viajó dentro del sistema, el PDF de la versión final se arma
    solo; si no (proyectos viejos), hay que adjuntar el PDF del dictamen subido.
    Ese archivo queda guardado como dictamen del expediente.
    Estampa 'Subido al Lex' = hoy en el listado y notifica al remitente, diciéndole
    si salió tal cual lo armó o con correcciones.
    """
    p = _get_proyecto(db, proyecto_id)
    if p.destinatario_id != usuario.id:
        raise HTTPException(status_code=403, detail="Solo el destinatario puede marcarlo como subido")
    if p.estado == "subido":
        raise HTTPException(status_code=400, detail="Este proyecto ya figura como subido")

    tiene_archivo = dictamen is not None and bool(dictamen.filename)
    if not tiene_archivo and not p.documento_html:
        raise HTTPException(status_code=400, detail="Tenés que adjuntar el PDF del dictamen subido")

    # Guardar el dictamen final
    if tiene_archivo:
        guardados = _guardar_archivos([dictamen])
    else:
        try:
            pdf = documentos.armar_pdf(_base_bytes(p), p.documento_html)
            guardados = [{"nombre": "Dictamen final - " + _nombre_archivo(p, ".pdf"),
                          "url": _guardar_bytes(pdf, ".pdf", "application/pdf")}]
        except Exception as e:
            print(f"[!] No se pudo armar el PDF del dictamen {p.id}: {e}")
            guardados = []
    dictamen_url = guardados[0]["url"] if guardados else None

    corregido = _corregido_por_firmante(p)
    _agregar_version(p, usuario, "final", siempre=True)

    p.estado = "subido"
    p.fecha_subido = ahora()
    if guardados:
        p.archivos = (p.archivos or []) + guardados
    p.comentarios = (p.comentarios or []) + [{
        "autor": usuario.nombre, "rol": usuario.rol,
        "fecha": ahora().isoformat(),
        "texto": comentario or "Subió el dictamen al expediente", "tipo": "subido",
    }]

    # Estampar subido al lex en el listado
    if p.entrada_salida_id:
        entrada = db.query(EntradaSalida).filter(EntradaSalida.id == p.entrada_salida_id).first()
        if entrada:
            entrada.subido_lex = hoy()
            entrada.subido_defensa = True

    db.add(Notificacion(
        usuario_id=p.remitente_id,
        tipo="proyecto_subido",
        contenido=(
            f"{usuario.nombre} subió el dictamen con correcciones — expte. {p.expediente_numero}. "
            "Abrí el proyecto en A la firma para ver la versión final y los cambios."
            if corregido else
            f"{usuario.nombre} subió el dictamen tal cual lo armaste — expte. {p.expediente_numero}"
            if corregido is False else
            f"{usuario.nombre} subió el dictamen al expediente — expte. {p.expediente_numero}"
        ),
        expediente_id=p.expediente_id,
    ))
    # Guardar el dictamen como intervención del expediente (queda en su "mundo")
    db.add(Historial(
        expediente_id=p.expediente_id,
        tipo="dictamen",
        descripcion=f"Dictamen subido al expediente por {usuario.nombre}." + (f" {comentario}" if comentario else ""),
        usuario_id=usuario.id,
        archivo_url=dictamen_url,
    ))
    from app.utils.auditoria import registrar
    registrar(db, usuario, "subió", "proyecto", f"Dictamen subido — expte. {p.expediente_numero}")
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{proyecto_id}")
async def eliminar_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    _actual: Usuario = Depends(requerir_rol("admin", "defensora")),
):
    """Borra un proyecto 'a la firma' (administradores / defensora). Pensado
    para corregir datos de prueba; no afecta el 'Pase a la firma' / 'Subido al
    Lex' ya estampados en el listado."""
    p = _get_proyecto(db, proyecto_id)
    db.delete(p)
    db.commit()
    return {"ok": True}


# ── Documento: ver, corregir y descargar ───────────────────────
# (van al final: GET /{proyecto_id} no debe tapar /recibidos, /plantillas, etc.)

@router.get("/{proyecto_id}", response_model=ProyectoDetalle)
async def ver_proyecto(proyecto_id: int, db: Session = Depends(get_db),
                       usuario: Usuario = Depends(obtener_usuario_actual)):
    """Proyecto completo, con el documento y sus versiones."""
    p = _get_proyecto(db, proyecto_id)
    det = ProyectoDetalle.model_validate(p)
    if p.estado == "subido":
        # Comparar lo que armó el despachante con la versión final (la anterior a "final")
        versiones = list(p.documento_versiones or [])
        propias = [v for v in versiones if v.get("autor_id") == p.remitente_id and v.get("motivo") != "final"]
        if propias and versiones:
            det.corregido_por_firmante = documentos.formato_plano(propias[-1].get("html")) != \
                documentos.formato_plano(versiones[-1].get("html"))
    else:
        det.corregido_por_firmante = _corregido_por_firmante(p)
    return det


@router.put("/{proyecto_id}/documento")
async def guardar_documento(
    proyecto_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Guarda las correcciones hechas en el editor (autoguardado).
    Corrige quien tiene el proyecto en ese momento: el destinatario mientras está
    a la firma, el remitente mientras está devuelto."""
    p = _get_proyecto(db, proyecto_id)
    if not _puede_editar(p, usuario):
        raise HTTPException(status_code=403, detail="En este momento el proyecto no lo podés modificar")
    html = documentos.sanitizar(str(datos.get("html") or ""))
    if len(html) > 2_000_000:
        raise HTTPException(status_code=400, detail="El documento es demasiado largo")
    if documentos.formato_plano(html) != documentos.formato_plano(p.documento_html or ""):
        p.documento_html = html
        p.documento_editado = True
        p.documento_actualizado = ahora()
        p.documento_editor = usuario.nombre
        db.commit()
    return {"ok": True, "actualizado": p.documento_actualizado, "editor": p.documento_editor}


@router.get("/{proyecto_id}/descargar")
async def descargar_documento(
    proyecto_id: int,
    formato: str = "docx",
    version: int | None = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """El proyecto en Word o PDF (la versión actual, o una versión anterior)."""
    from urllib.parse import quote
    p = _get_proyecto(db, proyecto_id)
    if not p.documento_html:
        raise HTTPException(status_code=404, detail="Este proyecto no tiene documento")
    html = p.documento_html
    sufijo = ""
    if version:
        v = next((x for x in (p.documento_versiones or []) if x.get("n") == version), None)
        if not v:
            raise HTTPException(status_code=404, detail="Versión no encontrada")
        html = v.get("html") or ""
        sufijo = f" (versión {version})"

    if formato == "pdf":
        datos = documentos.armar_pdf(_base_bytes(p), html)
        mime, ext = "application/pdf", ".pdf"
    else:
        datos = None
        # Word adjuntado que nadie tocó: se devuelve el original, idéntico
        if p.documento_original_url and not p.documento_editado and \
                documentos.formato_plano(html) == documentos.formato_plano(p.documento_html):
            datos = storage.leer(Path(p.documento_original_url).name)
        if datos is None:
            datos = documentos.armar_docx(_base_bytes(p), html)
        mime, ext = _DOCX_MIME, ".docx"
    nombre = _nombre_archivo(p, "") + sufijo + ext
    return Response(
        content=datos, media_type=mime,
        headers={"Content-Disposition": f"attachment; filename=\"proyecto{ext}\"; filename*=UTF-8''{quote(nombre)}"},
    )
