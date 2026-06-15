"""
Backup de la base de datos SQLite.
Usa la API de backup de SQLite (consistente aunque la app esté en uso / modo WAL).
Guarda en backend/backups/ y conserva los últimos RETENER.

Uso:  python backup.py
Se programa para correr todo los días (ver INSTALAR.bat).
"""

import sqlite3
from datetime import datetime
from pathlib import Path

from app.config import settings

BASE = Path(__file__).resolve().parent
BACKUP_DIR = BASE / "backups"
RETENER = 30  # cuántos backups conservar


def _ruta_db() -> Path:
    url = settings.DATABASE_URL
    if url.startswith("sqlite:///"):
        return (BASE / url.replace("sqlite:///", "")).resolve()
    raise RuntimeError("backup.py solo soporta SQLite")


def hacer_backup():
    db = _ruta_db()
    if not db.exists():
        print(f"[!] No se encontró la base: {db}")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    destino = BACKUP_DIR / f"defensoria_{ts}.db"

    origen = sqlite3.connect(str(db))
    copia = sqlite3.connect(str(destino))
    try:
        with copia:
            origen.backup(copia)
    finally:
        origen.close()
        copia.close()

    print(f"[OK] Backup creado: {destino.name}  ({destino.stat().st_size // 1024} KB)")

    # Conservar solo los últimos RETENER
    backups = sorted(BACKUP_DIR.glob("defensoria_*.db"))
    for viejo in backups[:-RETENER]:
        viejo.unlink()
        print(f"     eliminado backup viejo: {viejo.name}")


if __name__ == "__main__":
    hacer_backup()
