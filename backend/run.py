"""
Script para arrancar el servidor FastAPI.
Uso: python run.py
"""

import uvicorn
import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

if __name__ == "__main__":
    host = os.getenv("API_HOST", "127.0.0.1")
    port = int(os.getenv("API_PORT", 8000))

    print(f"""
==================================================
   DEFENSORIA - SERVIDOR API
==================================================

 Servidor escuchando en: http://{host}:{port}
 Documentacion (Swagger): http://{host}:{port}/docs
 Base de datos: SQLite (local)

 Presiona Ctrl+C para detener.
""")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
    )
