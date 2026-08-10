"""
Endpoints de usuarios y autenticación.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body, Request
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from app.database import get_db
from app.models import Usuario
from app.schemas import Usuario as UsuarioSchema, UsuarioCreate, UsuarioUpdate, UsuarioLogin, TokenResponse
from app.utils.auth import hashear_contraseña, verificar_contraseña, crear_access_token
from app.utils.deps import obtener_usuario_actual, requerir_rol

# Quién puede administrar usuarios (altas/bajas/roles/contraseñas).
ADMIN_USUARIOS = ("admin", "defensora")
# Único usuario que puede ver los ingresos (fecha/hora/IP/ubicación) del equipo.
EMAIL_VE_INGRESOS = "jheliszkowski@mpd.gov.ar"
from app.config import settings
from app.utils.tiempo import ahora

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])


def _ip_de(request: Request) -> str | None:
    """IP real del cliente. En Render (detrás de un proxy) viene en X-Forwarded-For."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def _ubicacion_de_ip(ip: str | None) -> str | None:
    """Ubicación aproximada por IP (ciudad/provincia/país). Best-effort, sin clave."""
    if not ip or ip in ("localhost", "::1") or ip.startswith(("127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.30.", "172.31.")):
        return None
    try:
        import urllib.request, json
        url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city"
        with urllib.request.urlopen(url, timeout=3) as r:
            d = json.loads(r.read().decode())
        if d.get("status") == "success":
            partes = [d.get("city"), d.get("regionName"), d.get("country")]
            return ", ".join(p for p in partes if p) or None
    except Exception:
        return None
    return None


@router.post("/login", response_model=TokenResponse)
async def login(usuario_login: UsuarioLogin, request: Request, db: Session = Depends(get_db)):
    """
    Login de usuario. Retorna JWT token y registra el ingreso (fecha/hora/IP).
    """
    # Buscar usuario por email
    usuario = db.query(Usuario).filter(Usuario.email == usuario_login.email).first()

    if not usuario or not verificar_contraseña(usuario_login.contraseña, usuario.contraseña_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos"
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario desactivado"
        )

    # Registrar el ingreso. La ubicación se resuelve después (al mirar el panel),
    # para no demorar el login con una llamada externa: guardamos fecha/hora e IP,
    # y limpiamos la ubicación para que se recalcule con la IP nueva.
    usuario.ultimo_ingreso = ahora()
    usuario.ultimo_ingreso_ip = _ip_de(request)
    usuario.ultimo_ingreso_lugar = None
    db.commit()

    # Crear token
    access_token = crear_access_token(
        data={"sub": usuario.email, "id": usuario.id, "rol": usuario.rol}
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/registrar", response_model=UsuarioSchema)
async def registrar(
    usuario_create: UsuarioCreate,
    db: Session = Depends(get_db),
    _actual: Usuario = Depends(requerir_rol(*ADMIN_USUARIOS)),
):
    """
    Registra un nuevo usuario (solo administradores / defensora).
    """
    # Verificar si el email ya existe
    usuario_existente = db.query(Usuario).filter(Usuario.email == usuario_create.email).first()
    if usuario_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El email ya está registrado"
        )

    # Crear nuevo usuario
    nuevo_usuario = Usuario(
        email=usuario_create.email,
        nombre=usuario_create.nombre,
        rol=usuario_create.rol,
        cargo=(usuario_create.cargo or "").strip() or None,
        contraseña_hash=hashear_contraseña(usuario_create.contraseña),
    )

    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    return nuevo_usuario


