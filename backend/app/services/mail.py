"""
Correo: envío del resumen diario de pendientes a cada integrante del equipo.

Si no hay servidor SMTP configurado (variables SMTP_*), no se envía nada y la
app sigue funcionando igual. Pensado para activarse cuando el organismo dé un
correo institucional.
"""

import smtplib
import ssl
import time
import threading
from email.message import EmailMessage
from datetime import date

from app.config import settings


def mail_configurado() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _email_entregable(email: str) -> bool:
    """Filtra emails de prueba (ej. los .local del piloto) que no se pueden enviar."""
    e = (email or "").strip().lower()
    if "@" not in e:
        return False
    dominio = e.split("@", 1)[1]
    return "." in dominio and not dominio.endswith(".local")


def enviar(destino: str, asunto: str, cuerpo: str) -> None:
    """Envía un mail de texto. Lanza excepción si falla (para que el caller la maneje)."""
    if not mail_configurado():
        raise RuntimeError("El correo no está configurado (faltan variables SMTP_*).")
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = destino
    msg["Subject"] = asunto
    msg.set_content(cuerpo)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
        if settings.SMTP_TLS:
            s.starttls(context=ssl.create_default_context())
        s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(msg)


def _pendientes_de(db, nombre: str):
    from app.models import EntradaSalida
    return (
        db.query(EntradaSalida)
        .filter(EntradaSalida.asignacion == nombre)
        .filter(EntradaSalida.subido_lex.is_(None))
        .filter(EntradaSalida.cancelada.isnot(True))
        .order_by(EntradaSalida.fecha.asc())
        .all()
    )


def _cuerpo_resumen(nombre: str, filas) -> str:
    lineas = [f"Hola {nombre},", "", f"Tenés {len(filas)} expediente(s) pendiente(s) de subir al Lex:", ""]
    for f in filas:
        num = f.numero_expediente or "—"
        autos = (f.autos or "").strip()
        if len(autos) > 70:
            autos = autos[:70] + "…"
        lineas.append(f"  • {num}  ·  Juzgado {f.juzgado or '—'}  ·  {autos}")
    lineas += ["", "— Sistema de gestión de la Defensoría"]
    return "\n".join(lineas)


def enviar_resumen_diario(db) -> dict:
    """
    Envía a cada integrante (con email entregable) el resumen de SUS pendientes.
    Devuelve {configurado, enviados, omitidos}.
    """
    from app.models import Usuario
    if not mail_configurado():
        return {"configurado": False, "enviados": 0, "omitidos": 0}

    usuarios = db.query(Usuario).filter(Usuario.activo == True).all()
    enviados, omitidos = 0, 0
    for u in usuarios:
        if not _email_entregable(u.email):
            omitidos += 1
            continue
        filas = _pendientes_de(db, u.nombre)
        if not filas:
            continue
        try:
            enviar(u.email, f"Pendientes del día — {len(filas)} expediente(s)", _cuerpo_resumen(u.nombre, filas))
            enviados += 1
        except Exception as e:
            print(f"[!] No se pudo enviar el resumen a {u.email}: {e}")
            omitidos += 1
    return {"configurado": True, "enviados": enviados, "omitidos": omitidos}


def iniciar_resumen_diario():
    """
    Hilo que envía el resumen una vez por día a la hora configurada (RESUMEN_HORA).
    Solo corre si el correo está configurado.
    """
    if not mail_configurado():
        return

    def _loop():
        from app.database import SessionLocal
        ultimo = None  # fecha del último envío, para no repetir el mismo día
        while True:
            ahora = __import__("datetime").datetime.now()
            if ahora.hour == settings.RESUMEN_HORA and ultimo != ahora.date():
                ultimo = ahora.date()
                db = SessionLocal()
                try:
                    r = enviar_resumen_diario(db)
                    print(f"[OK] Resumen diario enviado: {r}")
                except Exception as e:
                    print(f"[!] Falló el resumen diario: {e}")
                finally:
                    db.close()
            time.sleep(1800)  # revisa cada media hora

    threading.Thread(target=_loop, daemon=True).start()
