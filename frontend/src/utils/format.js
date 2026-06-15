/**
 * Utilidades de formato (fechas, estados).
 */

// Convierte 'aaaa-mm-dd' (ISO) a 'dd/mm/aaaa' para mostrar
export function fechaCorta(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.split('T')[0].split('-')
  if (!a || !m || !d) return iso
  return `${d}/${m}/${a}`
}

// Fecha + hora legible
export function fechaHora(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (isNaN(dt)) return iso
  return dt.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Devuelve la clase CSS del badge según el estado
export function claseEstado(estado) {
  const map = {
    activo: 'badge-activo',
    archivo: 'badge-archivo',
    sentencia: 'badge-sentencia',
    apelación: 'badge-apelacion',
    apelacion: 'badge-apelacion',
  }
  return 'badge ' + (map[estado] || 'badge-archivo')
}

export const ESTADOS = ['activo', 'archivo', 'sentencia', 'apelación']
export const TIPOS_INTERVENCION = ['dictamen', 'oficio', 'informe', 'audiencia', 'otro']

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Convierte un objeto Date a 'aaaa-mm-dd' en hora LOCAL (no UTC, para no correr el día)
export function isoLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Edad en años a partir de una fecha de nacimiento ISO ('aaaa-mm-dd')
export function edadDesde(iso) {
  if (!iso) return null
  const n = new Date(iso)
  if (isNaN(n)) return null
  const hoy = new Date()
  let e = hoy.getFullYear() - n.getFullYear()
  const m = hoy.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--
  return e
}

// 'Viernes 14/06/2026'
export function diaLargo(d) {
  return `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Color de fila del listado según el estado del trámite:
// subido al Lex = verde · enviado a la firma (sin subir) = amarillo · resto = sin color
export function colorFila(r) {
  if (r.subido_lex || r.cancelada) return '#dcfce7'   // verde (subido o vista cancelada)
  if (r.pase_firma) return '#fef3c7'                  // amarillo (a la firma)
  return undefined
}
