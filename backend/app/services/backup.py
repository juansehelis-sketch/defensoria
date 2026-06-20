"""
Copias de seguridad automáticas de la base local (SQLite).

- Hace una copia al arrancar y luego cada X horas mientras la app corre.
- Usa la API de backup de SQLite (copia consistente aunque la base esté en uso).
- Conserva las últimas MAX_BACKUPS y borra las más viejas.
- En producción (Postgres/Supabase) no hace nada: Supabase ya tiene sus backups.
"""

import time
import sqlite3
import threading
from pathlib import Path
from app.config import settings

BACKUP_DIR = Path("backups")
MAX_BACKUPS = 20


def _ruta_sqlite():
    url = settings.DATABASE_URL or ""
    if not url.startswith("sqlite"):
        return None
    archivo = url.split("///")[-1]  # sqlite:///./defensoría.db → ./defensoría.db
    p = Path(archivo)
    return p if p.exists() else None


def hacer_backup():
    """Crea una copia con fecha/hora. Devuelve la ruta, o None si no aplica."""
    origen = _ruta_sqlite()
    if not origen:
        return None
    BACKUP_DIR.mkdir(exist_ok=True)
    destino = BACKUP_DIR / f"defensoria_{time.strftime('%Y%m%d_%H%M%S')}.db"
    try:
        src = sqlite3.connect(str(origen))
        dst = sqlite3.connect(str(destino))
        with dst:
            src.backup(dst)
        dst.close()
        src.close()
    except Exception as e:
        print(f"[!] No se pudo hacer el backup: {e}")
        return None
    _limpiar_viejos()
    _subir_a_nube(destino)
    return destino


def usa_nube() -> bool:
    """True si los backups también se suben a Supabase (configurado)."""
    try:
        from app.services import storage
        return storage.usa_supabase()
    except Exception:
        return False


def _subir_a_nube(ruta):
    """Sube la copia a Supabase Storage (carpeta backups/) si está configurado."""
    try:
        from app.services import storage
        if storage.usa_supabase():
            storage.guardar(f"backups/{ruta.name}", ruta.read_bytes(), "application/octet-stream")
    except Exception as e:
        print(f"[!] No se pudo subir el backup a la nube: {e}")


def restaurar(nombre: str, db_session=None):
    """
    Restaura la base local desde una copia. Antes hace una copia de seguridad del
    estado actual. Hay que reiniciar la app para que tome la base restaurada.
    """
    destino = _ruta_sqlite()
    origen = BACKUP_DIR / nombre
    if destino is None or not origen.exists():
        return None
    hacer_backup()  # resguardo del estado actual por las dudas
    from app.database import engine
    if db_session is not None:
        try:
            db_session.close()
        except Exception:
            pass
    engine.dispose()  # cerrar conexiones para poder reemplazar el archivo
    import shutil
    shutil.copy2(origen, destino)
    return {"ok": True, "restaurado": nombre}


def _limpiar_viejos():
    backups = sorted(BACKUP_DIR.glob("defensoria_*.db"))
    for viejo in backups[:-MAX_BACKUPS]:
        try:
            viejo.unlink()
        except Exception:
            pass


def listar_backups():
    if not BACKUP_DIR.exists():
        return []
    items = []
    for f in sorted(BACKUP_DIR.glob("defensoria_*.db"), reverse=True):
        st = f.stat()
        items.append({"nombre": f.name, "kb": round(st.st_size / 1024), "fecha": st.st_mtime})
    return items


def iniciar_backups_periodicos(horas: int = 6):
    """Arranca un hilo que hace un backup cada 'horas' mientras la app corre."""
    if _ruta_sqlite() is None:
        return  # no es SQLite (ej. producción con Postgres)

    def _loop():
        while True:
            time.sleep(max(1, horas) * 3600)
            hacer_backup()

    threading.Thread(target=_loop, daemon=True).start()
