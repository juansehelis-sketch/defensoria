"""
Endpoints de usuarios y autenticación.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body, Request
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from app.database import get_db
from app.models import Usuario, RegistroIngreso
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


def _es_privada(ip: str | None) -> bool:
    return not ip or ip in ("localhost", "::1", "testclient") or ip.startswith(
        ("127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.30.", "172.31."))


def _dispositivo(ua: str) -> str:
    """"Computadora · Windows · Chrome" a partir del user-agent del navegador."""
    ua = ua or ""
    if "verificacion-automatica" in ua:
        return "Verificación automática (pruebas del sistema)"
    so = ("Android" if "Android" in ua else "iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua
          else "Windows" if "Windows" in ua else "Mac" if "Mac OS X" in ua else "Linux" if "Linux" in ua else "")
    nav = ("Edge" if "Edg/" in ua else "Opera" if "OPR/" in ua else "Chrome" if "Chrome/" in ua
           else "Firefox" if "Firefox/" in ua else "Safari" if "Safari/" in ua else "")
    tipo = "Celular" if ("Mobile" in ua or so in ("Android", "iPhone")) else "Tablet" if so == "iPad" else "Computadora"
    if not so and not nav:
        return (ua[:60] or "desconocido")
    return " · ".join(x for x in (tipo, so, nav) if x)


def _registrar_intento(db: Session, request: Request, email: str, usuario, exito: bool):
    ua = request.headers.get("user-agent", "")
    db.add(RegistroIngreso(
        usuario_id=usuario.id if usuario else None,
        email=(email or "")[:120],
        exito=exito,
        fecha=ahora(),
        ip=_ip_de(request),
        dispositivo=_dispositivo(ua),
        navegador=ua[:300],
    ))


def _resolver_ubicaciones(db: Session, registros):
    """Completa lugar/proveedor por IP (ip-api, de a 100 por consulta). Queda guardado."""
    import urllib.request, json
    pendientes = sorted({r.ip for r in registros if r.ip and r.lugar is None and not _es_privada(r.ip)})
    datos = {}
    for i in range(0, len(pendientes), 100):
        lote = pendientes[i:i + 100]
        try:
            req = urllib.request.Request(
                "http://ip-api.com/batch?fields=status,country,regionName,city,district,isp,org,mobile,proxy,hosting,query",
                data=json.dumps(lote).encode(), headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=6) as r:
                for d in json.loads(r.read().decode()):
                    datos[d.get("query")] = d
        except Exception as e:
            print(f"[!] No se pudo consultar la ubicación de las IP: {e}")
            break
    cambio = False
    for r in registros:
        if r.lugar is not None:
            continue
        if _es_privada(r.ip):
            r.lugar, r.proveedor = "Red interna", None
            cambio = True
            continue
        d = datos.get(r.ip)
        if not d:
            continue
        if d.get("status") != "success":
            r.lugar = "no se pudo estimar"
        else:
            r.lugar = ", ".join(x for x in (d.get("district"), d.get("city"), d.get("regionName"), d.get("country")) if x) or "—"
            org, isp = (d.get("org") or "").strip(), (d.get("isp") or "").strip()
            r.proveedor = (f"{org} ({isp})" if org and isp and org.lower() != isp.lower() else (org or isp)) or None
            r.tipo_conexion = ("datos móviles" if d.get("mobile") else
                               "VPN / servidor" if (d.get("proxy") or d.get("hosting")) else None)
        cambio = True
    if cambio:
        db.commit()


@router.post("/login", response_model=TokenResponse)
async def login(usuario_login: UsuarioLogin, request: Request, db: Session = Depends(get_db)):
    """
    Login de usuario. Retorna JWT token y registra el ingreso (fecha/hora/IP).
    """
    # Buscar usuario por email
    usuario = db.query(Usuario).filter(Usuario.email == usuario_login.email).first()

    if not usuario or not verificar_contraseña(usuario_login.contraseña, usuario.contraseña_hash):
        _registrar_intento(db, request, usuario_login.email, usuario, False)
        db.commit()
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
    _registrar_intento(db, request, usuario_login.email, usuario, True)
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


@router.post("/vaciar-historial")
async def vaciar_papelera_y_auditoria(
    db: Session = Depends(get_db),
    _actual: Usuario = Depends(requerir_rol(*ADMIN_USUARIOS)),
):
    """
    Vacía la Papelera del listado y el Historial de cambios (Auditoría).
    Ninguna de las dos se vacía sola al borrar algo: guardan una copia de todo
    lo que se borró, aunque el dato ya no exista. Útil antes de mostrarle el
    sistema a alguien nuevo, para no dejar restos de pruebas o de casos viejos.
    No toca nada del trabajo actual (expedientes, audiencias, proyectos, etc.).
    """
    from app.models import BorradoListado, Auditoria
    n_papelera = db.query(BorradoListado).delete(synchronize_session=False)
    n_auditoria = db.query(Auditoria).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "papelera": n_papelera, "auditoria": n_auditoria}


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


@router.get("/ingresos/historial")
async def historial_ingresos(
    request: Request,
    usuario_id: int | None = None,
    solo_fallidos: bool = False,
    limite: int = 300,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(obtener_usuario_actual),
):
    """
    Todos los ingresos (y los intentos con clave incorrecta), del más nuevo al
    más viejo, con hora exacta, conexión, dispositivo y ubicación aproximada.
    Solo lo ve el titular del sistema. "mi_ip" es la conexión desde la que se
    consulta, para reconocer los ingresos propios.
    """
    if actual.email != EMAIL_VE_INGRESOS:
        raise HTTPException(status_code=403, detail="No tenés permiso para ver esto.")
    q = db.query(RegistroIngreso)
    if usuario_id:
        q = q.filter(RegistroIngreso.usuario_id == usuario_id)
    if solo_fallidos:
        q = q.filter(RegistroIngreso.exito == False)
    registros = q.order_by(RegistroIngreso.fecha.desc()).limit(max(1, min(limite, 1000))).all()
    _resolver_ubicaciones(db, registros)
    nombres = {u.id: u.nombre for u in db.query(Usuario).all()}
    return {
        "mi_ip": _ip_de(request),
        "registros": [{
            "id": r.id, "fecha": r.fecha, "exito": r.exito, "email": r.email,
            "usuario_id": r.usuario_id, "nombre": nombres.get(r.usuario_id),
            "ip": r.ip, "dispositivo": r.dispositivo, "lugar": r.lugar,
            "proveedor": r.proveedor, "tipo_conexion": r.tipo_conexion,
        } for r in registros],
    }


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
    """Edita nombre / email / rol / activo de un usuario (administradores / defensora)."""
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if datos.nombre is not None:
        u.nombre = datos.nombre.strip()
    if datos.email is not None:
        nuevo_email = datos.email.strip()
        if not nuevo_email:
            raise HTTPException(status_code=400, detail="El usuario no puede quedar vacío.")
        existente = db.query(Usuario).filter(Usuario.email == nuevo_email, Usuario.id != usuario_id).first()
        if existente:
            raise HTTPException(status_code=400, detail="Ese usuario ya está en uso.")
        u.email = nuevo_email
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
