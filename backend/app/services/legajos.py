"""
Legajos por persona: lógica de captura de conexos.

Los conexos son los números de expediente que se anotan en las observaciones
después de la palabra "conexos:". Cuando un expediente ya tiene un legajo, esos
números se suman solos. También se pueden agregar a mano (ver api/legajos.py).
"""

import re

_NUM_RE = re.compile(r"\d{3,7}/\d{4}(?:/\d+)*")
# Palabras que indican que el expediente está vinculado a otros.
_TRIGGERS = re.compile(r"conex|acumul|vincul|junto\s+con|en\s+conjunto", re.IGNORECASE)


def extraer_conexos(texto: str) -> list:
    """
    Devuelve los números de expediente conexos detectados en el texto.

    1) Si aparece el formato explícito "conexos: ...", toma los números que van
       después (lo más preciso).
    2) Si no, pero el texto menciona conexo/acumulado/vinculado/junto con, toma
       todos los números de expediente que encuentre.
    Así captura solo, escriban "conexos: 123/24" o "acumulado al 123/24".
    """
    if not texto:
        return []
    if not _NUM_RE.search(texto):
        return []
    m = re.search(r"conexos?\s*:?\s*(.+)", texto, re.IGNORECASE | re.DOTALL)
    if m:
        post = list(dict.fromkeys(_NUM_RE.findall(m.group(1))))
        if post:
            return post
    if _TRIGGERS.search(texto):
        return list(dict.fromkeys(_NUM_RE.findall(texto)))
    return []


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
    Si las observaciones detectan conexos, los suma (y el propio número) al
    legajo de la persona. Si el expediente todavía no tenía legajo, se crea
    automáticamente: así basta escribir los conexos para armar el legajo.
    """
    if not expediente:
        return None
    conexos = extraer_conexos(observaciones)
    if not conexos:
        return None
    legajo = asegurar_legajo(db, expediente)
    agregar_numeros(legajo, conexos + ([expediente.numero] if expediente.numero else []))
    return legajo
