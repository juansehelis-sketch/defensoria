"""
Configuración de la base de datos SQLite.
"""

from sqlalchemy import create_engine, event, Engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Algunos proveedores (Supabase, Heroku) dan la URL como "postgres://", pero
# SQLAlchemy 2.0 requiere "postgresql://". La normalizamos.
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# IMPORTANTE (multiusuario): los endpoints síncronos de FastAPI corren en un pool
# de hilos, así que necesitamos un pool de conexiones real (NO una sola conexión
# compartida).
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    # check_same_thread=False permite usar la conexión desde el hilo del pool.
    # El modo WAL (más abajo) mejora la concurrencia.
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_size=10,
        max_overflow=20,
        echo=False,
    )
else:
    # Postgres en la nube (Supabase): SSL obligatorio + pre-ping para reconectar
    # cuando el proveedor cierra conexiones inactivas.
    connect_args = {}
    if SQLALCHEMY_DATABASE_URL.startswith("postgresql"):
        connect_args["sslmode"] = "require"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        connect_args=connect_args,
        echo=False,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Habilitar foreign keys en SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    if "sqlite" in SQLALCHEMY_DATABASE_URL:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")    # concurrencia lectura/escritura
        cursor.execute("PRAGMA busy_timeout=30000")  # esperar en vez de fallar si está ocupada
        cursor.close()


def get_db():
    """Dependencia para obtener sesión de BD en endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columnas agregadas después del primer despliegue. create_all() crea tablas nuevas
# pero NO modifica las existentes, así que las agregamos a mano (idempotente).
# Funciona en SQLite y Postgres. Para agregar columnas nuevas en el futuro,
# sumalas a esta lista.
_COLUMNAS_EXTRA = [
    ("audiencias", "asignado_a", "VARCHAR"),
    ("audiencias", "asistencia", "VARCHAR DEFAULT 'pendiente'"),
    ("carpetas_modelo", "categoria", "VARCHAR DEFAULT 'modelos'"),
    ("expedientes", "legajo_id", "INTEGER"),
]


def _asegurar_columnas():
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    tablas = insp.get_table_names()
    for tabla, columna, tipo in _COLUMNAS_EXTRA:
        if tabla not in tablas:
            continue
        existentes = [c["name"] for c in insp.get_columns(tabla)]
        if columna not in existentes:
            try:
                with engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}'))
                print(f"[OK] Columna agregada: {tabla}.{columna}")
            except Exception as e:
                print(f"[!] No se pudo agregar {tabla}.{columna}: {e}")


def init_db():
    """Crea las tablas y aplica las migraciones de columnas pendientes."""
    Base.metadata.create_all(bind=engine)
    _asegurar_columnas()
