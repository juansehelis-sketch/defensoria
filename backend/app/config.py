"""
Configuración global y reglas de asignación de expedientes.
Traslado de la lógica del HTML al backend.
"""

from pydantic_settings import BaseSettings
from pathlib import Path
import re
import secrets

_DEFAULT_SECRET = "tu-llave-secreta-aqui"

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./defensoría.db"
    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:5173"
    # Dominios extra permitidos en producción (separados por coma), ej. el de Vercel
    CORS_ORIGINS: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()


def _resolver_secret_key(valor: str) -> str:
    """
    En producción la SECRET_KEY se toma de la variable de entorno (Render).
    Si no se configuró (o quedó la de ejemplo), se genera una clave fuerte una
    sola vez y se guarda en backend/.secret_key (gitignored) para que sea
    estable entre reinicios. Así nunca se firma con la llave débil de ejemplo.
    """
    if valor and valor != _DEFAULT_SECRET:
        return valor
    ruta = Path(__file__).resolve().parent.parent / ".secret_key"
    try:
        if ruta.exists():
            guardada = ruta.read_text(encoding="utf-8").strip()
            if guardada:
                return guardada
        nueva = secrets.token_urlsafe(48)
        ruta.write_text(nueva, encoding="utf-8")
        return nueva
    except Exception:
        # Último recurso: clave aleatoria en memoria (se renueva por reinicio).
        return secrets.token_urlsafe(48)


settings.SECRET_KEY = _resolver_secret_key(settings.SECRET_KEY)


def es_violencia_familiar(caratula: str) -> bool:
    """Detecta si un expediente es de Violencia Familiar."""
    if not caratula:
        return False
    u = caratula.upper()
    return (
        "VIOLENCIA FAMILIAR" in u or
        "VIF" in u or
        "VIOLENCIA DE GÉNERO" in u or
        "VIOLENCIA DOMÉSTICA" in u
    )


def es_art42(caratula: str) -> bool:
    """Detecta si un expediente es de EVALUACIÓN ART. 42 CCCN."""
    if not caratula:
        return False
    u = caratula.upper()
    return "EVALUACION ART. 42" in u or "EVALUACIÓN ART. 42" in u


def tiene_dos_personas(persona_str: str) -> bool:
    """Detecta si hay dos personas asignadas."""
    if not persona_str:
        return False
    return "/" in persona_str or re.search(r'\by\b', persona_str, re.IGNORECASE)


def asignar_expediente(
    numero_expediente: str,
    caratula: str,
    persona_original: str = "",
    obs: str = "",
) -> tuple[str, list]:
    """
    Aplica las reglas de asignación automática.

    Retorna: (persona_asignada, lista_alertas)

    Reglas:
    1. Si Art. 42 y asignado a Julia o Catalina → vacío (alerta roja)
    2. Si VF termina en 3 → Tobías (salvo observaciones → vacío + alerta roja)
    3. Si VF termina en 9 → Josefina (salvo observaciones → vacío + alerta roja)
    4. Si VF termina en 7 y asignado a Delfina → Camila (salvo conexos → vacío + alerta roja)
    """
    alertas = []
    persona = persona_original.strip() if persona_original else ""

    # Regla: Art. 42
    if es_art42(caratula):
        pL = persona.lower()
        if pL.find("julia") >= 0 or pL.find("catalina") >= 0:
            alertas.append({
                "tipo": "red",
                "msg": f"⚠ EVALUACIÓN ART. 42 CCCN\nExpte. {numero_expediente} estaba asignado a {persona}. Se dejó vacío."
            })
            return "", alertas

    # Si no es VF, retornar como está
    if not es_violencia_familiar(caratula):
        return persona, alertas

    # Extraer último dígito del número de expediente
    match = re.match(r"^(\d+)", numero_expediente)
    if not match:
        return persona, alertas

    ult_digito = int(match.group(1)[-1])
    tiene_obs = bool(obs and obs.strip())
    obs_y_car = (obs or "") + (caratula or "")
    tiene_conexos = "CONEXO" in obs_y_car.upper()

    # VF termina en 3
    if ult_digito == 3:
        if tiene_obs:
            alertas.append({
                "tipo": "red",
                "msg": f"⚠ VIOLENCIA FAMILIAR — termina en 3, tiene observaciones\nExpte. {numero_expediente} (asignado a {persona}). Revisá manualmente."
            })
            return "", alertas
        else:
            alertas.append({
                "tipo": "warn",
                "msg": f"⚠ VIOLENCIA FAMILIAR — reasignado a Tobías\nExpte. {numero_expediente} terminaba en 3 (antes: {persona})."
            })
            return "Tobías", alertas

    # VF termina en 9
    if ult_digito == 9:
        if tiene_obs:
            alertas.append({
                "tipo": "red",
                "msg": f"⚠ VIOLENCIA FAMILIAR — termina en 9, tiene observaciones\nExpte. {numero_expediente} (asignado a {persona}). Revisá manualmente."
            })
            return "", alertas
        else:
            alertas.append({
                "tipo": "warn",
                "msg": f"⚠ VIOLENCIA FAMILIAR — reasignado a Josefina\nExpte. {numero_expediente} terminaba en 9 (antes: {persona})."
            })
            return "Josefina", alertas

    # VF termina en 7 y asignado a Delfina
    if ult_digito == 7:
        pL = persona.lower()
        if pL.find("delfina") >= 0:
            if tiene_conexos:
                alertas.append({
                    "tipo": "red",
                    "msg": f"⚠ VIOLENCIA FAMILIAR en 7 — tiene conexos\nExpte. {numero_expediente} estaba asignado a Delfina y tiene conexos. Revisá manualmente."
                })
                return "", alertas
            else:
                alertas.append({
                    "tipo": "warn",
                    "msg": f"⚠ VIOLENCIA FAMILIAR — reasignado a Camila\nExpte. {numero_expediente} terminaba en 7 (antes: Delfina)."
                })
                return "Camila", alertas

    # Default: retornar como estaba
    return persona, alertas
