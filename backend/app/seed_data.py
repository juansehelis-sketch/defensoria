"""
Roster real del equipo (mails @mpd.gov.ar) con dos funciones:
- crear_roster_si_vacio: en un despliegue nuevo (base vacía) crea los usuarios
  solos, sin consola (ej. Render gratis). Idempotente.
- migrar_roster_mpd: pasa los usuarios viejos (@defensoria.local) a sus mails
  reales y les carga el cargo. Solo toca a quienes todavía tienen el mail viejo,
  así los cambios manuales posteriores (rol, cargo) no se pisan en cada arranque.
"""

import unicodedata

from app.models import Usuario
from app.utils.auth import hashear_contraseña

# (nombre, email, rol, cargo, parte-local del mail viejo @defensoria.local)
ROSTER = [
    ("Stella",   "sgarciavigo@mpd.gov.ar",   "defensora",   None,                   "stella"),
    ("Silvana",  "sassis@mpd.gov.ar",        "secretaria",  None,                   "silvana"),
    ("Brenda",   "bflorentin@mpd.gov.ar",    "secretaria",  None,                   "brenda"),
    ("Laura",    "ldiloreto@mpd.gov.ar",     "secretaria",  None,                   "laura"),
    ("Josefina", "mdempaire@mpd.gov.ar",     "despachante", "prosecretaria",        "josefina"),
    ("Clarisa",  "ccancino@mpd.gov.ar",      "despachante", "jefa de despacho",     "clarisa"),
    ("Sofía",    "srodriguez@mpd.gov.ar",    "despachante", "jefa de despacho",     "sofia"),
    ("Augusto",  "ccaro@mpd.gov.ar",         "despachante", "oficial mayor",        "augusto"),
    ("Camila",   "mcarrizo@mpd.gov.ar",      "despachante", "oficial",              "camila"),
    ("Delfina",  "dmgarcia@mpd.gov.ar",      "despachante", "escribiente",          "delfina"),
    ("Tobías",   "tcanicoba@mpd.gov.ar",     "despachante", "escribiente auxiliar", "tobias"),
    ("Juanse",   "jheliszkowski@mpd.gov.ar", "despachante", "escribiente auxiliar", "juan"),
    ("Catalina", "mrichards@mpd.gov.ar",     "despachante", "servicio social",      "catalina"),
    ("Julia",    "mbavestrello@mpd.gov.ar",  "despachante", "servicio social",      "julia"),
    ("Administrador", "admin@defensoria.local", "admin",    None,                   "admin"),
]


def _clave_inicial(nombre: str, rol: str) -> str:
    """Contraseña inicial: nombre en minúsculas sin tildes + '123' (admin123 para el admin)."""
    if rol == "admin":
        return "admin123"
    base = unicodedata.normalize("NFD", nombre.split()[0].lower())
    base = "".join(c for c in base if not unicodedata.combining(c))
    return base + "123"


def crear_roster_si_vacio(db) -> int:
    """Si no hay ningún usuario, crea el roster. Devuelve cuántos creó."""
    if db.query(Usuario).count() > 0:
        return 0
    creados = 0
    for nombre, email, rol, cargo, _viejo in ROSTER:
        db.add(Usuario(
            email=email,
            nombre=nombre,
            rol=rol,
            cargo=cargo,
            contraseña_hash=hashear_contraseña(_clave_inicial(nombre, rol)),
        ))
        creados += 1
    db.commit()
    return creados


def migrar_roster_mpd(db) -> int:
    """
    Actualiza a los mails reales @mpd.gov.ar los usuarios que todavía tienen el
    mail viejo @defensoria.local (conservan su contraseña). Devuelve cuántos
    cambió. Si el mail nuevo ya existe, no toca nada (ya está migrado).
    """
    cambios = 0
    for nombre, email, rol, cargo, viejo in ROSTER:
        if not viejo or email.endswith("@defensoria.local"):
            continue
        if db.query(Usuario).filter(Usuario.email == email).first():
            continue  # ya migrado o creado nuevo: no pisar cambios manuales
        u = db.query(Usuario).filter(Usuario.email == f"{viejo}@defensoria.local").first()
        if not u:
            continue
        u.email = email
        u.nombre = nombre
        u.rol = rol
        u.cargo = cargo
        cambios += 1
    if cambios:
        db.commit()
    return cambios
