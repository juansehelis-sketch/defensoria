"""
Modelos SQLAlchemy para la base de datos.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON, Date, Time
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    nombre = Column(String)
    contraseña_hash = Column(String)
    # Roles: despachante, secretaria, defensora (admin queda para gestión interna)
    rol = Column(String, default="despachante")
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=datetime.now)

    # Relaciones
    expedientes_asignados = relationship("Expediente", back_populates="despachante", foreign_keys="Expediente.despachante_id")
    historial = relationship("Historial", back_populates="usuario")


class Expediente(Base):
    __tablename__ = "expedientes"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String, unique=True, index=True)  # ej: 38226/2024
    juzgado = Column(String, index=True)  # ej: 80
    caratula = Column(Text)  # Descripción larga del caso
    tipo_proceso = Column(String)  # Ej: Desalojo, Sucesión, etc. (se infiere de caratula)
    estado = Column(String, default="activo", index=True)  # activo, archivo, sentencia, apelación
    despachante_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_entrada = Column(Date, index=True)
    conexos = Column(JSON, default=list)  # Lista de números de expediente conexos
    observaciones = Column(Text)
    resumen = Column(Text)  # Resumen libre del caso (lo mantienen los despachantes)
    fecha_creacion = Column(DateTime, default=datetime.now)
    fecha_actualizacion = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # Relaciones
    despachante = relationship("Usuario", back_populates="expedientes_asignados", foreign_keys=[despachante_id])
    historial = relationship("Historial", back_populates="expediente", cascade="all, delete-orphan")
    proyectos = relationship("Proyecto", back_populates="expediente", cascade="all, delete-orphan")
    defendidos = relationship("Defendido", back_populates="expediente", cascade="all, delete-orphan")

    @property
    def despachante_asignado(self) -> str | None:
        """Nombre del despachante asignado (para serializar al frontend)."""
        return self.despachante.nombre if self.despachante else None
    audiencias = relationship("Audiencia", back_populates="expediente", cascade="all, delete-orphan")
    entrada_salida = relationship("EntradaSalida", back_populates="expediente", cascade="all, delete-orphan")


class EntradaSalida(Base):
    __tablename__ = "entrada_salida"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, index=True)
    juzgado = Column(String, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"), nullable=True)
    autos = Column(Text)  # Carátula del caso
    asignacion = Column(String)  # Nombre del despachante
    pase_firma = Column(Date, nullable=True)
    subido_lex = Column(Date, nullable=True)
    observaciones = Column(Text)
    subido_defensa = Column(Boolean, default=False)
    urgente = Column(Boolean, default=False, index=True)
    cancelada = Column(Boolean, default=False)  # vista cancelada → se pinta verde
    fecha_creacion = Column(DateTime, default=datetime.now)

    # Relaciones
    expediente = relationship("Expediente", back_populates="entrada_salida")

    @property
    def numero_expediente(self) -> str | None:
        """Número del expediente vinculado (para serializar al frontend)."""
        return self.expediente.numero if self.expediente else None


class Historial(Base):
    __tablename__ = "historial"

    id = Column(Integer, primary_key=True, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"))
    tipo = Column(String)  # dictamen, oficio, informe, audiencia, otro
    descripcion = Column(Text)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    archivo_url = Column(String, nullable=True)  # Ruta del archivo adjunto
    fecha_creacion = Column(DateTime, default=datetime.now)

    # Relaciones
    expediente = relationship("Expediente", back_populates="historial")
    usuario = relationship("Usuario", back_populates="historial")


class Audiencia(Base):
    __tablename__ = "audiencias"

    id = Column(Integer, primary_key=True, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"))
    fecha = Column(Date, index=True)
    hora = Column(Time)
    juzgado = Column(String)
    base_legal = Column(String, nullable=True)
    motivo = Column(String, nullable=True)         # motivo de la audiencia
    modalidad = Column(String, nullable=True)      # Presencial / Virtual
    datos_acceso = Column(Text, nullable=True)     # link/datos (si es virtual)
    direccion = Column(String, nullable=True)      # dirección (si es presencial)
    asesor = Column(String, nullable=True)
    asignado_a = Column(String, nullable=True, index=True)   # quién va (Stella/Brenda/Laura/Silvana)
    asistencia = Column(String, default="pendiente")         # pendiente / va / no_va
    estado = Column(String, default="programada")  # programada, realizada, cancelada
    fecha_creacion = Column(DateTime, default=datetime.now)

    # Relaciones
    expediente = relationship("Expediente", back_populates="audiencias")


class Proyecto(Base):
    """
    Proyecto enviado "a la firma": el corazón del flujo de trabajo.
    Un remitente (despachante o secretaria) manda el proyecto de un expediente a
    un destinatario (secretaria o defensora), con archivos y datos. El destinatario
    puede devolverlo con comentarios (para corregir y reenviar) o marcarlo como
    "subido" (subido al expediente real). Al enviarse se estampa la fecha en
    "Pase a la firma" del listado; al marcarse subido, en "Subido al Lex".
    """
    __tablename__ = "proyectos"

    id = Column(Integer, primary_key=True, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"))
    # Fila del listado diario (EntradaSalida) sobre la que se estampan las fechas
    entrada_salida_id = Column(Integer, ForeignKey("entrada_salida.id"), nullable=True)

    remitente_id = Column(Integer, ForeignKey("usuarios.id"))
    destinatario_id = Column(Integer, ForeignKey("usuarios.id"))

    titulo = Column(String)          # breve descripción del proyecto
    datos = Column(Text)             # datos del expediente que anota el remitente
    estado = Column(String, default="enviado")  # enviado, en_correccion, subido
    version = Column(Integer, default=1)

    comentarios = Column(JSON, default=list)  # [{autor, rol, fecha, texto, tipo}]
    archivos = Column(JSON, default=list)     # [{nombre, url}]

    fecha_creacion = Column(DateTime, default=datetime.now)
    fecha_envio = Column(DateTime, default=datetime.now)
    fecha_subido = Column(DateTime, nullable=True)

    # Relaciones
    expediente = relationship("Expediente", back_populates="proyectos")
    remitente = relationship("Usuario", foreign_keys=[remitente_id])
    destinatario = relationship("Usuario", foreign_keys=[destinatario_id])

    @property
    def expediente_numero(self):
        return self.expediente.numero if self.expediente else None

    @property
    def expediente_caratula(self):
        return self.expediente.caratula if self.expediente else None

    @property
    def remitente_nombre(self):
        return self.remitente.nombre if self.remitente else None

    @property
    def destinatario_nombre(self):
        return self.destinatario.nombre if self.destinatario else None


class Defendido(Base):
    """Persona defendida/representada en un expediente (con su edad y datos)."""
    __tablename__ = "defendidos"

    id = Column(Integer, primary_key=True, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"))
    nombre = Column(String)
    fecha_nacimiento = Column(Date, nullable=True)
    dni = Column(String, nullable=True)
    vinculo = Column(String, nullable=True)        # rol/parentesco (ej: NNA, progenitor)
    observaciones = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.now)

    expediente = relationship("Expediente", back_populates="defendidos")


class CarpetaModelo(Base):
    """
    Carpeta de una biblioteca, agrupada por tipo de proceso o temática.
    La 'categoria' define a qué biblioteca pertenece:
      - modelos        → escritos con variables @ (por tipo de proceso)
      - jurisprudencia → fallos (por temática)
      - doctrina       → doctrina (por temática)
      - dictamenes     → dictámenes de ejemplo (por tipo de proceso)
    """
    __tablename__ = "carpetas_modelo"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String)  # ej: "Sucesiones", "Violencia familiar"
    categoria = Column(String, default="modelos", index=True)
    fecha_creacion = Column(DateTime, default=datetime.now)

    plantillas = relationship("Plantilla", back_populates="carpeta", cascade="all, delete-orphan")


class Plantilla(Base):
    """Modelo/plantilla de documento dentro de una carpeta."""
    __tablename__ = "plantillas"

    id = Column(Integer, primary_key=True, index=True)
    carpeta_id = Column(Integer, ForeignKey("carpetas_modelo.id"))
    nombre = Column(String)
    contenido = Column(Text, nullable=True)   # texto del modelo (con variables tipo {{numero}})
    archivo_url = Column(String, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.now)

    carpeta = relationship("CarpetaModelo", back_populates="plantillas")


class BorradoListado(Base):
    """Registro de filas del listado que se borraron (papelera / por las dudas)."""
    __tablename__ = "borrados_listado"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=True)
    juzgado = Column(String, nullable=True)
    numero_expediente = Column(String, nullable=True)
    autos = Column(Text, nullable=True)
    asignacion = Column(String, nullable=True)
    observaciones = Column(Text, nullable=True)
    borrado_por = Column(String, nullable=True)
    fecha_borrado = Column(DateTime, default=datetime.now)


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    tipo = Column(String)  # expediente_actualizado, proyecto_en_revision, proyecto_aprobado, etc.
    contenido = Column(String)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"), nullable=True)
    leida = Column(Boolean, default=False)
    fecha_creacion = Column(DateTime, default=datetime.now)
