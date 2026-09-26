"""
Proyectos de dictamen editables dentro del sistema.

El proyecto que viaja "a la firma" se guarda como HTML simple (lo que edita el
editor del navegador) + un Word "base" (la plantilla del despachante o el Word
que adjuntó). Del Word base se conservan el membrete (encabezado y pie), los
márgenes, el tamaño de hoja y los estilos; el cuerpo es el HTML editado.

  docx_a_html(bytes)          → HTML para el editor (cuerpo del Word)
  sanitizar(html)             → HTML limpio (solo etiquetas permitidas)
  armar_docx(base, html)      → bytes de un .docx
  armar_pdf(base, html)       → bytes de un .pdf (sin LibreOffice: reportlab)
  texto_plano(html)           → texto para comparar versiones

El editor trabaja con `white-space: pre-wrap`: los espacios y tabulaciones del
texto son reales (no se colapsan como en HTML común).
"""

import io
import re
from collections import Counter
from html import escape
from html.parser import HTMLParser

# ═══════════════════════════════════════════════════════════════
# HTML → árbol simple
# ═══════════════════════════════════════════════════════════════

_VACIAS = {"br", "img", "hr", "meta", "link", "input", "col"}
_DESCARTAR_CONTENIDO = {"script", "style", "title", "head", "xml", "template", "noscript", "iframe", "object"}
_BLOQUES = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "ul", "ol",
            "table", "thead", "tbody", "tfoot", "tr", "td", "th", "section", "article", "body", "html"}


class _Nodo:
    __slots__ = ("tag", "attrs", "hijos", "texto")

    def __init__(self, tag=None, attrs=None, texto=None):
        self.tag = tag
        self.attrs = attrs or {}
        self.hijos = []
        self.texto = texto


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.raiz = _Nodo("root")
        self.pila = [self.raiz]
        self.saltar = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if ":" in tag:  # <o:p>, <v:shape> de Word
            return
        if tag in _DESCARTAR_CONTENIDO:
            self.saltar += 1
            return
        if self.saltar:
            return
        n = _Nodo(tag, {k.lower(): (v or "") for k, v in attrs})
        self.pila[-1].hijos.append(n)
        if tag not in _VACIAS:
            self.pila.append(n)

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if tag in _DESCARTAR_CONTENIDO or self.saltar or ":" in tag:
            return
        self.pila[-1].hijos.append(_Nodo(tag, {k.lower(): (v or "") for k, v in attrs}))

    def handle_endtag(self, tag):
        tag = tag.lower()
        if ":" in tag:
            return
        if tag in _DESCARTAR_CONTENIDO:
            self.saltar = max(0, self.saltar - 1)
            return
        if self.saltar or tag in _VACIAS:
            return
        for i in range(len(self.pila) - 1, 0, -1):
            if self.pila[i].tag == tag:
                del self.pila[i:]
                break

    def handle_data(self, data):
        if self.saltar or not data:
            return
        self.pila[-1].hijos.append(_Nodo(texto=data))


def _parsear(html: str) -> _Nodo:
    p = _Parser()
    p.feed(html or "")
    p.close()
    return p.raiz


def _estilo(attrs) -> dict:
    out = {}
    for parte in (attrs.get("style") or "").split(";"):
        if ":" in parte:
            k, v = parte.split(":", 1)
            out[k.strip().lower()] = v.strip().lower()
    return out


def _alineacion(attrs) -> str | None:
    a = (_estilo(attrs).get("text-align") or attrs.get("align") or "").lower()
    if a in ("center", "right", "justify", "left"):
        return a
    if a in ("start",):
        return "left"
    if a in ("end",):
        return "right"
    return None


def _medida_pt(valor: str | None) -> float | None:
    """'36pt' / '48px' / '1.27cm' / '2em' → puntos."""
    if not valor:
        return None
    m = re.match(r"^\s*(-?[\d.]+)\s*(pt|px|cm|mm|in|em|rem)?\s*$", valor)
    if not m:
        return None
    n = float(m.group(1))
    u = m.group(2) or "px"
    return round({"pt": n, "px": n * 0.75, "cm": n * 28.3465, "mm": n * 2.83465,
                  "in": n * 72, "em": n * 12, "rem": n * 12}[u], 1)


# ═══════════════════════════════════════════════════════════════
# Sanitizar: deja solo lo que el editor y los exportadores entienden
# ═══════════════════════════════════════════════════════════════

_INLINE_OK = {"b": "b", "strong": "b", "i": "i", "em": "i", "u": "u", "ins": "u",
              "s": "s", "strike": "s", "del": "s", "sup": "sup", "sub": "sub"}
