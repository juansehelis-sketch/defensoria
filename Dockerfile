# Imagen única que compila el frontend y corre el backend (FastAPI sirve el frontend).
# Sirve para desplegar en Render / Railway / Fly con un solo servicio.

# ── Etapa 1: compilar el frontend ──────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /front
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Etapa 2: backend + frontend ya compilado ───────────────────
FROM python:3.12-slim
WORKDIR /app

# LibreOffice (sin pantalla) para armar los PDF de los proyectos igual que el
# Word, con logos y membrete, y para ver las imágenes EMF de Word. Las fuentes
# Liberation reemplazan a Times New Roman / Arial con las mismas medidas.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-writer-nogui libreoffice-draw-nogui \
       fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

# Dependencias de Python
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Código del backend y el frontend compilado (main.py sirve /app/frontend/dist)
COPY backend/ ./backend/
COPY --from=frontend /front/dist ./frontend/dist

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1

# El host inyecta el puerto en la variable PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