@router.get("/", response_model=list[UsuarioSchema])
async def listar_usuarios(
    todos: bool = False,
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """
    Lista usuarios (requiere login). Por defecto solo los activos (para los
    selectores de asignación). Con ?todos=true trae también los desactivados
    (para el panel).
    """
    q = db.query(Usuario)
    if not todos:
        q = q.filter(Usuario.activo == True)
    return q.order_by(Usuario.activo.desc(), Usuario.nombre.asc()).all()


@router.get("/me", response_model=UsuarioSchema)
async def obtener_perfil(usuario: Usuario = Depends(obtener_usuario_actual)):
    """
    Obtiene el usuario autenticado actualmente (según el token Bearer).
    """
    return usuario


@router.post("/me/password")
async def cambiar_mi_password(
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    actual: Usuario = Depends(obtener_usuario_actual),
):
    """Cada usuario cambia su propia contraseña (verificando la actual)."""
    if not verificar_contraseña(datos.get("actual") or "", actual.contraseña_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    nueva = (datos.get("nueva") or "").strip()
    if len(nueva) < 4:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres.")
    actual.contraseña_hash = hashear_contraseña(nueva)
    actual.debe_cambiar_clave = False
    db.commit()
    return {"ok": True}


@router.post("/me/clave-inicial")
async def elegir_clave_inicial(
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    actual: Usuario = Depends(obtener_usuario_actual),
):
    """
    Primer ingreso después de un reinicio de claves: la persona ya entró con su
    contraseña vieja y acá elige la nueva (sin repetir la vieja). Solo funciona
    si está marcada para cambiar la contraseña.
    """
    if not actual.debe_cambiar_clave:
        raise HTTPException(status_code=400, detail="Tu contraseña no está pendiente de cambio.")
    nueva = (datos.get("nueva") or "").strip()
    if len(nueva) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres.")
    actual.contraseña_hash = hashear_contraseña(nueva)
    actual.debe_cambiar_clave = False
    db.commit()
    return {"ok": True}


@router.post("/reiniciar-claves")
async def reiniciar_todas_las_claves(
    db: Session = Depends(get_db),
    actual: Usuario = Depends(requerir_rol(*ADMIN_USUARIOS)),
):
    """
    Marca a todos los usuarios activos (salvo quien aprieta el botón) para que
    elijan contraseña nueva: entran una vez más con la clave actual y la app
    les pide cambiarla antes de seguir. Pensado para el estreno del sistema.
    """
    n = (
        db.query(Usuario)
        .filter(Usuario.activo == True, Usuario.id != actual.id)
        .update({"debe_cambiar_clave": True}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "marcados": n}


@router.get("/ingresos")
async def ver_ingresos(
    db: Session = Depends(get_db),
    actual: Usuario = Depends(obtener_usuario_actual),
):
    """
    Últimos ingresos de cada integrante (fecha/hora, IP y ubicación aproximada).
    Restringido: solo lo puede ver un único usuario (el titular del sistema).
    """
    if actual.email != EMAIL_VE_INGRESOS:
        raise HTTPException(status_code=403, detail="No tenés permiso para ver esto.")

    usuarios = db.query(Usuario).order_by(Usuario.nombre.asc()).all()
    # Resolver la ubicación que falte (se limpió en el último login) y cachearla.
    cambio = False
    for u in usuarios:
        if u.ultimo_ingreso_ip and not u.ultimo_ingreso_lugar:
            loc = _ubicacion_de_ip(u.ultimo_ingreso_ip)
            if loc:
                u.ultimo_ingreso_lugar = loc
                cambio = True
    if cambio:
        db.commit()

    return [{
        "id": u.id, "nombre": u.nombre, "email": u.email, "rol": u.rol,
        "cargo": u.cargo, "activo": u.activo,
        "ultimo_ingreso": u.ultimo_ingreso,
        "ip": u.ultimo_ingreso_ip,
        "ubicacion": u.ultimo_ingreso_lugar,
    } for u in usuarios]


@router.delete("/{usuario_id}")
async def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(requerir_rol(*ADMIN_USUARIOS)),
):
    """
    Borra DEFINITIVAMENTE un usuario (admin / defensora). Suelta las referencias
    (expedientes, historial, proyectos, auditoría) y borra sus avisos y tareas.
    No deja borrar al último administrador/defensora, para no quedar sin acceso.
    """
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if u.rol in ADMIN_USUARIOS:
        otros = (
            db.query(Usuario)
            .filter(Usuario.id != usuario_id, Usuario.rol.in_(ADMIN_USUARIOS), Usuario.activo == True)
            .count()
        )
        if otros == 0:
            raise HTTPException(status_code=400, detail="No podés borrar al último administrador o defensora.")

    from app.models import Expediente, Historial, Proyecto, Notificacion, Tarea, Auditoria
    db.query(Expediente).filter(Expediente.despachante_id == usuario_id).update({"despachante_id": None}, synchronize_session=False)
    db.query(Historial).filter(Historial.usuario_id == usuario_id).update({"usuario_id": None}, synchronize_session=False)
    db.query(Proyecto).filter(Proyecto.remitente_id == usuario_id).update({"remitente_id": None}, synchronize_session=False)
    db.query(Proyecto).filter(Proyecto.destinatario_id == usuario_id).update({"destinatario_id": None}, synchronize_session=False)
    db.query(Auditoria).filter(Auditoria.usuario_id == usuario_id).update({"usuario_id": None}, synchronize_session=False)
    db.query(Notificacion).filter(Notificacion.usuario_id == usuario_id).delete(synchronize_session=False)
    db.query(Tarea).filter(Tarea.usuario_id == usuario_id).delete(synchronize_session=False)

    nombre = u.nombre
    db.delete(u)
    db.commit()
    return {"ok": True, "borrado": nombre}


@router.put("/{usuario_id}", response_model=UsuarioSchema)
async def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioUpdate,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(requerir_rol(*ADMIN_USUARIOS)),
):
    """Edita nombre / rol / activo de un usuario (administradores / defensora)."""
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if datos.nombre is not None:
        u.nombre = datos.nombre.strip()
    if datos.rol is not None:
        u.rol = datos.rol
    if datos.cargo is not None:
        u.cargo = datos.cargo.strip() or None
    if datos.activo is not None:
        if u.id == actual.id and not datos.activo:
            raise HTTPException(status_code=400, detail="No podés desactivar tu propia cuenta.")
        u.activo = datos.activo
    db.commit()
    db.refresh(u)
    return u


@router.post("/{usuario_id}/password")
async def resetear_password(
    usuario_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    _a: Usuario = Depends(requerir_rol(*ADMIN_USUARIOS)),
):
    """Resetea la contraseña de otro usuario (administradores / defensora)."""
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    nueva = (datos.get("contraseña") or "").strip()
    if len(nueva) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres.")
    u.contraseña_hash = hashear_contraseña(nueva)
    # La persona entra con esta clave provisoria y la app le pide elegir una propia.
    u.debe_cambiar_clave = True
    db.commit()
    return {"ok": True}


@router.get("/{usuario_id}", response_model=UsuarioSchema)
async def obtener_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    _u: Usuario = Depends(obtener_usuario_actual),
):
    """
    Obtiene un usuario específico por ID (requiere login).
    """
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()

    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    return usuario
