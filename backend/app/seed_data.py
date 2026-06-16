"""
Crea el roster inicial de usuarios si la base está VACÍA.
Sirve para los despliegues donde no hay consola (ej. Render gratis): la app, al
arrancar por primera vez contra una base vacía, crea los usuarios sola.
Es idempotente: si ya hay usuarios, no hace nada.
"""

from app.models import Usuario
from app.utils.auth import hashear_contraseña

# (nombre, parte-local-del-email, rol)
ROSTER = [
    ("Juan", "juan", "despachante"),
    ("Tobías", "tobias", "despachante"),
    ("Julia", "julia", "despachante"),
    ("Catalina", "catalina", "despachante"),
    ("Josefina", "josefina", "despachante"),
    ("Augusto", "augusto", "despachante"),
    ("Delfina", "delfina", "despachante"),
    ("Camila", "camila", "despachante"),
    ("Clarisa", "clarisa", "despachante"),
    ("Sofía", "sofia", "despachante"),
    ("Silvana", "silvana", "secretaria"),
    ("Brenda", "brenda", "secretaria"),
    ("Laura", "laura", "secretaria"),
    ("Stella", "stella", "defensora"),
    ("Administrador", "admin", "admin"),
]


def crear_roster_si_vacio(db) -> int:
    """Si no hay ningún usuario, crea el roster. Devuelve cuántos creó."""
    if db.query(Usuario).count() > 0:
        return 0
    creados = 0
    for nombre, local, rol in ROSTER:
        contraseña = "admin123" if rol == "admin" else f"{local}123"
        db.add(Usuario(
            email=f"{local}@defensoria.local",
            nombre=nombre,
            rol=rol,
            contraseña_hash=hashear_contraseña(contraseña),
        ))
        creados += 1
    db.commit()
    return creados
