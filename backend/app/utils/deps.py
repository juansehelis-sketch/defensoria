"""
Dependencias compartidas para los endpoints (autenticación / autorización).
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Usuario
from app.utils.auth import decodificar_token

# Esquema OAuth2: el token se manda en el header Authorization: Bearer <token>
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/usuarios/login")

# Excepción reutilizable para credenciales inválidas
_excepcion_credenciales = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No se pudieron validar las credenciales",
    headers={"WWW-Authenticate": "Bearer"},
)


def obtener_usuario_actual(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Devuelve el usuario autenticado a partir del token JWT.
    Se usa como dependencia en los endpoints protegidos.
    """
    try:
        payload = decodificar_token(token)
        email = payload.get("sub")
        if email is None:
            raise _excepcion_credenciales
    except Exception:
        raise _excepcion_credenciales

    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if usuario is None or not usuario.activo:
        raise _excepcion_credenciales

    return usuario


def requerir_rol(*roles_permitidos: str):
    """
    Genera una dependencia que exige que el usuario tenga uno de los roles dados.
    Ejemplo de uso: Depends(requerir_rol("admin", "defensora"))
    """
    def verificador(usuario: Usuario = Depends(obtener_usuario_actual)) -> Usuario:
        if usuario.rol not in roles_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tenés permisos para esta acción",
            )
        return usuario

    return verificador
