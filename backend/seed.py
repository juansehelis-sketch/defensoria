"""
Script de carga inicial de datos.
Crea el usuario admin y los despachantes que aparecen en la planilla y en las reglas.

Uso:  python seed.py
Es idempotente: si un usuario ya existe, no lo duplica.
"""

from app.database import SessionLocal, init_db
from app.models import Usuario
from app.utils.auth import hashear_contraseña

# Usuarios iniciales: (email, nombre, rol, contraseña)
USUARIOS_INICIALES = [
    ("admin@defensoria.local", "Administrador", "admin", "admin123"),
    ("defensora@defensoria.local", "Defensora", "defensora", "defensora123"),
    ("secretaria@defensoria.local", "Secretaría", "secretaria", "secretaria123"),
    # Despachantes (aparecen en la planilla de entrada/salida y en las reglas)
    ("delfina@defensoria.local", "Delfina", "despachante", "cambiar123"),
    ("clarisa@defensoria.local", "Clarisa", "despachante", "cambiar123"),
    ("camila@defensoria.local", "Camila", "despachante", "cambiar123"),
    ("sofia@defensoria.local", "Sofía", "despachante", "cambiar123"),
    ("catalina@defensoria.local", "Catalina", "despachante", "cambiar123"),
    ("augusto@defensoria.local", "Augusto", "despachante", "cambiar123"),
    ("josefina@defensoria.local", "Josefina", "despachante", "cambiar123"),
    ("laura@defensoria.local", "Laura", "despachante", "cambiar123"),
    ("brenda@defensoria.local", "Brenda", "despachante", "cambiar123"),
    ("tobias@defensoria.local", "Tobías", "despachante", "cambiar123"),
    ("julia@defensoria.local", "Julia", "despachante", "cambiar123"),
    ("silvana@defensoria.local", "Silvana", "despachante", "cambiar123"),
    ("juan@defensoria.local", "Juan", "despachante", "cambiar123"),
]


def cargar():
    init_db()
    db = SessionLocal()
    creados = 0
    try:
        for email, nombre, rol, contraseña in USUARIOS_INICIALES:
            existe = db.query(Usuario).filter(Usuario.email == email).first()
            if existe:
                continue
            usuario = Usuario(
                email=email,
                nombre=nombre,
                rol=rol,
                contraseña_hash=hashear_contraseña(contraseña),
            )
            db.add(usuario)
            creados += 1
        db.commit()
        print(f"[OK] Carga inicial completa. Usuarios nuevos creados: {creados}")
        print("\nCredenciales de acceso principales:")
        print("  admin@defensoria.local       / admin123")
        print("  defensora@defensoria.local   / defensora123")
        print("  secretaria@defensoria.local  / secretaria123")
        print("  (despachantes) <nombre>@defensoria.local / cambiar123")
    finally:
        db.close()


if __name__ == "__main__":
    cargar()
