"""
Almacenamiento de archivos adjuntos.

- En PRODUCCIÓN (con SUPABASE_URL + SUPABASE_SERVICE_KEY definidos): guarda y
  lee los archivos en Supabase Storage. Así NO se pierden cuando el servidor se
  reinicia o se actualiza (el disco del plan gratis de Render es efímero).
- En DESARROLLO (tu PC, sin esas variables): usa el disco local en ./uploads,
  igual que antes.

La base de datos guarda siempre una ruta relativa "/uploads/<nombre>"; el
backend resuelve de dónde leer el archivo según el entorno. El bucket de
Supabase debe ser PRIVADO: solo el backend (con la service key) lo lee, y los
archivos se sirven a través del propio backend.
"""

import os
import urllib.request
import urllib.error
from pathlib import Path

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def _config():
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    # Tolerante: si pegaron el "RESTful endpoint" (u otro) en vez de la Project
    # URL pelada (https://xxxx.supabase.co), sacamos el sufijo de más.
    for suf in ("/rest/v1", "/rest", "/storage/v1", "/auth/v1"):
        if url.endswith(suf):
            url = url[: -len(suf)]
    return (
        url,
        os.getenv("SUPABASE_SERVICE_KEY", "").strip(),
        (os.getenv("SUPABASE_BUCKET", "adjuntos").strip() or "adjuntos"),
    )


def usa_supabase() -> bool:
    url, key, _ = _config()
    return bool(url and key)


def guardar(nombre: str, contenido: bytes, content_type: str = "application/octet-stream") -> None:
    """Guarda los bytes de un archivo con el nombre dado."""
    url, key, bucket = _config()
    if url and key:
        endpoint = f"{url}/storage/v1/object/{bucket}/{nombre}"
        req = urllib.request.Request(
            endpoint,
            data=contenido,
            method="POST",
            headers={
                "Authorization": f"Bearer {key}",
                "apikey": key,
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            detalle = e.read().decode(errors="ignore")[:300]
            raise RuntimeError(f"Supabase Storage {e.code}: {detalle}")
        except Exception as e:
            raise RuntimeError(f"No se pudo conectar con Supabase Storage: {e}")
    else:
        (UPLOAD_DIR / nombre).write_bytes(contenido)


def leer(nombre: str) -> bytes | None:
    """Devuelve los bytes de un archivo, o None si no existe."""
    url, key, bucket = _config()
    if url and key:
        endpoint = f"{url}/storage/v1/object/{bucket}/{nombre}"
        req = urllib.request.Request(endpoint, headers={"Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError:
            return None
    p = UPLOAD_DIR / nombre
    return p.read_bytes() if p.is_file() else None
