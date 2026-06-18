# Pasar el frontend a Vercel + archivos a Supabase

El código ya está preparado. Faltan estos 3 pasos en los paneles web.
Mientras no los hagas, la app sigue funcionando como hasta ahora en Render.

---

## 1) Supabase Storage (para que los archivos NO se borren)

Hoy, en el plan gratis de Render, los archivos adjuntos se borran cada vez que
la app se actualiza. Esto lo soluciona.

1. Entrá a https://supabase.com → tu proyecto.
2. Menú izquierdo → **Storage** → botón **New bucket**.
   - Nombre: **`adjuntos`**
   - **Dejá DESmarcado "Public bucket"** (privado: solo lo lee el backend).
   - **Create**.
3. Menú izquierdo → **Project Settings** (engranaje) → **API**. Copiá:
   - **Project URL** → ej. `https://abcd1234.supabase.co`
   - **service_role** (en "Project API keys") → es una clave larga y **secreta**.
     ⚠️ Esta clave es secreta: va SOLO en Render (paso 2), nunca en otro lado.

## 2) Render (activar Supabase en el backend)

1. Entrá a https://render.com → tu servicio **defensoria**.
2. Pestaña **Environment** → **Add Environment Variable**. Agregá:
   - `SUPABASE_URL` = la Project URL del paso 1
   - `SUPABASE_SERVICE_KEY` = la clave service_role del paso 1
   - `SUPABASE_BUCKET` = `adjuntos`
3. **Save changes** → Render se vuelve a desplegar solo (~2 min).

Desde ahí, todo lo que se suba queda guardado en Supabase y no se pierde.

## 3) Vercel (poner el frontend, rápido y sin dormirse)

1. Entrá a https://vercel.com → **Sign up / Log in con GitHub**.
2. **Add New… → Project** → **Import** el repositorio `defensoria`.
3. En **Root Directory** tocá **Edit** y elegí la carpeta **`frontend`**.
   - Framework: **Vite** (lo detecta solo). Build y Output: dejalos como están.
4. **Deploy**. En ~1 min te da una dirección tipo `https://defensoria.vercel.app`.
   - No hace falta configurar nada más: el frontend detecta solo que está en
     Vercel y habla con el backend de Render.

Esa dirección `*.vercel.app` es la que vas a usar y compartir: carga al
instante y no se duerme.

---

### Notas
- El backend (motor Python) sigue en Render: es donde mejor funciona.
- La primera llamada del día al backend puede tardar ~30 s (Render gratis se
  duerme). Si molesta, se puede agregar un "ping" para mantenerlo despierto.
- Tu app local (en tu PC, `localhost`) no se toca: sigue usando tus datos
  reales y guardando archivos en el disco de tu máquina.
