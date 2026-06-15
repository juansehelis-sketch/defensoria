"""
Importa la planilla de Entrada/Salida (Excel) al sistema.

- Cada fila con expediente se carga como un registro del listado diario (EntradaSalida).
- Además se crea/actualiza el registro único de cada expediente (Expediente),
  quedando asignado a la ÚLTIMA persona que lo llevó (regla principal de la Defensoría).

Uso:  python importar_excel.py "ruta\\al\\archivo.xlsx" [NombreHoja]
Por defecto usa el Excel de Descargas y la hoja "Febrero - Julio".

OJO: vacía las tablas entrada_salida y expedientes antes de importar
(no toca los usuarios). Es para la carga inicial.
"""

import sys
import unicodedata
import warnings
from datetime import datetime, date

import openpyxl

from app.database import SessionLocal, init_db
from app.models import Usuario, Expediente, EntradaSalida

warnings.filterwarnings("ignore")  # openpyxl avisa por celdas con fechas corruptas

RUTA_DEFAULT = r"C:\Users\juans\Downloads\Entrada y Salida 2026 (1).xlsx"
HOJA_DEFAULT = "Febrero - Julio"


def normalizar_nombre(s: str) -> str:
    """minúsculas + sin acentos, para matchear asignación contra usuarios."""
    s = (s or "").strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return s


def normalizar_numero(raw) -> str:
    """Limpia el número de expediente: saca el asterisco final y espacios."""
    s = str(raw or "").strip()
    s = s.replace("*", "").strip()
    return s


def a_fecha(valor):
    """
    Devuelve date o None.

    OJO con el bug de Excel: las fechas que el usuario escribió en formato
    argentino (dd/mm) y que eran ambiguas (día ≤ 12) Excel las interpretó como
    formato yanqui (mm/dd) y las guardó como datetime con MES y DÍA INVERTIDOS.
    Las no ambiguas (día > 12) quedaron como TEXTO en dd/mm (correctas).
    Por eso: a las celdas datetime hay que darles vuelta mes↔día; a las de texto
    se las parsea como dd/mm.
    """
    if isinstance(valor, datetime):
        # Revertir la inversión mes/día (valor.day siempre ≤ 12 acá)
        try:
            return date(valor.year, valor.day, valor.month)
        except ValueError:
            return valor.date()
    if isinstance(valor, date):
        return valor
    s = str(valor or "").strip()
    if not s or set(s) <= {"-", " "}:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            d = datetime.strptime(s, fmt).date()
            if d.year < 2000:  # typos tipo '05/02/0206'
                return None
            return d
        except ValueError:
            continue
    return None


def texto(valor) -> str:
    s = str(valor).strip() if valor is not None else ""
    # Observaciones tipo "----" se consideran vacías
    if set(s) <= {"-", " "} and s:
        return ""
    return s


def importar(ruta: str, hoja: str):
    init_db()
    db = SessionLocal()

    # Mapa nombre-normalizado -> usuario (para asignar despachante)
    usuarios = db.query(Usuario).all()
    mapa_usuarios = {normalizar_nombre(u.nombre): u for u in usuarios}

    print(f"Leyendo '{ruta}' hoja '{hoja}'...")
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    ws = wb[hoja]
    filas = list(ws.iter_rows(values_only=True))[1:]  # saltar encabezado

    # Quedarnos con filas que tienen expediente, ordenadas por fecha ascendente
    registros = []
    for f in filas:
        numero = normalizar_numero(f[2] if len(f) > 2 else "")
        if not numero:
            continue
        registros.append({
            "fecha": a_fecha(f[0]),
            "juzgado": texto(f[1]),
            "numero": numero,
            "autos": texto(f[3]) if len(f) > 3 else "",
            "asignacion": texto(f[4]) if len(f) > 4 else "",
            "pase_firma": a_fecha(f[5]) if len(f) > 5 else None,
            "subido_lex": a_fecha(f[6]) if len(f) > 6 else None,
            "observaciones": texto(f[7]) if len(f) > 7 else "",
            "subido_defensa": str(f[8]).strip().lower() in ("true", "verdadero", "1", "sí", "si")
                              if len(f) > 8 and f[8] is not None else False,
        })

    # Orden por fecha (las sin fecha al final) para que gane la última asignación
    registros.sort(key=lambda r: r["fecha"] or date.min)

    # Limpiar tablas de datos (no usuarios)
    print("Vaciando datos previos (expedientes, listado, proyectos, notificaciones)...")
    from app.models import Proyecto, Notificacion, Historial, Audiencia
    db.query(Proyecto).delete()
    db.query(Notificacion).delete()
    db.query(Historial).delete()
    db.query(Audiencia).delete()
    db.query(EntradaSalida).delete()
    db.query(Expediente).delete()
    db.commit()

    # Crear/actualizar expedientes únicos
    expedientes = {}  # numero -> Expediente
    for r in registros:
        num = r["numero"]
        exp = expedientes.get(num)
        if exp is None:
            exp = Expediente(
                numero=num,
                juzgado=r["juzgado"],
                caratula=r["autos"],
                estado="activo",
                fecha_entrada=r["fecha"] or date.today(),
                observaciones=r["observaciones"],
                conexos=[],
            )
            expedientes[num] = exp
            db.add(exp)
        else:
            # Mantener la carátula/juzgado más completos y la entrada más temprana
            if r["autos"] and len(r["autos"]) > len(exp.caratula or ""):
                exp.caratula = r["autos"]
            if r["fecha"] and (exp.fecha_entrada is None or r["fecha"] < exp.fecha_entrada):
                exp.fecha_entrada = r["fecha"]
        # La última asignación válida (por orden de fecha) gana
        u = mapa_usuarios.get(normalizar_nombre(r["asignacion"]))
        if u:
            exp.despachante_id = u.id

    db.flush()  # asignar ids a los expedientes

    # Crear las filas del listado diario, vinculadas al expediente
    for r in registros:
        exp = expedientes[r["numero"]]
        db.add(EntradaSalida(
            fecha=r["fecha"] or date.today(),
            juzgado=r["juzgado"],
            expediente_id=exp.id,
            autos=r["autos"],
            asignacion=r["asignacion"],
            pase_firma=r["pase_firma"],
            subido_lex=r["subido_lex"],
            observaciones=r["observaciones"],
            subido_defensa=r["subido_defensa"],
        ))

    db.commit()

    asignados = sum(1 for e in expedientes.values() if e.despachante_id)
    print(f"[OK] Importacion completa.")
    print(f"     Registros del listado (EntradaSalida): {len(registros)}")
    print(f"     Expedientes unicos creados: {len(expedientes)}")
    print(f"     Expedientes con despachante asignado: {asignados}")
    db.close()


if __name__ == "__main__":
    ruta = sys.argv[1] if len(sys.argv) > 1 else RUTA_DEFAULT
    hoja = sys.argv[2] if len(sys.argv) > 2 else HOJA_DEFAULT
    importar(ruta, hoja)
