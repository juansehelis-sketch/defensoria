"""
Aplicación principal FastAPI.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import init_db
from app.config import settings
from app.api import (
    usuarios,
    expedientes,
    entrada_salida,
    historial,
    audiencias,
    panel,
    reportes,
    proyectos,
    modelos,
)

# Crear app
app = FastAPI(
    title="Defensoría - Sistema de Gestión",
    description="API para gestión de expedientes y audiencias",
    version="0.1.0"
)

# CORS — orígenes permitidos.
# En local: frontend de Vite. En producción (front en otro dominio, ej. Vercel)
# se agregan los dominios desde la variable de entorno CORS_ORIGINS
# (separados por coma). Si el frontend se sirve desde el mismo backend, CORS no
# hace falta, pero no molesta.
_origenes = [settings.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"]
if settings.CORS_ORIGINS:
    _origenes += [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origenes,
    # Permite cualquier despliegue del frontend en Vercel (producción y previews)
    # sin tener que listar la URL exacta a mano.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Adjuntos: se sirven desde Supabase Storage (producción) o disco local (dev).
# Se usa una ruta propia en lugar de StaticFiles para poder leer de cualquiera
# de los dos orígenes según el entorno.
import mimetypes as _mime
from fastapi.responses import Response as _Response
from app.services import storage as _storage


@app.get("/uploads/{nombre}")
async def servir_adjunto(nombre: str):
    datos = _storage.leer(nombre)
    if datos is None:
        from fastapi.responses import JSONResponse as _JR
        return _JR({"detail": "Archivo no encontrado"}, status_code=404)
    media = _mime.guess_type(nombre)[0] or "application/octet-stream"
    return _Response(content=datos, media_type=media)

# Incluir routers
app.include_router(usuarios.router)
app.include_router(expedientes.router)
app.include_router(entrada_salida.router)
app.include_router(historial.router)
app.include_router(audiencias.router)
app.include_router(panel.router)
app.include_router(reportes.router)
app.include_router(proyectos.router)
app.include_router(modelos.router)

# Inicializar BD al startup
@app.on_event("startup")
async def startup_event():
    """Crea las tablas y, si la base está vacía, el roster inicial de usuarios."""
    init_db()
    # Auto-seed: en un despliegue nuevo (base vacía) crea los usuarios solo,
    # así no hace falta consola para sembrarlos.
    from app.database import SessionLocal
    from app.seed_data import crear_roster_si_vacio
    db = SessionLocal()
    try:
        n = crear_roster_si_vacio(db)
        if n:
            print(f"[OK] Roster inicial creado: {n} usuarios")
    except Exception as e:
        print(f"[!] No se pudo crear el roster inicial: {e}")
    finally:
        db.close()
    print("[OK] Base de datos inicializada")


@app.get("/api/health")
async def health_check():
    """Health check para monitoreo."""
    return {"status": "ok"}


# ── Servir el frontend compilado (modo producción / un solo servidor) ──
# Si existe frontend/dist, se sirve desde acá: así la app corre con UN solo
# servidor (más fácil de arrancar) y queda accesible en la red local.
# En desarrollo (sin dist) se usa Vite aparte en el puerto 5173.
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# Link público de la app (Vercel). El backend deja de servir la app y rebota ahí
# cuando lo piden por el dominio de Render: así queda UN solo link (Vercel) y
# Render queda solo de motor. En localhost / red local se sirve normalmente.
# Se puede cambiar el destino con la variable FRONTEND_URL=https://...
_APP_PUBLICA = settings.FRONTEND_URL if settings.FRONTEND_URL.startswith("https://") else "https://defensoria-fawn.vercel.app"

if DIST.exists():
    @app.get("/{full_path:path}")
    async def servir_spa(full_path: str, request: Request):
        # Las rutas de API y uploads no las maneja el frontend
        if full_path.startswith("api/") or full_path.startswith("uploads/"):
            return JSONResponse({"detail": "No encontrado"}, status_code=404)
        # Si lo piden por el dominio público de Render → rebotar a la app de Vercel.
        if "onrender.com" in request.headers.get("host", "").lower():
            return RedirectResponse(_APP_PUBLICA, status_code=307)
        archivo = DIST / full_path
        if full_path and archivo.is_file():
            # Los assets tienen hash en el nombre → se pueden cachear tranquilos
            return FileResponse(archivo)
        # index.html SIN caché: así el navegador siempre toma la última versión
        # (evita que quede una versión vieja "pegada" tras cada deploy).
        return FileResponse(
            DIST / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
else:
    @app.get("/")
    async def root():
        return {"nombre": "Defensoría API", "estado": "online", "nota": "frontend en Vite (puerto 5173)"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
