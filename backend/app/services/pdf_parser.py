"""
Parser de PDFs para extraer expedientes.
Traslado de la lógica del HTML al backend.
"""

import re
import pdfplumber
from typing import List, Tuple


def extraer_texto_pdf(file_path: str) -> str:
    """Extrae texto de un PDF usando pdfplumber."""
    texto = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                texto += page.extract_text() or ""
                texto += "\n"
    except Exception as e:
        raise Exception(f"Error al leer PDF: {str(e)}")
    return texto


def normalizar_expediente(raw: str) -> str:
    """
    Normaliza un número de expediente.
    Ej: "CIV 0038226/2024" → "38226/2024"
    """
    if not raw:
        return ""

    s = raw.upper().strip()
    s = s.replace("*", "")
    s = re.sub(r"\bCIV[-\s]*", "", s)
    s = re.sub(r"\/[A-Z][A-Z0-9]*.*", "", s)
    s = s.replace("-", "/")
    s = re.sub(r"[^0-9\/]", "", s)
    s = re.sub(r"^\/+", "", s)
    s = re.sub(r"^0+([0-9])", r"\1", s)

    return s


def extraer_juzgado(texto: str) -> str:
    """
    Extrae el número de juzgado del PDF.
    Busca patrones como "JUZGADO CIVIL N° 80"
    """
    patterns = [
        r"JUZGADO\s+CIVIL\s+(?:N[°oº]\s*)?(\d+)",
        r"juzgado[^0-9\n]{0,80}?n[°oº]\s*(\d+)",
        r"civil\s+n[°oº]\s*(\d+)",
        r"n[°oº]\s*(\d+)[^0-9\n]{0,40}civil",
    ]

    for pattern in patterns:
        match = re.search(pattern, texto, re.IGNORECASE)
        if match:
            return match.group(1)

    return ""


def extraer_caratula(after_text: str) -> str:
    """
    Extrae la carátula (partes + 's/ tipo de proceso') del texto que sigue al
    número, tratando de ser robusto a los distintos formatos de listado:
    - corta antes del próximo expediente,
    - saca las secuencias de fojas/cuerpo (números sueltos seguidos),
    - corta el bloque de la dependencia destino / pie de página.
    No es perfecto en los formatos donde la carátula se intercala con otras
    columnas, pero captura el nombre de las partes (el dato clave); la carátula
    se puede corregir a mano en el listado, y si el expediente ya vino antes se
    completa sola con la de la base.
    """
    txt = re.sub(r"\s+", " ", after_text[:700]).strip()

    # Cortar antes del próximo número de expediente (NNN/AAAA)
    sig = re.search(r"(?:CIV\s+)?\d{3,7}/\d{4}", txt)
    if sig and sig.start() > 10:
        txt = txt[:sig.start()]

    # Sacar secuencias de fojas / cuerpo / agregados (ej. "717 2 0", "306 2")
    txt = re.sub(r"(?<=\s)\d{1,5}(?:\s+\d{1,3}){1,3}(?=\s|$)", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()

    # Cortar el bloque de la dependencia destino / encabezados (van al final)
    corte = re.search(
        r"\b(DEFENSOR[IÍ]?[AO]|PODER\s+JUDICIAL|C[ÁA]MARA\s+NACIONAL|"
        r"Fecha|Firma|Dependencia|Agregados|C[óo]digo\s+de\s+Barras)\b",
        txt, re.IGNORECASE,
    )
    if corte and corte.start() > 12:
        txt = txt[:corte.start()]

    return re.sub(r"\s+", " ", txt).strip(" -·,")[:220]


def parsear_listado_de_pases(texto: str) -> List[dict]:
    """
    Parsea un texto de PDF y extrae expedientes (sin asignar).
    La asignación se resuelve después cruzando con la base de datos
    (ver _enriquecer_expedientes en api/expedientes.py).

    Retorna lista de: { numero, juzgado, caratula }
    """
    casos = []
    vistos = set()

    juzgado = extraer_juzgado(texto)

    # Buscar expedientes en cualquier formato: con o sin "CIV", con ceros a la
    # izquierda, y con sufijos (/1, /2). Pedimos 3+ dígitos para no confundir
    # con fechas (ej. 06/2026).
    regex_expte = r"(?:CIV\s+)?0*(\d{3,7}\/\d{4}(?:\/\d+)*)"

    for match in re.finditer(regex_expte, texto, re.IGNORECASE):
        expte = normalizar_expediente(match.group(1))

        if not expte or expte in vistos:
            continue

        vistos.add(expte)

        # Extraer carátula (texto después del expediente)
        after_text = texto[match.end():match.end() + 600]
        caratula = extraer_caratula(after_text)

        casos.append({
            "numero": expte,
            "juzgado": juzgado,
            "caratula": caratula,
        })

    return casos


def parsear_pdf_desde_archivo(file_path: str) -> Tuple[List[dict], str]:
    """
    Lee un PDF y parsea expedientes.
    Retorna: (lista_expedientes, juzgado)
    """
    texto = extraer_texto_pdf(file_path)
    expedientes = parsear_listado_de_pases(texto)
    juzgado = extraer_juzgado(texto)
    return expedientes, juzgado
