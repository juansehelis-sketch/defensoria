"""
Legajos por persona: lógica de captura de conexos.

Los conexos son los números de expediente que se anotan en las observaciones
después de la palabra "conexos:". Cuando un expediente ya tiene un legajo, esos
números se suman solos. También se pueden agregar a mano (ver api/legajos.py).
"""

import re

_NUM_RE = re.compile(r"\d{3,7}/\d{4}(?:/\d+)*")


def extraer_conexos(texto: str) -> list:
    """Devuelve los números de expediente que van después de 'conexos:'."""
    if not texto:
        return []
    m = re.search(r"conexos?\s*:?\s*(.+)", texto, re.IGNORECASE | re.DOTALL)
    if not m:
        return []
    # únicos, conservando el orden
    return list(dict.fromkeys(_NUM_RE.findall(m.group(1))))


def agregar_numeros(legajo, numeros) -> bool:
    """Suma números nuevos al legajo (sin duplicar). Devuelve True si cambió."""
    actuales = list(legajo.numeros or [])
    cambio = False
    for n in numeros:
        n = (n or "").strip()
        if n and n not in actuales:
            actuales.append(n)
            cambio = True
    if cambio:
        legajo.numeros = actuales  # reasignar para que SQLAlchemy lo detecte
    return cambio


def asegurar_legajo(db, expediente):
    """Devuelve el legajo del expediente; si no tiene, crea uno con un nombre sensato."""
    from app.models import Legajo, Defendido

    if expediente.legajo_id:
        legajo = db.query(Legajo).filter(Legajo.id == expediente.legajo_id).first()
        if legajo:
            return legajo

    # Nombre: primer defendido cargado, o la parte de la carátula, o el número.
    d = (
        db.query(Defendido)
        .filter(Defendido.expediente_id == expediente.id)
        .order_by(Defendido.id.asc())
        .first()
    )
    if d and d.nombre:
        nombre = d.nombre
    elif expediente.caratula:
        nombre = re.split(r"\s+c/|\s+s/", expediente.caratula, maxsplit=1)[0].strip()[:90]
    else:
        nombre = f"Legajo {expediente.numero}"

    legajo = Legajo(nombre=nombre or f"Legajo {expediente.numero}", numeros=[])
    db.add(legajo)
    db.flush()
    expediente.legajo_id = legajo.id
    return legajo


def capturar_desde_observaciones(db, expediente, observaciones: str):
    """
    Si el expediente YA tiene legajo y las observaciones traen 'conexos:',
    suma esos números (y el propio del expediente) al legajo.
    """
    if not expediente or not expediente.legajo_id:
        return None
    conexos = extraer_conexos(observaciones)
    if not conexos:
        return None
    from app.models import Legajo
    legajo = db.query(Legajo).filter(Legajo.id == expediente.legajo_id).first()
    if not legajo:
        return None
    agregar_numeros(legajo, conexos + ([expediente.numero] if expediente.numero else []))
    return legajo
