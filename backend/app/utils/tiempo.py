"""
Fecha y hora de Argentina.

El servidor de producción corre en UTC, así que `datetime.now()` devolvía tres
horas de más: los registros salían con la hora corrida y, después de las 21:00,
también con el día siguiente. Todo lo que se guarda con fecha/hora tiene que
pasar por acá.

Se usa la zona horaria del sistema si está disponible (Linux, como Render) y si
no se cae a un desfasaje fijo de UTC-3, que es lo que rige en Argentina desde
2009 (sin horario de verano).
"""

from datetime import datetime, date, timedelta, timezone

ZONA_AR = "America/Argentina/Buenos_Aires"
_FIJA = timezone(timedelta(hours=-3))


def _zona():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(ZONA_AR)
    except Exception:
        # Windows sin el paquete tzdata: se usa el desfasaje fijo.
        return _FIJA


_ZONA = _zona()


def ahora() -> datetime:
    """Fecha y hora actual de Argentina, sin zona (como la guarda la base)."""
    return datetime.now(_ZONA).replace(tzinfo=None)


def hoy() -> date:
    """Fecha de hoy en Argentina."""
    return ahora().date()
