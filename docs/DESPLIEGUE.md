# Despliegue online (Supabase + host del backend)

Esta guía deja la app corriendo en internet. **Lo que solo podés hacer vos** (crear
cuentas, copiar credenciales, apretar "Deploy") está marcado con 👉.

---

## Cómo se reparte la app

| Pieza | Dónde va | Por qué |
|---|---|---|
| Base de datos | **Supabase** (Postgres) | Persistente, gratis, no se borra |
| Archivos (PDFs/dictámenes) | Supabase Storage *(paso 2, más adelante)* | El disco de los hosts gratuitos es temporal |
| Backend (FastAPI) + frontend | **Un host** (Render o Vercel) | Supabase no corre Python |

> Supabase **no** corre el backend de Python: solo guarda la base y los archivos.
> El backend necesita un host aparte.

---

## ⚠️ Privacidad (leer antes de empezar)
- La primera vez se sube **VACÍA** (solo los usuarios, sin expedientes reales).
- **NO cargar los expedientes reales de menores** hasta que esté seguro y con el OK
  de la institución. Para probar, usar datos inventados.
- El host le pone **HTTPS** automático (candado). Igual conviene acceso restringido.

---

## Paso 1 — Base de datos en Supabase 👉
1. Entrá a https://supabase.com → **New project**.
2. Elegí nombre y una contraseña para la base (guardala).
3. Cuando termine: **Project Settings → Database → Connection string → URI**.
4. Copiá esa URL (empieza con `postgresql://...`). Esa es tu `DATABASE_URL`.

El código ya está listo para usarla: solo hay que ponerla como variable de entorno
`DATABASE_URL` en el host (paso 2). En local seguís con SQLite, no cambia nada.

---

## Paso 2 — Host del backend 👉

Elegí UNA opción:

### Opción A — Render (recomendada, más simple para esta app)
1. https://render.com → **New → Web Service** → conectás tu repo de GitHub `defensoria`.
2. Configuración:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment (variables):**
     - `DATABASE_URL` = la URI de Supabase (paso 1)
     - `SECRET_KEY` = una frase larga al azar (inventala)
     - `CORS_ORIGINS` = (vacío por ahora)
3. Deploy. Te queda una URL tipo `https://defensoria.onrender.com`.
4. Para los usuarios iniciales, una vez arriba, corré el seed (consola de Render):
   `python seed.py`

> Nota: el frontend lo serví desde el backend, así que con esta opción **no hace falta
> Vercel**: la URL de Render ya muestra la app. Para que sirva el frontend hay que
> compilar el frontend en el deploy (lo dejamos afinado cuando elijas esta opción).

### Opción B — Vercel (frontend) + backend aparte
- El frontend va a Vercel (rápido), el backend a Render/otro, la base a Supabase.
- Necesita un cambio extra en el código para que el frontend apunte al backend
  (lo hago cuando confirmes esta opción) y setear `CORS_ORIGINS` con el dominio de Vercel.

---

## Paso 3 — Archivos en Supabase Storage *(cuando haga falta)*
Para que los PDFs/dictámenes no se borren, se guardan en Supabase Storage en vez del
disco del host. Es un cambio de código que hago cuando estés en esta etapa (requiere
crear un "bucket" en Supabase y poner sus claves como variables de entorno).

---

## Resumen de quién hace qué
- **Vos (👉):** crear el proyecto en Supabase, crear el servicio en el host, pegar las
  variables, apretar deploy.
- **Yo:** dejé el código listo (base por `DATABASE_URL`, driver de Postgres, CORS por
  variable) y hago los ajustes que falten según la opción que elijas.
