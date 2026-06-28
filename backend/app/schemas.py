"""
Esquemas Pydantic para validación de request/response.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, time

# Nota: usamos `str` (no EmailStr) para el campo email porque funciona como
# identificador de login interno. EmailStr rechaza dominios reservados como
# ".local", que son habituales en redes internas.


# ═══════════════════════════════════════════════════════════════
# USUARIOS
# ═══════════════════════════════════════════════════════════════

class UsuarioBase(BaseModel):
    email: str
    nombre: str
    rol: str = "despachante"


class UsuarioCreate(UsuarioBase):
    contraseña: str


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None


class Usuario(UsuarioBase):
    id: int
    activo: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class UsuarioLogin(BaseModel):
    email: str
    contraseña: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ═══════════════════════════════════════════════════════════════
# EXPEDIENTES
# ═══════════════════════════════════════════════════════════════

class ExpedienteBase(BaseModel):
    numero: str
    juzgado: str
    caratula: str
    tipo_proceso: Optional[str] = None
    estado: str = "activo"
    despachante_asignado: Optional[str] = None  # Nombre del despachante
    fecha_entrada: date
    conexos: Optional[List[str]] = []
    observaciones: Optional[str] = None
    resumen: Optional[str] = None


class ExpedienteCreate(ExpedienteBase):
    pass


class ExpedienteUpdate(BaseModel):
    estado: Optional[str] = None
    despachante_asignado: Optional[str] = None
    observaciones: Optional[str] = None
    resumen: Optional[str] = None


# ── Defendidos ──────────────────────────────────────────────────

class DefendidoBase(BaseModel):
    nombre: str
    fecha_nacimiento: Optional[date] = None
    dni: Optional[str] = None
    vinculo: Optional[str] = None
    observaciones: Optional[str] = None


class DefendidoCreate(DefendidoBase):
    expediente_id: int


class Defendido(DefendidoBase):
    id: int
    expediente_id: int
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class Expediente(ExpedienteBase):
    id: int
    legajo_id: Optional[int] = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# ENTRADA / SALIDA
# ═══════════════════════════════════════════════════════════════

class EntradaSalidaBase(BaseModel):
    fecha: date
    juzgado: str
    autos: str
    asignacion: str
    pase_firma: Optional[date] = None
    subido_lex: Optional[date] = None
    observaciones: Optional[str] = None
    subido_defensa: bool = False
    urgente: bool = False
    cancelada: bool = False


class EntradaSalidaCreate(EntradaSalidaBase):
    numero_expediente: Optional[str] = None


class EntradaSalida(EntradaSalidaBase):
    id: int
    expediente_id: Optional[int] = None
    numero_expediente: Optional[str] = None
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class BorradoListado(BaseModel):
    id: int
    fecha: Optional[date] = None
    juzgado: Optional[str] = None
    numero_expediente: Optional[str] = None
    autos: Optional[str] = None
    asignacion: Optional[str] = None
    observaciones: Optional[str] = None
    borrado_por: Optional[str] = None
    fecha_borrado: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# AUDIENCIAS
# ═══════════════════════════════════════════════════════════════

class AudienciaBase(BaseModel):
    fecha: date
    hora: time
    juzgado: str
    base_legal: Optional[str] = None
    motivo: Optional[str] = None
    modalidad: Optional[str] = None
    datos_acceso: Optional[str] = None
    direccion: Optional[str] = None
    asesor: Optional[str] = None
    asignado_a: Optional[str] = None
    asistencia: str = "pendiente"
    estado: str = "programada"


class AudienciaCreate(AudienciaBase):
    expediente_id: int


class Audiencia(AudienciaBase):
    id: int
    expediente_id: int
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# HISTORIAL
# ═══════════════════════════════════════════════════════════════

class HistorialBase(BaseModel):
    tipo: str
    descripcion: str
    archivo_url: Optional[str] = None


class HistorialCreate(HistorialBase):
    expediente_id: int


class Historial(HistorialBase):
    id: int
    expediente_id: int
    usuario_id: int
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# PROYECTOS (flujo de trabajo "a la firma")
# ═══════════════════════════════════════════════════════════════

class ComentarioProyecto(BaseModel):
    autor: str
    rol: Optional[str] = None
    fecha: datetime
    texto: str
    tipo: Optional[str] = None  # envio, devolucion, correccion, subido


class ArchivoProyecto(BaseModel):
    nombre: str
    url: str


class Proyecto(BaseModel):
    id: int
    expediente_id: int
    entrada_salida_id: Optional[int] = None
    remitente_id: int
    destinatario_id: int
    titulo: Optional[str] = None
    datos: Optional[str] = None
    estado: str
    version: int
    comentarios: List[ComentarioProyecto] = []
    archivos: List[ArchivoProyecto] = []
    fecha_creacion: datetime
    fecha_envio: Optional[datetime] = None
    fecha_subido: Optional[datetime] = None

    # Datos enriquecidos para mostrar sin pedir otra request
    expediente_numero: Optional[str] = None
    expediente_caratula: Optional[str] = None
    remitente_nombre: Optional[str] = None
    destinatario_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# MODELOS / PLANTILLAS
# ═══════════════════════════════════════════════════════════════

class Plantilla(BaseModel):
    id: int
    carpeta_id: int
    nombre: str
    contenido: Optional[str] = None
    archivo_url: Optional[str] = None
    descripcion: Optional[str] = None
    etiquetas: Optional[str] = None
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class CarpetaModelo(BaseModel):
    id: int
    nombre: str
    categoria: str = "modelos"
    fecha_creacion: datetime
    plantillas: List[Plantilla] = []

    class Config:
        from_attributes = True


# ── Legajos por persona ────────────────────────────────────────
class LegajoBase(BaseModel):
    nombre: str
    dni: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    observaciones: Optional[str] = None


class LegajoCreate(LegajoBase):
    numeros: List[str] = []


class ExpedienteEnLegajo(BaseModel):
    id: int
    numero: str
    caratula: Optional[str] = None
    estado: Optional[str] = None

    class Config:
        from_attributes = True


class Legajo(LegajoBase):
    id: int
    numeros: List[str] = []
    fecha_creacion: datetime
    expedientes: List[ExpedienteEnLegajo] = []

    class Config:
        from_attributes = True


# ── Tareas (agenda personal) ───────────────────────────────────
class TareaBase(BaseModel):
    titulo: str
    detalle: Optional[str] = None
    fecha_limite: Optional[date] = None
    expediente_id: Optional[int] = None


class TareaCreate(TareaBase):
    pass


class Tarea(TareaBase):
    id: int
    hecha: bool = False
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# NOTIFICACIONES
# ═══════════════════════════════════════════════════════════════

class Notificacion(BaseModel):
    id: int
    usuario_id: int
    tipo: str
    contenido: str
    expediente_id: Optional[int] = None
    leida: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# PDF PARSER (para parsear PDFs)
# ═══════════════════════════════════════════════════════════════

class ExpedienteParsedoDesdePDF(BaseModel):
    """Resultado del parseo de un expediente desde PDF."""
    numero: str
    juzgado: str
    caratula: str
    asignacion_original: str
    asignacion_final: str
    alertas: List[dict]  # [{tipo: "warn"|"red", msg: "..."}]
