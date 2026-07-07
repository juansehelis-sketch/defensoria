"""
Parser de PDFs para extraer expedientes.
Traslado de la lógica del HTML al backend.
"""

import re
import pdfplumber
from typing import List, Tuple

# Número de expediente en formato compacto (sin espacios ni puntos): NNN/AAAA[/n]
_RE_NUM_COMPACTO = re.compile(r"^(?:CIV|COM|CNT|CSS)?0*(\d{3,7}/\d{4}(?:/\d+)*)", re.IGNORECASE)

# Número de expediente en texto plano, tolerando puntos de miles y espacios:
#   38226/2024 · 38.226/2024 · 0038226/2024 · CIV 38226 / 2024
_RE_EXPTE_TEXTO = re.compile(
    r"(?:CIV|COM|CNT|CSS)?\s*0*(?:\d{1,3}(?:[.\s]\d{3})+|\d{3,7})\s*/\s*\d{4}(?:\s*/\s*\d+)*",
    re.IGNORECASE,
)


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

    # Cortar antes del próximo número de expediente (tolera puntos y espacios)
    sig = _RE_EXPTE_TEXTO.search(txt)
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

    # Buscar expedientes en muchos formatos: con o sin "CIV", con ceros a la
    # izquierda, con puntos de miles ("38.226/2024") y espacios alrededor de la
    # barra ("38226 / 2024"). El año de 4 dígitos evita confundir con fechas.
    for match in _RE_EXPTE_TEXTO.finditer(texto):
        expte = normalizar_expediente(match.group(0))

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


def _caratula_por_columnas(words: list, anchor: dict, next_top: float, ancho: float) -> str:
    """
    Arma la carátula usando las COORDENADAS de las palabras (no el texto plano).
    Idea: la carátula es una columna que va desde el número hasta la primera
    columna numérica (fojas/cuerpo). Tomamos solo las palabras de esa franja,
    incluidas las de los renglones siguientes (carátula a varias líneas), y
    descartamos lo que está más a la derecha (fojas, dependencia destino).
    Así se adapta a cualquier formato sin cortar la carátula.
    """
    top = anchor["top"]
    fila = sorted([w for w in words if abs(w["top"] - top) < 4], key=lambda w: w["x0"])
    resto = [w for w in fila if w["x0"] > anchor["x1"] + 1]
    if not resto:
        return ""

    car_left = resto[0]["x0"]

    # Límite derecho de la carátula: primera palabra puramente numérica
    # (fojas/cuerpo) precedida de un salto de columna.
    boundary = ancho
    prev_x1 = resto[0]["x1"]
    for w in resto:
        gap = w["x0"] - prev_x1
        if gap > 12 and re.fullmatch(r"\d{1,4}", w["text"]):
            boundary = w["x0"] - 3
            break
        prev_x1 = w["x1"]

    tope = min(next_top, top + 72)
    car = [
        w for w in words
        if top - 2 <= w["top"] < tope
        and w["x0"] >= car_left - 12
        and w["x1"] <= boundary
    ]
    car.sort(key=lambda w: (round(w["top"]), w["x0"]))
    texto = re.sub(r"\s+", " ", " ".join(w["text"] for w in car)).strip(" -·,;")

    # Saca un número de expediente que se haya colado al inicio.
    texto = re.sub(r"^(?:CIV\s*)?\d{3,7}/\d{4}(?:/\d+)*\s*", "", texto, flags=re.IGNORECASE).strip()
    # Red de seguridad: cortar si se coló el bloque de dependencia / pie.
    corte = re.search(
        r"\s[—–-]?\s*\b(DEFENSOR[IÍ]?[AO]|PODER\s+JUDICIAL|C[ÁA]MARA\s+NACIONAL|"
        r"Dependencia|Agregados|Fojas|Cuerpo|C[óo]digo\s+de\s+Barras)\b",
        texto, re.IGNORECASE,
    )
    if corte and corte.start() > 12:
        texto = texto[:corte.start()].strip(" -·,;")

    # Sacar colas de puntos/barras sueltas (líneas punteadas: ". . . / . . .").
    texto = re.sub(r"(?:\s+[.\-/·]){2,}\s*$", "", texto).strip(" -·,;.")

    return texto[:240]


def _anchor_en_fila(fw: list, ancho: float):
    """
    Busca el número de expediente en una fila de palabras. Tolera que el número
    venga partido en varias palabras ("38226" "/" "2024"), con puntos de miles o
    ceros a la izquierda. Devuelve el ancla {numero, x0, x1, top} o None.
    """
    n = len(fw)
    for i in range(n):
        for j in range(i, min(i + 3, n)):
            seg = "".join(w["text"] for w in fw[i:j + 1]).replace(".", "").replace(" ", "")
            m = _RE_NUM_COMPACTO.match(seg)
            if m:
                x0 = fw[i]["x0"]
                # Si el número aparece recién en la mitad derecha, es un conexo /
                # una cita en observaciones, no el expediente de la fila.
                if x0 > ancho * 0.6:
                    return None
                return {"numero": normalizar_expediente(m.group(1)), "x0": x0, "x1": fw[j]["x1"], "top": fw[i]["top"]}
    return None


def _agrupar_filas(words: list) -> list:
    """Agrupa las palabras en filas por su coordenada vertical (top)."""
    filas = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if filas and abs(w["top"] - filas[-1]["top"]) <= 3:
            filas[-1]["ws"].append(w)
        else:
            filas.append({"top": w["top"], "ws": [w]})
    return filas


def parsear_pdf_con_posiciones(file_path: str) -> Tuple[List[dict], str]:
    """
    Parser principal: usa las coordenadas de cada palabra para separar bien las
    columnas. Cae al método por texto plano si algo falla o no encuentra nada.
    """
    casos: List[dict] = []
    vistos = set()
    juzgado = ""

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            if not juzgado:
                juzgado = extraer_juzgado(page.extract_text() or "")
            try:
                words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
            except Exception:
                words = []
            if not words:
                continue
            words.sort(key=lambda w: (round(w["top"]), w["x0"]))
            ancho = float(page.width or 600)

            # Anclas: una por fila, buscando el número de expediente de la columna
            # izquierda (tolerante a formatos y a números partidos en palabras).
            anchors = []
            for fila in _agrupar_filas(words):
                fila["ws"].sort(key=lambda w: w["x0"])
                a = _anchor_en_fila(fila["ws"], ancho)
                if a and a["numero"]:
                    anchors.append(a)
            anchors.sort(key=lambda a: a["top"])

            for idx, a in enumerate(anchors):
                num = a["numero"]
                if not num or num in vistos:
                    continue
                vistos.add(num)
                next_top = anchors[idx + 1]["top"] if idx + 1 < len(anchors) else 1e9
                casos.append({
                    "numero": num,
                    "juzgado": juzgado,
                    "caratula": _caratula_por_columnas(words, a, next_top, ancho),
                })

    return casos, juzgado


def parsear_pdf_desde_archivo(file_path: str) -> Tuple[List[dict], str]:
    """
    Lee un PDF y parsea expedientes. Intenta primero por coordenadas (robusto a
    formatos); si falla o no encuentra nada, usa el método por texto plano.
    Retorna: (lista_expedientes, juzgado)
    """
    try:
        expedientes, juzgado = parsear_pdf_con_posiciones(file_path)
        if expedientes:
            return expedientes, juzgado
    except Exception:
        pass

    texto = extraer_texto_pdf(file_path)
    return parsear_listado_de_pases(texto), extraer_juzgado(texto)