_BLOQUE_OK = {"p": "p", "div": "p", "section": "p", "article": "p", "h1": "h2", "h2": "h2",
              "h3": "h3", "h4": "h3", "h5": "h3", "h6": "h3", "li": "li", "blockquote": "blockquote",
              "ul": "ul", "ol": "ol", "table": "table", "thead": "tbody", "tbody": "tbody",
              "tfoot": "tbody", "tr": "tr", "td": "td", "th": "td"}


def _estilo_bloque(attrs) -> str:
    partes = []
    al = _alineacion(attrs)
    if al and al != "left":
        partes.append(f"text-align:{al}")
    est = _estilo(attrs)
    ml = _medida_pt(est.get("margin-left") or est.get("padding-left"))
    if ml and ml > 0:
        partes.append(f"margin-left:{ml}pt")
    ti = _medida_pt(est.get("text-indent"))
    if ti:
        partes.append(f"text-indent:{ti}pt")
    return ";".join(partes)


_CONTENEDORES = {"root", "html", "body", "ul", "ol", "table", "thead", "tbody", "tfoot", "tr", "blockquote"}


def _serializar(nodo: _Nodo, out: list):
    for h in nodo.hijos:
        if h.tag is None:
            # Saltos de línea sueltos entre bloques: con pre-wrap se verían como renglones vacíos
            if nodo.tag in _CONTENEDORES and not h.texto.strip():
                continue
            out.append(escape(h.texto, quote=False))
            continue
        t = h.tag
        if t == "br":
            out.append("<br>")
        elif t in _INLINE_OK:
            tag = _INLINE_OK[t]
            out.append(f"<{tag}>")
            _serializar(h, out)
            out.append(f"</{tag}>")
        elif t == "span":
            est = _estilo(h.attrs)
            envolver = []
            if est.get("font-weight") in ("bold", "700", "800", "900", "bolder"):
                envolver.append("b")
            if "italic" in est.get("font-style", ""):
                envolver.append("i")
            if "underline" in est.get("text-decoration", "") or "underline" in est.get("text-decoration-line", ""):
                envolver.append("u")
            out.extend(f"<{e}>" for e in envolver)
            _serializar(h, out)
            out.extend(f"</{e}>" for e in reversed(envolver))
        elif t in _BLOQUE_OK:
            tag = _BLOQUE_OK[t]
            extra = ""
            if tag in ("p", "h2", "h3", "li", "blockquote", "td"):
                est = _estilo_bloque(h.attrs)
                if est:
                    extra += f' style="{est}"'
            if tag == "td":
                cs = h.attrs.get("colspan", "")
                if cs.isdigit() and int(cs) > 1:
                    extra += f' colspan="{int(cs)}"'
            out.append(f"<{tag}{extra}>")
            _serializar(h, out)
            out.append(f"</{tag}>")
        else:
            # Etiqueta desconocida (a, font, img...): se queda solo el contenido
            _serializar(h, out)


def sanitizar(html: str) -> str:
    out = []
    _serializar(_parsear(html), out)
    return "".join(out)


# ═══════════════════════════════════════════════════════════════
# HTML → bloques (estructura intermedia para Word y PDF)
# ═══════════════════════════════════════════════════════════════
# Párrafo: {"tipo": "p", "align", "izq" (pt), "primera" (pt), "titulo": 0|1|2,
#           "lista": None|"ul"|"ol", "numero", "runs": [{"t", "b", "i", "u", "s", "sup", "sub"} | {"br": True}]}
# Tabla:   {"tipo": "tabla", "filas": [[{"bloques": [...], "colspan": n}]]}

class _Armador:
    def __init__(self):
        self.bloques = []
        self.actual = None

    def cerrar(self, forzar=False):
        a = self.actual
        if a is not None:
            while a["runs"] and a["runs"][-1].get("br"):
                a["runs"].pop()
                forzar = True
            if a["runs"] or forzar or a.get("explicito"):
                a.pop("explicito", None)
                self.bloques.append(a)
        self.actual = None

    def abrir(self, props):
        self.cerrar()
        self.actual = {"tipo": "p", "runs": [], **props}

    def texto(self, t, fmt, props):
        if self.actual is None:
            if not t.strip():
                return  # espacios sueltos entre bloques
            self.actual = {"tipo": "p", "runs": [], **props}
        partes = t.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for i, parte in enumerate(partes):
            if i:
                self.actual["runs"].append({"br": True})
            if parte:
                self.actual["runs"].append({"t": parte.replace("\xa0", " "), **fmt})

    def salto(self, props):
        if self.actual is None:
            self.actual = {"tipo": "p", "runs": [], **props}
        self.actual["runs"].append({"br": True})


def _props_de(attrs, base) -> dict:
    p = dict(base)
    al = _alineacion(attrs)
    if al:
        p["align"] = al
    est = _estilo(attrs)
    ml = _medida_pt(est.get("margin-left"))
    if ml:
        p["izq"] = (base.get("izq") or 0) + ml
    ti = _medida_pt(est.get("text-indent"))
    if ti is not None:
        p["primera"] = ti
    return p


