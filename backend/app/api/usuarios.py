"""
Endpoints de usuarios y autenticación.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from datetime import timedelta
from app.database import get_db
from app.models import Usuario
from app.schemas import Usuario as UsuarioSchema, UsuarioCreate, UsuarioUpdate, UsuarioLogin, TokenResponse
from app.utils.auth import hashear_contraseña, verificar_contraseña, crear_access_token
from app.utils.deps import obtener_usuario_actual, requerir_rol

# Quién puede administrar usuarios (altas/bajas/roles/contraseñas).
ADMIN_USUARIOS = ("admin", "defensora")
from app.config import settings

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])


@router.post("/login", response_model=TokenResponse)
async def login(usuario_login: UsuarioLogin, db: Session = Depends(get_db)):
    """
    Login de usuario. Retorna JWT token.
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
        contraseña_hash=hashear_contraseña(usuario_create.contraseña),
    )

    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    return nuevo_usuario


@router.get("/", response_model=list[UsuarioSchema])
async def listar_usuarios(todos: bool = False, db: Session = Depends(get_db)):
    """
    Lista usuarios. Por defecto solo los activos (para los selectores de
    asignación). Con ?todos=true trae también los desactivados (para el panel).
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
    db.commit()
    return {"ok": True}


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
    db.commit()
    return {"ok": True}


@router.get("/{usuario_id}", response_model=UsuarioSchema)
async def obtener_usuario(usuario_id: int, db: Session = Depends(get_db)):
    """
    Obtiene un usuario específico por ID.
    """
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()

    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    return usuario
