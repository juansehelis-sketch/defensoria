"""
Auditoría: registrar quién hizo qué (acciones importantes). El registro se suma
a la sesión y se persiste cuando el endpoint hace su commit.
"""


def registrar(db, usuario, accion: str, entidad: str, detalle: str = ""):
    from app.models import Auditoria
    try:
        db.add(Auditoria(
            usuario_id=getattr(usuario, "id", None),
            usuario_nombre=getattr(usuario, "nombre", None),
            accion=accion,
            entidad=entidad,
            detalle=(detalle or "")[:300],
        ))
    except Exception:
        pass
