"""
Motor de plantillas con variables @.

Un modelo de escrito tiene texto con variables tipo @numero, @defendido, etc.
Al "armar" el escrito para un expediente, cada @variable se reemplaza por el
dato real. Si el dato falta (ej. no se cargó el defendido), queda un hueco
visible "[completar: ...]" en vez de tirar error.
"""

import re
from datetime import date

# ── Catálogo de variables disponibles ──────────────────────────
# (token, etiqueta legible, grupo) — es la fuente única que también ve el
# frontend para mostrar la ayuda. "Pasarse de opciones": mejor de más.
CATALOGO = [
    # Del expediente
    ("numero", "Número de expediente", "Expediente"),
    ("caratula", "Carátula", "Expediente"),
    ("juzgado", "Juzgado", "Expediente"),
    ("tipo_proceso", "Tipo de proceso", "Expediente"),
    ("estado", "Estado", "Expediente"),
    ("fecha_entrada", "Fecha de entrada", "Expediente"),
    ("observaciones", "Observaciones", "Expediente"),
    ("resumen", "Resumen del caso", "Expediente"),
    ("despachante", "Despachante asignado", "Expediente"),
    ("conexos", "Expedientes conexos", "Expediente"),
    # Del/los defendido/s
    ("defendido", "Defendido principal (nombre)", "Defendido"),
    ("defendidos", "Todos los defendidos", "Defendido"),
    ("dni", "DNI del defendido", "Defendido"),
    ("fecha_nacimiento", "Fecha de nacimiento", "Defendido"),
    ("edad", "Edad (calculada)", "Defendido"),
    ("vinculo", "Vínculo / rol del defendido", "Defendido"),
    # Institucionales / fecha
    ("defensora", "Nombre de la defensora", "Institucional"),
    ("defensoria", "Dependencia (Defensoría)", "Institucional"),
    ("ciudad", "Ciudad", "Institucional"),
    ("fecha", "Fecha de hoy (en letras)", "Institucional"),
]

# Alias que también se aceptan al escribir (apuntan a un token del catálogo).
ALIAS = {
    "expediente": "numero",
    "nro": "numero",
    "autos": "caratula",
    "hoy": "fecha",
}

ETIQUETAS = {tok: etq for tok, etq, _ in CATALOGO}

DEPENDENCIA = "Defensoría Pública de Menores e Incapaces N° 6"
CIUDAD = "Ciudad Autónoma de Buenos Aires"

_MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

# Variable: @ seguido de letras/números/guión bajo.
_TOKEN_RE = re.compile(r"@([a-zA-ZñÑáéíóúÁÉÍÓÚ_][a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ_]*)")


def fecha_en_letras(d) -> str:
    if not d:
        return ""
    return f"{d.day} de {_MESES[d.month - 1]} de {d.year}"


def _edad(fnac, hoy) -> str:
    if not fnac:
        return ""
    años = hoy.year - fnac.year - ((hoy.month, hoy.day) < (fnac.month, fnac.day))
    return str(años)


def construir_contexto(db, exp) -> dict:
    """Arma el diccionario {token: valor} a partir del expediente y sus datos."""
    from app.models import Usuario

    hoy = date.today()
    defs = sorted(exp.defendidos, key=lambda d: d.id) if exp.defendidos else []
    d0 = defs[0] if defs else None
    defensora = db.query(Usuario).filter(Usuario.rol == "defensora").first()

    ctx = {
        "numero": exp.numero or "",
        "caratula": exp.caratula or "",
        "juzgado": exp.juzgado or "",
        "tipo_proceso": exp.tipo_proceso or "",
        "estado": exp.estado or "",
        "fecha_entrada": fecha_en_letras(exp.fecha_entrada),
        "observaciones": exp.observaciones or "",
        "resumen": exp.resumen or "",
        "despachante": exp.despachante_asignado or "",
        "conexos": ", ".join(exp.conexos) if exp.conexos else "",
        "defendido": (d0.nombre if d0 else "") or "",
        "defendidos": ", ".join(d.nombre for d in defs if d.nombre) if defs else "",
        "dni": (d0.dni if d0 else "") or "",
        "fecha_nacimiento": fecha_en_letras(d0.fecha_nacimiento) if d0 else "",
        "edad": _edad(d0.fecha_nacimiento, hoy) if d0 else "",
        "vinculo": (d0.vinculo if d0 else "") or "",
        "defensora": defensora.nombre if defensora else "",
        "defensoria": DEPENDENCIA,
        "ciudad": CIUDAD,
        "fecha": fecha_en_letras(hoy),
    }
    return ctx


def rellenar(texto: str, ctx: dict):
    """
    Reemplaza las @variables conocidas por su valor.
    - Variable conocida con dato     → el dato.
    - Variable conocida sin dato     → "[completar: Etiqueta]" (y se reporta).
    - Variable desconocida (ej. mail)→ se deja tal cual.
    Devuelve (texto_rellenado, lista_de_faltantes).
    """
    faltantes = []

    def _repl(m):
        token = m.group(1).lower()
        token = ALIAS.get(token, token)
        if token not in ctx:
            return m.group(0)
        valor = (ctx[token] or "").strip()
        if not valor:
            etq = ETIQUETAS.get(token, token)
            if etq not in faltantes:
                faltantes.append(etq)
            return f"[completar: {etq}]"
        return valor

    return _TOKEN_RE.sub(_repl, texto or ""), faltantes
