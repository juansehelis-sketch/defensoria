# 🏛️ DEFENSORÍA - Sistema de Gestión de Expedientes

Sistema web integrado para gestionar expedientes, audiencias, entrada/salida y flujo de trabajo interno de una Defensoría Pública.

**Stack**: React 18 + FastAPI + SQLite

---

## 📋 Requisitos previos

- Python 3.11+
- Node.js 18+

---

## 🚀 Instalación y Setup

### 1. Backend (FastAPI)

```powershell
# Ir a carpeta backend
cd backend

# Crear virtualenv (si no lo hiciste)
python -m venv venv

# Activar virtualenv (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo .env
Copy-Item .env.example .env

# Editar .env y cambiar SECRET_KEY si es necesario
# (por defecto está bien para desarrollo local)

# Cargar usuarios iniciales (admin, defensora, secretaria y despachantes)
python seed.py
```

### 2. Frontend (React)

```powershell
# Ir a carpeta frontend (en otra terminal PowerShell)
cd frontend

# Instalar dependencias
npm install

# NOTA: Si npm install falla, ejecuta:
# npm install --legacy-peer-deps
```

---

## 🎯 Arranca la aplicación

### Terminal 1 — Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python run.py
```

Deberías ver:
```
╔════════════════════════════════════════════╗
║   🏛️  DEFENSORÍA - SERVIDOR API            ║
╚════════════════════════════════════════════╝

📡 Servidor escuchando en: http://127.0.0.1:8000
📚 Documentación: http://127.0.0.1:8000/docs
```

### Terminal 2 — Frontend

```powershell
cd frontend
npm run dev
```

Deberías ver:
```
  VITE v5.0.0  ready in 123 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

---

## 🌐 Acceso desde otras máquinas (red local)

El frontend ya arranca con `host: true`, así que otras computadoras de la red
pueden entrar usando la IP de la máquina servidor, por ejemplo:
`http://192.168.x.x:5173`

Importante: el frontend redirige las llamadas `/api` al backend en `127.0.0.1:8000`,
por lo que **backend y frontend deben correr en la misma máquina servidor**. El
resto de las computadoras solo necesitan el navegador. Esa máquina debe permitir
los puertos 5173 y 8000 en el Firewall de Windows.

---

## 🔐 Primer login

En el navegador, ir a `http://localhost:5173`

Usuarios creados por `seed.py` (cambiá las contraseñas después):

| Rol         | Usuario (email)               | Contraseña     |
|-------------|-------------------------------|----------------|
| Admin       | admin@defensoria.local        | admin123       |
| Defensora   | defensora@defensoria.local    | defensora123   |
| Secretaría  | secretaria@defensoria.local   | secretaria123  |
| Despachantes| (nombre)@defensoria.local     | cambiar123     |

Despachantes cargados: delfina, clarisa, camila, sofia, catalina, augusto,
josefina, laura, brenda, tobias, julia (ej: `delfina@defensoria.local`).

Solo el **admin** puede crear nuevos usuarios (endpoint `POST /api/usuarios/registrar`).

---

## 📚 Documentación de la API

Una vez que el backend esté corriendo, accedé a:
- **Swagger UI**: http://127.0.0.1:8000/docs
- **ReDoc**: http://127.0.0.1:8000/redoc

---

## 📁 Estructura del proyecto

```
proyecto-piloto-defensoría-6/
├── backend/
│   ├── app/
│   │   ├── api/              # Endpoints (usuarios, expedientes, etc.)
│   │   ├── services/         # Lógica de negocio (PDF parser)
│   │   ├── utils/            # Autenticación, validaciones
│   │   ├── models.py         # Modelos SQLAlchemy
│   │   ├── schemas.py        # Validaciones Pydantic
│   │   ├── config.py         # Config y reglas de asignación
│   │   ├── database.py       # Conexión SQLite
│   │   └── main.py           # App FastAPI
│   ├── uploads/              # Archivos subidos (PDFs)
│   ├── requirements.txt
│   ├── .env
│   └── run.py                # Script para arrancar
│
├── frontend/
│   ├── src/
│   │   ├── components/       # Componentes React
│   │   ├── pages/            # Páginas
│   │   ├── hooks/            # Custom hooks
│   │   ├── utils/            # Utilidades (API, formato)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
└── docs/
    └── (Documentación adicional)
```

---

## 🔑 Roles y permisos

- **Despachante**: Puede crear expedientes, cargar intervenciones, enviar proyectos
- **Secretaria**: Revisa expedientes, marca "subido al expediente real"
- **Defensora**: Aprueba o rechaza proyectos de dictamen
- **Admin**: Gestiona usuarios, roles, configuración

**NOTA**: En esta versión, todos pueden ver todos los expedientes. Se pueden filtrar por "mis expedientes" (asignados al usuario).

---

## ⚙️ Configuración importante

### Variables de entorno (`backend/.env`)

```
DATABASE_URL=sqlite:///./defensoría.db
SECRET_KEY=cambiar-esto-en-produccion
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
API_HOST=127.0.0.1
API_PORT=8000
FRONTEND_URL=http://localhost:5173
```

### Base de datos

La BD SQLite se crea automáticamente en `backend/defensoría.db`. No necesitás hacer nada especial.

---

## 🧪 Testeá el sistema

### Crear usuarios via API

```powershell
# Terminal PowerShell
$headers = @{"Content-Type"="application/json"}
$body = @{
    email = "despachante@defensoría.local"
    nombre = "Juan Pérez"
    contraseña = "123456"
    rol = "despachante"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/usuarios/registrar" `
  -Method POST `
  -Headers $headers `
  -Body $body
```

O usá Swagger UI (http://127.0.0.1:8000/docs) para hacer requests sin código.

---

## 📖 Próximos pasos

1. ✅ Backend base (ya está hecho)
2. ⏳ Frontend componentes (próximo)
3. ⏳ Integración login
4. ⏳ Listado y detalle de expedientes
5. ⏳ ABM completo
6. ⏳ Historial y flujo de trabajo
7. ⏳ Audiencias y reportes

---

## 🐛 Troubleshooting

### "ModuleNotFoundError: No module named 'fastapi'"

```powershell
# Verificá que el virtualenv esté activado
.\venv\Scripts\Activate.ps1

# Reinstala
pip install -r requirements.txt
```

### "Port 8000 already in use"

```powershell
# Mata el proceso que esté usando el puerto
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
```

### PDF parser da error

Asegurate de que `pdfplumber` esté instalado:
```powershell
pip install pdfplumber
```

---

## 📞 Contacto / Dudas

Si surgem problemas o preguntas, consultá el código comentado o abrí un issue en el repositorio.

---

## 📝 Licencia

Uso interno - Defensoría Pública