def _recorrer(nodo, arm: _Armador, fmt: dict, props: dict, ctx_lista=None):
    for h in nodo.hijos:
        if h.tag is None:
            arm.texto(h.texto, fmt, props)
            continue
        t = h.tag
        if t == "br":
            arm.salto(props)
        elif t in ("b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "sup", "sub", "span"):
            f = dict(fmt)
            clave = {"b": "b", "strong": "b", "i": "i", "em": "i", "u": "u", "ins": "u",
                     "s": "s", "strike": "s", "del": "s", "sup": "sup", "sub": "sub"}.get(t)
            if clave:
                f[clave] = True
            if t == "span":
                est = _estilo(h.attrs)
                if est.get("font-weight") in ("bold", "700", "800", "900", "bolder"):
                    f["b"] = True
                if "italic" in est.get("font-style", ""):
                    f["i"] = True
                if "underline" in est.get("text-decoration", ""):
                    f["u"] = True
            _recorrer(h, arm, f, props, ctx_lista)
        elif t in ("p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6"):
            pp = _props_de(h.attrs, {k: v for k, v in props.items() if k in ("izq", "align")})
            if t in ("h1", "h2"):
                pp["titulo"] = 1
            elif t in ("h3", "h4", "h5", "h6"):
                pp["titulo"] = 2
            pp["explicito"] = True
            arm.abrir(pp)
            _recorrer(h, arm, fmt, pp, ctx_lista)
            arm.cerrar()
        elif t == "blockquote":
            arm.cerrar()
            pp = _props_de(h.attrs, props)
            pp["izq"] = (props.get("izq") or 0) + 36
            _recorrer(h, arm, fmt, pp, ctx_lista)
            arm.cerrar()
        elif t in ("ul", "ol"):
            arm.cerrar()
            lista = {"tipo": t, "n": 0}
            pp = dict(props)
            if ctx_lista:  # lista anidada
                pp["izq"] = (props.get("izq") or 0) + 18
            _recorrer(h, arm, fmt, pp, lista)
            arm.cerrar()
        elif t == "li":
            pp = _props_de(h.attrs, props)
            if ctx_lista:
                ctx_lista["n"] += 1
                pp["lista"] = ctx_lista["tipo"]
                pp["numero"] = ctx_lista["n"]
            pp["explicito"] = True
            arm.abrir(pp)
            _recorrer(h, arm, fmt, pp, None)
            arm.cerrar()
        elif t == "table":
            arm.cerrar()
            filas = []
            for tr in _buscar(h, "tr"):
                fila = []
                for td in tr.hijos:
                    if td.tag in ("td", "th"):
                        sub = _Armador()
                        _recorrer(td, sub, dict(fmt, b=True) if td.tag == "th" else fmt,
                                  _props_de(td.attrs, {}), None)
                        sub.cerrar()
                        cs = td.attrs.get("colspan", "")
                        fila.append({"bloques": sub.bloques, "colspan": int(cs) if cs.isdigit() else 1})
                if fila:
                    filas.append(fila)
            if filas:
                arm.bloques.append({"tipo": "tabla", "filas": filas})
        elif t in ("img", "hr"):
            continue
        else:
            _recorrer(h, arm, fmt, props, ctx_lista)


def _buscar(nodo, tag):
    for h in nodo.hijos:
        if h.tag == tag:
            yield h
        elif h.tag in ("thead", "tbody", "tfoot"):
            yield from _buscar(h, tag)


def html_a_bloques(html: str) -> list:
    arm = _Armador()
    _recorrer(_parsear(html), arm, {}, {})
    arm.cerrar()
    return arm.bloques


def texto_plano(html: str) -> str:
    """Texto del documento (para saber si hubo cambios entre versiones)."""
    lineas = []

    def txt(b):
        if b["tipo"] == "tabla":
            for fila in b["filas"]:
                for c in fila:
                    for x in c["bloques"]:
                        txt(x)
        else:
            lineas.append("".join(r.get("t", "\n") for r in b["runs"]))

    for b in html_a_bloques(html):
        txt(b)
    return re.sub(r"[ \t\xa0]+", " ", "\n".join(lineas)).strip()


def formato_plano(html: str) -> str:
    """Texto + formato: cambia si cambió una negrita o una alineación."""
    return sanitizar(html or "").replace("\n", "")


# ═══════════════════════════════════════════════════════════════
# Word → HTML
# ═══════════════════════════════════════════════════════════════

def _qn(t):
    from docx.oxml.ns import qn
    return qn(t)


def _run_efectivo(run, par, atributo):
    """Negrita/cursiva/subrayado: directo en el run, o heredado del estilo."""
    v = getattr(run.font, atributo) if atributo != "underline" else run.font.underline
    if v is not None:
        return bool(v)
    for est in (run.style, par.style):
        s = est
        while s is not None:
            try:
                sv = getattr(s.font, atributo)
            except Exception:
                sv = None
            if sv is not None:
                return bool(sv)
            s = s.base_style
    return False


def _alineacion_par(par) -> str | None:
    a = par.paragraph_format.alignment
    s = par.style
    while a is None and s is not None:
        try:
            a = s.paragraph_format.alignment
        except Exception:
            a = None
        s = s.base_style
    if a is None:
        return None
    n = str(a)
    if "CENTER" in n:
        return "center"
    if "RIGHT" in n:
        return "right"
    if "JUSTIFY" in n or "DISTRIBUTE" in n:
        return "justify"
    return None


def _indent_par(par, attr):
    v = getattr(par.paragraph_format, attr)
    s = par.style
    while v is None and s is not None:
        try:
            v = getattr(s.paragraph_format, attr)
        except Exception:
            v = None
        s = s.base_style
    return round(v.pt, 1) if v is not None else None


def _tipo_lista(par, doc) -> str | None:
    ppr = par._p.pPr
    num_pr = ppr.numPr if ppr is not None else None
    if num_pr is None or num_pr.numId is None:
        # La numeración puede venir del estilo (ej. "List Bullet")
        s = par.style
        num_pr = None
        while s is not None and num_pr is None:
            spr = s.element.pPr
            if spr is not None and spr.numPr is not None and spr.numPr.numId is not None:
                num_pr = spr.numPr
            s = s.base_style
        if num_pr is None:
            return None
    try:
        num_id = num_pr.numId.val
        ilvl = num_pr.ilvl.val if num_pr.ilvl is not None else 0
        numbering = doc.part.numbering_part.element
        num = numbering.xpath(f'./w:num[@w:numId="{num_id}"]')
        if not num:
            return None
        abs_id = num[0].xpath("./w:abstractNumId/@w:val")[0]
        fmt = numbering.xpath(
            f'./w:abstractNum[@w:abstractNumId="{abs_id}"]/w:lvl[@w:ilvl="{ilvl}"]/w:numFmt/@w:val')
        if fmt and fmt[0] == "none":
            return None
        return "ul" if (fmt and fmt[0] == "bullet") else "ol"
    except Exception:
        return "ul"


def _par_a_html(par, doc) -> tuple[str | None, str]:
    """Devuelve (tipo_lista, html_del_párrafo)."""
    from docx.text.run import Run
    partes = []
    for r_el in par._p.xpath(".//w:r"):
        # Saltear el texto de campos ocultos / revisiones borradas
        if r_el.getparent() is not None and r_el.getparent().tag == _qn("w:del"):
            continue
        run = Run(r_el, par)
        t = run.text
        if not t:
            continue
        h = escape(t, quote=False)
        if _run_efectivo(run, par, "bold"):
            h = f"<b>{h}</b>"
        if _run_efectivo(run, par, "italic"):
            h = f"<i>{h}</i>"
        if _run_efectivo(run, par, "underline"):
            h = f"<u>{h}</u>"
        partes.append(h)
    # \n (salto de línea manual de Word) → <br>
    contenido = "".join(partes).replace("\n", "<br>")

    estilo = []
    al = _alineacion_par(par)
    if al:
        estilo.append(f"text-align:{al}")
    izq = _indent_par(par, "left_indent")
    lista = _tipo_lista(par, doc)
    if izq and izq > 0 and not lista:
        estilo.append(f"margin-left:{izq}pt")
    pri = _indent_par(par, "first_line_indent")
    if pri and not lista:
        estilo.append(f"text-indent:{pri}pt")
    st = f' style="{";".join(estilo)}"' if estilo else ""

    nombre_estilo = (par.style.name if par.style is not None else "") or ""
    tag = "p"
    if re.match(r"^(Heading|Título|Titulo)\s*1$", nombre_estilo) or nombre_estilo in ("Title", "Título"):
        tag = "h2"
    elif re.match(r"^(Heading|Título|Titulo)\s*[2-6]$", nombre_estilo):
        tag = "h3"
    if lista:
        tag = "li"
    return lista, f"<{tag}{st}>{contenido or '<br>'}</{tag}>"


def docx_a_html(datos: bytes) -> str:
    """Cuerpo de un .docx como HTML editable (en orden: párrafos y tablas)."""
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(io.BytesIO(datos))
    out = []
    lista_abierta = None
    for el in doc.element.body.iterchildren():
        if el.tag == _qn("w:p"):
            lista, h = _par_a_html(Paragraph(el, doc), doc)
            if lista != lista_abierta:
                if lista_abierta:
                    out.append(f"</{lista_abierta}>")
                if lista:
                    out.append(f"<{lista}>")
                lista_abierta = lista
            out.append(h)
        elif el.tag == _qn("w:tbl"):
            if lista_abierta:
                out.append(f"</{lista_abierta}>")
                lista_abierta = None
            tabla = Table(el, doc)
            out.append("<table><tbody>")
            for fila in tabla.rows:
                out.append("<tr>")
                vistos = set()
                for celda in fila.cells:
                    if id(celda._tc) in vistos:  # celdas combinadas se repiten
                        continue
                    vistos.add(id(celda._tc))
                    pars = "".join(_par_a_html(p, doc)[1] for p in celda.paragraphs)
                    out.append(f"<td>{pars}</td>")
                out.append("</tr>")
            out.append("</tbody></table>")
    if lista_abierta:
        out.append(f"</{lista_abierta}>")
    return "".join(out)


def docx_valido(datos: bytes) -> bool:
    try:
        from docx import Document
        Document(io.BytesIO(datos))
        return True
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════
# Formato dominante del Word base (fuente, tamaño, interlineado)
# ═══════════════════════════════════════════════════════════════

def _formato_base(doc) -> dict:
    fuentes, tamanos, interl, despues, antes = Counter(), Counter(), Counter(), Counter(), Counter()
    for par in doc.paragraphs:
        largo = len(par.text.strip())
        if not largo:
            continue
        pf = par.paragraph_format
        if pf.line_spacing is not None:
            interl[pf.line_spacing if isinstance(pf.line_spacing, float) else ("pt", pf.line_spacing.pt)] += largo
        if pf.space_after is not None:
            despues[pf.space_after.pt] += largo
        if pf.space_before is not None:
            antes[pf.space_before.pt] += largo
        for r in par.runs:
            n = len(r.text)
            if r.font.name:
                fuentes[r.font.name] += n
            if r.font.size:
                tamanos[r.font.size.pt] += n
    normal = None
    try:
        normal = doc.styles["Normal"]
    except KeyError:
        pass
    f = {
        "fuente": fuentes.most_common(1)[0][0] if fuentes else None,
        "tamano": tamanos.most_common(1)[0][0] if tamanos else None,
        "interlineado": interl.most_common(1)[0][0] if interl else None,
        "despues": despues.most_common(1)[0][0] if despues else None,
        "antes": antes.most_common(1)[0][0] if antes else None,
    }
    # Para el PDF hace falta saber la fuente/tamaño efectivos aunque vengan del estilo
    f["fuente_efectiva"] = f["fuente"] or (normal.font.name if normal is not None and normal.font.name else None) or _fuente_por_defecto(doc)
    f["tamano_efectivo"] = f["tamano"] or (normal.font.size.pt if normal is not None and normal.font.size else None) or _tamano_por_defecto(doc) or 12
    if f["interlineado"] is None and normal is not None:
        ls = normal.paragraph_format.line_spacing
        if isinstance(ls, float):
            f["interlineado_efectivo"] = ls
    f.setdefault("interlineado_efectivo", f["interlineado"] if isinstance(f["interlineado"], float) else 1.0)
    return f


def _fuente_por_defecto(doc):
    try:
        v = doc.styles.element.xpath("./w:docDefaults/w:rPrDefault/w:rPr/w:rFonts/@w:ascii")
        return v[0] if v else None
    except Exception:
        return None


def _tamano_por_defecto(doc):
    try:
        v = doc.styles.element.xpath("./w:docDefaults/w:rPrDefault/w:rPr/w:sz/@w:val")
        return int(v[0]) / 2 if v else None
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════
# HTML → Word
# ═══════════════════════════════════════════════════════════════

def _doc_base(base: bytes | None):
    from docx import Document
    from docx.shared import Cm, Pt
    if base:
        doc = Document(io.BytesIO(base))
        fmt = _formato_base(doc)
        cuerpo = doc.element.body
        for hijo in list(cuerpo.iterchildren()):
            if hijo.tag != _qn("w:sectPr"):
                cuerpo.remove(hijo)
        # Si el Word tenía varias secciones, la última (la del cuerpo) queda sola
        return doc, fmt
    # Hoja en blanco: A4, márgenes judiciales, Times New Roman 12, interlineado 1,5
    doc = Document()
    s = doc.sections[0]
    s.page_width, s.page_height = Cm(21), Cm(29.7)
    s.left_margin, s.right_margin = Cm(3), Cm(2)
    s.top_margin, s.bottom_margin = Cm(2.5), Cm(2.5)
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(12)
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_after = Pt(0)
    for body_par in list(doc.element.body.iterchildren()):
        if body_par.tag != _qn("w:sectPr"):
            doc.element.body.remove(body_par)
    return doc, {"fuente": None, "tamano": None, "interlineado": None, "despues": None, "antes": None,
                 "fuente_efectiva": "Times New Roman", "tamano_efectivo": 12, "interlineado_efectivo": 1.5}


def _aplicar_par(par, b, fmt, doc):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt
    pf = par.paragraph_format
    al = b.get("align")
    if al:
        pf.alignment = {"center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT,
                        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY, "left": WD_ALIGN_PARAGRAPH.LEFT}[al]
    if b.get("izq"):
        pf.left_indent = Pt(b["izq"])
    if b.get("primera") is not None:
        pf.first_line_indent = Pt(b["primera"])
    il = fmt.get("interlineado")
    if il is not None:
        pf.line_spacing = il if isinstance(il, float) else Pt(il[1])
    if fmt.get("despues") is not None:
        pf.space_after = Pt(fmt["despues"])
    if fmt.get("antes") is not None:
        pf.space_before = Pt(fmt["antes"])


def _aplicar_runs(par, b, fmt):
    from docx.shared import Pt
    for r in b["runs"]:
        if r.get("br"):
            par.add_run().add_break()
            continue
        run = par.add_run(r["t"])
        if r.get("b") or b.get("titulo"):
            run.bold = True
        if r.get("i"):
            run.italic = True
        if r.get("u"):
            run.underline = True
        if r.get("s"):
            run.font.strike = True
        if r.get("sup"):
            run.font.superscript = True
        if r.get("sub"):
            run.font.subscript = True
        if fmt.get("fuente"):
            run.font.name = fmt["fuente"]
            rpr = run._r.get_or_add_rPr()
            rfonts = rpr.find(_qn("w:rFonts"))
            if rfonts is not None:
                rfonts.set(_qn("w:eastAsia"), fmt["fuente"])
                rfonts.set(_qn("w:cs"), fmt["fuente"])
        if fmt.get("tamano"):
            run.font.size = Pt(fmt["tamano"])


def _estilo_si_existe(doc, *nombres):
    for n in nombres:
        try:
            return doc.styles[n]
        except KeyError:
            continue
    return None


def _agregar_bloques(contenedor, bloques, fmt, doc, primer_par=None):
    """Agrega bloques a doc o a una celda. primer_par: párrafo vacío a reutilizar."""
    from docx.shared import Pt
    for b in bloques:
        if b["tipo"] == "tabla":
            _agregar_tabla(contenedor, b, fmt, doc)
            continue
        if primer_par is not None:
            par, primer_par = primer_par, None
        else:
            par = contenedor.add_paragraph()
        if b.get("lista"):
            estilo = _estilo_si_existe(doc, "List Bullet", "Lista con viñetas") if b["lista"] == "ul" \
                else _estilo_si_existe(doc, "List Number", "Lista con números")
            if estilo is not None and b["lista"] == "ul":
                par.style = estilo
            else:
                pref = "•\t" if b["lista"] == "ul" else f"{b.get('numero', 1)}.\t"
                b = dict(b, runs=[{"t": pref}] + b["runs"])
                b.setdefault("izq", 0)
                b["izq"] = (b.get("izq") or 0) + 18
                b["primera"] = -18
        if b.get("titulo") == 1:
            est = _estilo_si_existe(doc, "Heading 1", "Título 1")
            if est is not None:
                par.style = est
        elif b.get("titulo") == 2:
            est = _estilo_si_existe(doc, "Heading 2", "Título 2")
            if est is not None:
                par.style = est
        _aplicar_par(par, b, fmt, doc)
        _aplicar_runs(par, b, fmt)


def _agregar_tabla(contenedor, b, fmt, doc):
    ncols = max(sum(c["colspan"] for c in fila) for fila in b["filas"])
    tabla = contenedor.add_table(rows=len(b["filas"]), cols=ncols)
    est = _estilo_si_existe(doc, "Table Grid", "Tabla con cuadrícula")
    if est is not None:
        try:
            tabla.style = est
        except Exception:
            pass
    else:
        _bordes_tabla(tabla)
    for i, fila in enumerate(b["filas"]):
        col = 0
        for c in fila:
            celda = tabla.cell(i, col)
            if c["colspan"] > 1 and col + c["colspan"] - 1 < ncols:
                celda = celda.merge(tabla.cell(i, col + c["colspan"] - 1))
            _agregar_bloques(celda, c["bloques"] or [{"tipo": "p", "runs": []}], fmt, doc,
                             primer_par=celda.paragraphs[0])
            col += c["colspan"]


def _bordes_tabla(tabla):
    from docx.oxml import OxmlElement
    tbl_pr = tabla._tbl.tblPr
    bordes = OxmlElement("w:tblBorders")
    for lado in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{lado}")
        e.set(_qn("w:val"), "single")
        e.set(_qn("w:sz"), "4")
        e.set(_qn("w:color"), "000000")
        bordes.append(e)
    tbl_pr.append(bordes)


def armar_docx(base: bytes | None, html: str) -> bytes:
    doc, fmt = _doc_base(base)
    bloques = html_a_bloques(html) or [{"tipo": "p", "runs": []}]
    _agregar_bloques(doc, bloques, fmt, doc)
    # Word exige que una celda/documento no termine en tabla: párrafo final
    if bloques and bloques[-1]["tipo"] == "tabla":
        doc.add_paragraph()
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ═══════════════════════════════════════════════════════════════
# HTML → PDF (reportlab, sin depender de Word ni LibreOffice)
# ═══════════════════════════════════════════════════════════════

_SANS = ("arial", "helvetica", "calibri", "verdana", "tahoma", "segoe", "trebuchet", "century gothic", "aptos")


def _familia(fuente: str | None) -> tuple[str, str, str, str]:
    f = (fuente or "").lower()
    if any(s in f for s in _SANS):
        return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"
    if "courier" in f:
        return "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"
    return "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"


def _registrar_familia(fams):
    from reportlab.lib.fonts import addMapping
    n, b, i, bi = fams
    addMapping(n, 0, 0, n)
    addMapping(n, 1, 0, b)
    addMapping(n, 0, 1, i)
    addMapping(n, 1, 1, bi)


def _texto_rl(t: str) -> str:
    t = t.replace("\t", " " * 8).replace(" ", "  ").replace(" ", " ")
    # Espacios múltiples: reportlab los colapsa; se conservan con no-separables
    t = re.sub(r"  +", lambda m: " " * len(m.group(0)), t)
    return escape(t, quote=False)


def _runs_rl(b) -> str:
    out = []
    for r in b["runs"]:
        if r.get("br"):
            out.append("<br/>")
            continue
        h = _texto_rl(r["t"])
        for k, tag in (("b", "b"), ("i", "i"), ("u", "u"), ("s", "strike"), ("sup", "super"), ("sub", "sub")):
            if r.get(k):
                h = f"<{tag}>{h}</{tag}>"
        out.append(h)
    txt = "".join(out)
    if b.get("titulo"):
        txt = f"<b>{txt}</b>"
    return txt


def _flowables(bloques, fmt, ancho, fams):
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib import colors

    tam = float(fmt.get("tamano_efectivo") or 12)
    il = fmt.get("interlineado")
    if isinstance(il, tuple):
        leading = il[1]
    else:
        leading = tam * 1.17 * float(il if isinstance(il, float) else fmt.get("interlineado_efectivo") or 1.0)
    despues = fmt.get("despues") or 0
    antes = fmt.get("antes") or 0
    alinear = {"center": TA_CENTER, "right": TA_RIGHT, "justify": TA_JUSTIFY, "left": TA_LEFT}

    out = []
    for b in bloques:
        if b["tipo"] == "tabla":
            ncols = max(sum(c["colspan"] for c in fila) for fila in b["filas"])
            datos, spans = [], []
            for i, fila in enumerate(b["filas"]):
                fila_rl, col = [], 0
                for c in fila:
                    fila_rl.append(_flowables(c["bloques"], fmt, ancho / ncols, fams) or "")
                    if c["colspan"] > 1:
                        spans.append(("SPAN", (col, i), (col + c["colspan"] - 1, i)))
                        fila_rl.extend([""] * (c["colspan"] - 1))
                    col += c["colspan"]
                fila_rl.extend([""] * (ncols - len(fila_rl)))
                datos.append(fila_rl)
            t = Table(datos, colWidths=[ancho / ncols] * ncols)
            t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP")] + spans))
            out.append(t)
            continue
        izq = b.get("izq") or 0
        pri = b.get("primera") or 0
        bullet = None
        if b.get("lista"):
            izq += 18
            bullet = "•" if b["lista"] == "ul" else f"{b.get('numero', 1)}."
        tam_b = tam * (1.25 if b.get("titulo") == 1 else 1.1 if b.get("titulo") == 2 else 1)
        estilo = ParagraphStyle(
            "p", fontName=fams[0], fontSize=tam_b, leading=leading * tam_b / tam,
            alignment=alinear.get(b.get("align") or "left", TA_LEFT),
            leftIndent=izq, firstLineIndent=pri, spaceAfter=despues, spaceBefore=antes,
            bulletIndent=izq - 14 if bullet else 0, bulletFontName=fams[0], bulletFontSize=tam_b,
        )
        txt = _runs_rl(b) or " "
        try:
            out.append(Paragraph(txt, estilo, bulletText=bullet))
        except Exception:
            out.append(Paragraph(escape("".join(r.get("t", " ") for r in b["runs"])) or " ", estilo))
    return out


def _encabezado_pie(doc, parte, fmt, fams):
    """Flowables del encabezado o pie (texto + imágenes) de la 1ª sección."""
    from docx.table import Table as DTable
    from docx.text.paragraph import Paragraph as DPar
    from reportlab.platypus import Image as RLImage
    hf = None
    try:
        sec = doc.sections[-1]
        # Si la última sección "hereda" el membrete, se busca hacia atrás
        for s in reversed(list(doc.sections)):
            cand = s.header if parte == "header" else s.footer
            if not cand.is_linked_to_previous:
                hf = cand
                break
    except Exception:
        return []
    if hf is None:
        return []
    out = []
    ancho_util = (sec.page_width - sec.left_margin - sec.right_margin) / 12700
    for el in hf._element.iterchildren():
        if el.tag == _qn("w:p"):
            par = DPar(el, hf)
            # Imágenes del párrafo
            for blip in el.xpath(".//a:blip"):
                rid = blip.get(_qn("r:embed"))
                try:
                    blob = hf.part.related_parts[rid].blob
                    ext = blip.xpath("ancestor::wp:inline/wp:extent | ancestor::wp:anchor/wp:extent")
                    w = int(ext[0].get("cx")) / 12700 if ext else 100
                    h = int(ext[0].get("cy")) / 12700 if ext else 50
                    if w > ancho_util:
                        h, w = h * ancho_util / w, ancho_util
                    img = RLImage(io.BytesIO(blob), width=w, height=h)
                    al = _alineacion_par(par)
                    img.hAlign = {"center": "CENTER", "right": "RIGHT"}.get(al, "LEFT")
                    out.append(img)
                except Exception:
                    continue
            if par.text.strip():
                _, h = _par_a_html(par, doc)
                out.extend(_flowables(html_a_bloques(h), dict(fmt, despues=0, antes=0, interlineado=1.0),
                                      ancho_util, fams))
        elif el.tag == _qn("w:tbl"):
            # Tabla del membrete (logo a un lado, texto al otro): se aplana
            for fila in DTable(el, hf).rows:
                for celda in fila.cells:
                    for p in celda.paragraphs:
                        if p.text.strip():
                            _, h = _par_a_html(p, doc)
                            out.extend(_flowables(html_a_bloques(h), dict(fmt, despues=0, antes=0, interlineado=1.0),
                                                  ancho_util, fams))
    return out


def armar_pdf(base: bytes | None, html: str) -> bytes:
    from reportlab.platypus import SimpleDocTemplate, Frame, KeepInFrame
    from reportlab.lib.pagesizes import A4

    pagina, margenes = A4, (85, 57, 71, 71)  # izq, der, arriba, abajo (pt)
    enc, pie = [], []
    fmt = {"fuente_efectiva": "Times New Roman", "tamano_efectivo": 12, "interlineado_efectivo": 1.5,
           "interlineado": 1.5}
    dist_enc = dist_pie = 35
    if base:
        from docx import Document
        doc = Document(io.BytesIO(base))
        fmt = _formato_base(doc)
        s = doc.sections[-1]
        try:
            pagina = (s.page_width.pt, s.page_height.pt)
            margenes = (s.left_margin.pt, s.right_margin.pt, s.top_margin.pt, s.bottom_margin.pt)
            dist_enc = s.header_distance.pt if s.header_distance is not None else 35
            dist_pie = s.footer_distance.pt if s.footer_distance is not None else 35
        except Exception:
            pass
    fams = _familia(fmt.get("fuente_efectiva"))
    _registrar_familia(fams)
    if base:
        enc = _encabezado_pie(doc, "header", fmt, fams)
        pie = _encabezado_pie(doc, "footer", fmt, fams)

    izq, der, arriba, abajo = margenes
    ancho = pagina[0] - izq - der

    # Como en Word: si el membrete no entra en el margen, empuja el cuerpo
    def _alto(fl):
        total = 0
        for x in fl:
            try:
                total += x.wrap(ancho, 10000)[1] + x.getSpaceBefore() + x.getSpaceAfter()
            except Exception:
                pass
        return total
    if enc:
        arriba = max(arriba, dist_enc + _alto(enc) + 8)
    if pie:
        abajo = max(abajo, dist_pie + _alto(pie) + 8)

    def en_pagina(canvas, _doc):
        canvas.saveState()
        if enc:
            alto = max(arriba - dist_enc - 2, 20)
            f = Frame(izq, pagina[1] - dist_enc - alto, ancho, alto, 0, 0, 0, 0, showBoundary=0)
            f.addFromList([KeepInFrame(ancho, alto, list(enc), mode="shrink")], canvas)
        if pie:
            alto = max(abajo - dist_pie - 2, 20)
            f = Frame(izq, dist_pie, ancho, alto, 0, 0, 0, 0, showBoundary=0)
            f.addFromList([KeepInFrame(ancho, alto, list(pie), mode="shrink")], canvas)
        canvas.restoreState()

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=pagina, leftMargin=izq, rightMargin=der,
                            topMargin=arriba, bottomMargin=abajo, title="Proyecto de dictamen")
    cuerpo = _flowables(html_a_bloques(html) or [{"tipo": "p", "runs": []}], fmt, ancho, fams)
    pdf.build(cuerpo, onFirstPage=en_pagina, onLaterPages=en_pagina)
    return buf.getvalue()
