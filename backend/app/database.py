"""
Configuración de la base de datos SQLite.
"""

from sqlalchemy import create_engine, event, Engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# IMPORTANTE (multiusuario): los endpoints síncronos de FastAPI corren en un pool
# de hilos, así que necesitamos un pool de conexiones real (NO una sola conexión
# compartida). check_same_thread=False permite que cada conexión se use desde el
# hilo que la toma del pool. El modo WAL (más abajo) mejora la concurrencia de
# lecturas/escrituras simultáneas.
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_size=10,
        max_overflow=20,
        echo=False,
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, echo=False)

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


def init_db():
    """Crea todas las tablas."""
    Base.metadata.create_all(bind=engine)
