# Activar Supabase Storage (para que los archivos no se pierdan en la web)

En la web, el disco de Render es **efímero**: cada vez que se actualiza o reinicia
el servidor, los archivos subidos a disco se borran. Para que los adjuntos (PDF,
Word) queden guardados de verdad, hay que usar **Supabase Storage**.

El código ya está preparado: cuando existen las variables `SUPABASE_URL` y
`SUPABASE_SERVICE_KEY`, los archivos se guardan y se leen desde Supabase solo.
**No hay que tocar nada del código** — solo seguir estos pasos una vez.

> En tu PC (local) no hace falta nada de esto: los archivos se guardan en la
> carpeta `uploads/` como siempre.

---

## Paso 1 — Crear el bucket en Supabase

1. Entrá a tu proyecto en https://supabase.com → menú izquierdo **Storage**.
2. Botón **New bucket**.
3. Nombre: **`adjuntos`** (en minúsculas, exactamente así).
4. **Dejalo PRIVADO** — NO marques "Public bucket". (Los archivos tienen datos
   sensibles; solo el backend los lee.)
5. **Create bucket**.

## Paso 2 — Copiar las credenciales

1. En Supabase: ícono de engranaje (**Project Settings**) → **API**.
2. Anotá dos cosas:
   - **Project URL** → algo como `https://abcd1234.supabase.co`
   - **service_role** (en "Project API keys") → es una clave larga.
     ⚠️ Es **secreta**: no la pegues en ningún lado público ni en el código.

## Paso 3 — Cargar las variables en Render

1. Entrá a https://dashboard.render.com → tu servicio del backend.
2. Pestaña **Environment** → **Add Environment Variable**. Agregá:

   | Key                     | Value                                   |
   |-------------------------|-----------------------------------------|
   | `SUPABASE_URL`          | la Project URL del Paso 2               |
   | `SUPABASE_SERVICE_KEY`  | la clave **service_role** del Paso 2    |
   | `SUPABASE_BUCKET`       | `adjuntos` (opcional; ya es el valor por defecto) |

3. **Save Changes**. Render vuelve a desplegar solo (1-3 min).

## Paso 4 — Comprobar que quedó bien

1. Entrá a la app, abrí un expediente y **subí un archivo**.
2. En Render, **Manual Deploy → Clear build cache & deploy** (o esperá un
   reinicio). Esto simula la pérdida del disco.
3. Volvé a abrir el mismo archivo en la app: **tiene que seguir apareciendo**.
   Si aparece, Supabase Storage está funcionando.

---

## Notas

- **Capacidad:** el plan gratis de Supabase da ~1 GB de almacenamiento. Alcanza
  para empezar; con muchos PDF se llena en algunos meses. Cuando se llene, fallan
  las **subidas nuevas**, pero **no se pierde** lo ya cargado. Para producción real
  conviene un plan pago o el almacenamiento del propio organismo.
- **Privacidad:** el bucket es privado; los archivos se sirven a través del
  backend (`/uploads/...`), nunca con un link público de Supabase.
- **Backups de la base** (no de los archivos) usan otra variable aparte; ver
  `docs/VERCEL.md` y `docs/DESPLIEGUE.md`.
