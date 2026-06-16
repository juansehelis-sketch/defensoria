"""
Aplicación principal FastAPI.
"""

from fastapi import FastAPI
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carpeta de uploads
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
    """Crea las tablas en la BD al iniciar."""
    init_db()
    print("[OK] Base de datos inicializada")


@app.get("/api/health")
async def health_check():
    """Health check para monitoreo."""
    return {"status": "ok"}


# ── Servir el frontend compilado (modo producción / un solo servidor) ──
# Si existe frontend/dist, se sirve desde acá: así la app corre con UN solo
# servidor (más fácil de arrancar) y queda accesible en la red local.
# En desarrollo (sin dist) se usa Vite aparte en el puerto 5173.
from fastapi.responses import FileResponse, JSONResponse

DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if DIST.exists():
    @app.get("/{full_path:path}")
    async def servir_spa(full_path: str):
        # Las rutas de API y uploads no las maneja el frontend
        if full_path.startswith("api/") or full_path.startswith("uploads/"):
            return JSONResponse({"detail": "No encontrado"}, status_code=404)
        archivo = DIST / full_path
        if full_path and archivo.is_file():
            return FileResponse(archivo)
        # Cualquier otra ruta → index.html (ruteo del lado del cliente)
        return FileResponse(DIST / "index.html")
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
