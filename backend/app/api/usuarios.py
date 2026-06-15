"""
Endpoints de usuarios y autenticación.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from app.database import get_db
from app.models import Usuario
from app.schemas import Usuario as UsuarioSchema, UsuarioCreate, UsuarioLogin, TokenResponse
from app.utils.auth import hashear_contraseña, verificar_contraseña, crear_access_token
from app.utils.deps import obtener_usuario_actual, requerir_rol
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
    _actual: Usuario = Depends(requerir_rol("admin")),
):
    """
    Registra un nuevo usuario (solo admin puede hacer esto).
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
async def listar_usuarios(db: Session = Depends(get_db)):
    """
    Lista todos los usuarios.
    """
    usuarios = db.query(Usuario).filter(Usuario.activo == True).all()
    return usuarios


@router.get("/me", response_model=UsuarioSchema)
async def obtener_perfil(usuario: Usuario = Depends(obtener_usuario_actual)):
    """
    Obtiene el usuario autenticado actualmente (según el token Bearer).
    """
    return usuario


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
