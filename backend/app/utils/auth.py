"""
Utilidades de autenticación y autorización.
Usa bcrypt directamente (más estable que passlib en Python moderno).
"""

import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
from app.config import settings


def hashear_contraseña(contraseña: str) -> str:
    """Hashea una contraseña con bcrypt."""
    # bcrypt trabaja con bytes; tope de 72 bytes por diseño
    pwd_bytes = contraseña.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verificar_contraseña(contraseña: str, hash: str) -> bool:
    """Verifica una contraseña contra su hash."""
    try:
        pwd_bytes = contraseña.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hash.encode("utf-8"))
    except Exception:
        return False


def crear_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Crea un JWT access token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )

    return encoded_jwt


def decodificar_token(token: str) -> dict:
    """Decodifica un JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception("Token expirado")
    except jwt.InvalidTokenError:
        raise Exception("Token inválido")
