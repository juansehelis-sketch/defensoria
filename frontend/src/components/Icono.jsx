/**
 * Íconos SVG de línea (estilo sobrio, sin emojis), en la paleta del MPD.
 * Uso: <Icono nombre="inicio" size={18} color="currentColor" />
 */

const PATHS = {
  inicio: 'M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  expedientes: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  firma: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  audiencias: 'M3 4.5h18v17H3zM16 2.5v4M8 2.5v4M3 10h18',
  modelos: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  reportes: 'M3 3v18h18M8 17v-4M13 17V8M18 17v-7',
  agregar: 'M12 5v14M5 12h14',
  borrar: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  importar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  exportar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  archivo: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  personas: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  reloj: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6.5V12l4 2',
  alerta: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  resumen: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  clip: 'M21.4 11.05l-9.19 9.19a4 4 0 0 1-5.66-5.66l9.2-9.19a2.5 2.5 0 0 1 3.54 3.54l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49',
  abrir: 'M7 17L17 7M7 7h10v10',
  volver: 'M19 12H5M12 19l-7-7 7-7',
  cerrar: 'M18 6L6 18M6 6l12 12',
  candado: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  virtual: 'M2 4h20v12H2zM8 20h8M12 16v4',
  presencial: 'M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
}

export default function Icono({ nombre, size = 18, color = 'currentColor', strokeWidth = 1.9, style }) {
  const d = PATHS[nombre]
  if (!d) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
