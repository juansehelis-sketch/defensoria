"""
Utilidades de autenticación y autorización.
Usa bcrypt directamente (más estable que passlib en Python moderno).
"""

import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
from app.config import settings


def hashear_contraseña(contraseña: str) -> str:
    """
    Hashea una contraseña con bcrypt.

    Se guarda en minúsculas: las mayúsculas no cuentan. El teclado del celular
    pone en mayúscula la primera letra sin que uno se dé cuenta, y eso dejaba
    a la gente afuera con la contraseña correcta.
    """
    # bcrypt trabaja con bytes; tope de 72 bytes por diseño
    pwd_bytes = contraseña.lower().encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verificar_contraseña(contraseña: str, hash: str) -> bool:
    """
    Verifica una contraseña contra su hash, sin distinguir mayúsculas.

    Se prueba tal cual se escribió y después en minúsculas: así siguen andando
    las contraseñas viejas (guardadas antes de este cambio, que podían tener
    mayúsculas) y también las nuevas.
    """
    for intento in (contraseña, contraseña.lower()):
        try:
            if bcrypt.checkpw(intento.encode("utf-8")[:72], hash.encode("utf-8")):
                return True
        except Exception:
            return False
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
