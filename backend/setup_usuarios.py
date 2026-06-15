"""
Configura el roster real de usuarios de la Defensoría.

- Crea los que falten y actualiza rol/contraseña de los que ya existan (upsert).
- Desactiva cualquier usuario genérico de prueba que no esté en el roster
  (salvo el admin, que se conserva para gestión interna).

Uso:  python setup_usuarios.py
"""

from app.database import SessionLocal, init_db
from app.models import Usuario
from app.utils.auth import hashear_contraseña

# (nombre, email, rol)  — la contraseña se genera como <email-local>123
DESPACHANTES = ["Juan", "Tobías", "Julia", "Catalina", "Josefina",
                "Augusto", "Delfina", "Camila", "Clarisa", "Sofía"]
SECRETARIAS = ["Silvana", "Brenda", "Laura"]
DEFENSORA = ["Stella"]

# Mapa nombre -> parte local del email (sin acentos)
EMAIL_LOCAL = {
    "Juan": "juan", "Tobías": "tobias", "Julia": "julia", "Catalina": "catalina",
    "Josefina": "josefina", "Augusto": "augusto", "Delfina": "delfina",
    "Camila": "camila", "Clarisa": "clarisa", "Sofía": "sofia",
    "Silvana": "silvana", "Brenda": "brenda", "Laura": "laura", "Stella": "stella",
}


def construir_roster():
    roster = []
    for nombre in DESPACHANTES:
        roster.append((nombre, "despachante"))
    for nombre in SECRETARIAS:
        roster.append((nombre, "secretaria"))
    for nombre in DEFENSORA:
        roster.append((nombre, "defensora"))
    return roster


def aplicar():
    init_db()
    db = SessionLocal()
    try:
        roster = construir_roster()
        emails_roster = set()
        filas_credenciales = []

        for nombre, rol in roster:
            local = EMAIL_LOCAL[nombre]
            email = f"{local}@defensoria.local"
            contraseña = f"{local}123"
            emails_roster.add(email)

            usuario = db.query(Usuario).filter(Usuario.email == email).first()
            if usuario:
                usuario.nombre = nombre
                usuario.rol = rol
                usuario.activo = True
                usuario.contraseña_hash = hashear_contraseña(contraseña)
            else:
                db.add(Usuario(
                    email=email, nombre=nombre, rol=rol,
                    contraseña_hash=hashear_contraseña(contraseña),
                ))
            filas_credenciales.append((nombre, rol, email, contraseña))

        # Desactivar usuarios de prueba que no estén en el roster (menos admin)
        otros = db.query(Usuario).filter(
            Usuario.rol != "admin",
            ~Usuario.email.in_(emails_roster),
        ).all()
        for u in otros:
            u.activo = False

        db.commit()

        print("[OK] Roster configurado.\n")
        print(f"{'NOMBRE':<12}{'ROL':<14}{'USUARIO (email)':<32}{'CONTRASEÑA'}")
        print("-" * 76)
        for nombre, rol, email, pwd in filas_credenciales:
            # ascii-safe para la consola cp1252
            n = nombre.encode('ascii', 'replace').decode()
            print(f"{n:<12}{rol:<14}{email:<32}{pwd}")
        if otros:
            print(f"\nUsuarios de prueba desactivados: {', '.join(u.email for u in otros)}")
        print("\nAdmin (gestión interna): admin@defensoria.local / admin123")
    finally:
        db.close()


if __name__ == "__main__":
    aplicar()
