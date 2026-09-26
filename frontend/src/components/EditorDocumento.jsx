/**
 * Editor del proyecto de dictamen, con aspecto de hoja de Word.
 *
 * - Se edita directo en la hoja (negrita, cursiva, subrayado, alineación,
 *   sangría, listas, deshacer). Tab inserta una tabulación como en Word.
 * - Lo que se pega desde Word o de una página web se limpia: queda el texto con
 *   su formato básico, sin colores ni tipografías raras.
 * - No es "controlado": el contenido inicial entra por `inicial` y cada cambio
 *   sale por `onChange(html)`. Para cargar otro documento, cambiar la `key`.
 *
 * También exporta <CambiosDocumento antes despues/>: muestra qué se agregó
 * (verde) y qué se sacó (rojo tachado) entre dos versiones.
 */

import { useEffect, useRef } from 'react'

// ── Limpieza de lo pegado (mismas reglas que el servidor) ─────
const INLINE = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', INS: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub' }
const BLOQUE = {
  P: 'p', DIV: 'p', SECTION: 'p', ARTICLE: 'p', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3',
  LI: 'li', UL: 'ul', OL: 'ol', BLOCKQUOTE: 'blockquote', TABLE: 'table', TBODY: 'tbody', THEAD: 'tbody',
  TFOOT: 'tbody', TR: 'tr', TD: 'td', TH: 'td',
}
const DESCARTAR = new Set(['SCRIPT', 'STYLE', 'META', 'TITLE', 'HEAD', 'LINK', 'XML', 'IFRAME', 'OBJECT', 'NOSCRIPT', 'TEMPLATE'])

function esc(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function aPt(v) {
  const m = /^\s*(-?[\d.]+)\s*(pt|px|cm|mm|in|em)?\s*$/.exec(v || '')
  if (!m) return null
  const n = parseFloat(m[1])
  const f = { pt: 1, px: 0.75, cm: 28.35, mm: 2.835, in: 72, em: 12 }[m[2] || 'px']
  return Math.round(n * f * 10) / 10
}

function estiloBloque(el) {
  const st = el.style || {}
  const partes = []
  const al = (st.textAlign || el.getAttribute('align') || '').toLowerCase()
  if (['center', 'right', 'justify'].includes(al)) partes.push('text-align:' + al)
  const ml = aPt(st.marginLeft)
  if (ml && ml > 0) partes.push(`margin-left:${ml}pt`)
  const ti = aPt(st.textIndent)
  if (ti) partes.push(`text-indent:${ti}pt`)
  return partes.length ? ` style="${partes.join(';')}"` : ''
}

function limpiarNodo(n, colapsar) {
  let out = ''
  n.childNodes.forEach((h) => {
    if (h.nodeType === 3) {
      let t = h.nodeValue
      if (colapsar) t = t.replace(/[ \r\n]+/g, ' ')
      out += esc(t)
      return
    }
    if (h.nodeType !== 1) return
    const tag = h.tagName.toUpperCase()
    if (DESCARTAR.has(tag) || tag.includes(':')) return
    if (tag === 'BR') { out += '<br>'; return }
    if (INLINE[tag]) { out += `<${INLINE[tag]}>${limpiarNodo(h, colapsar)}</${INLINE[tag]}>`; return }
    if (tag === 'SPAN' || tag === 'FONT' || tag === 'A') {
      const st = h.style || {}
      const env = []
      if (['bold', '700', '800', '900', 'bolder'].includes(String(st.fontWeight))) env.push('b')
      if ((st.fontStyle || '').includes('italic')) env.push('i')
      if ((st.textDecoration || st.textDecorationLine || '').includes('underline')) env.push('u')
      out += env.map((e) => `<${e}>`).join('') + limpiarNodo(h, colapsar) + env.reverse().map((e) => `</${e}>`).join('')
      return
    }
    if (BLOQUE[tag]) {
      const t = BLOQUE[tag]
      const st = ['p', 'h2', 'h3', 'li', 'blockquote', 'td'].includes(t) ? estiloBloque(h) : ''
      out += `<${t}${st}>${limpiarNodo(h, colapsar)}</${t}>`
      return
    }
    out += limpiarNodo(h, colapsar)
  })
  return out
}

export function limpiarHtml(html, colapsar = true) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return limpiarNodo(doc.body, colapsar)
}

// ── Estilos de la hoja ─────────────────────────────────────────
const CSS = `
.hoja-fondo { background: #eceef3; border: 1px solid var(--border); border-radius: 8px; padding: 18px 12px; overflow: auto; }
.hoja {
  background: #fff; max-width: 794px; margin: 0 auto; min-height: 420px;
  padding: 56px 64px; box-shadow: 0 1px 4px rgba(0,0,0,.15);
  font-family: 'Times New Roman', Times, serif; font-size: 16px; line-height: 1.5; color: #111;
  white-space: pre-wrap; tab-size: 6; word-wrap: break-word; outline: none;
}
.hoja p, .hoja li { margin: 0; }
.hoja h2 { font-size: 1.25em; margin: 0; }
.hoja h3 { font-size: 1.1em; margin: 0; }
.hoja ul, .hoja ol { margin: 0; padding-left: 2em; }
.hoja blockquote { margin: 0 0 0 48px; }
.hoja table { border-collapse: collapse; margin: 4px 0; width: 100%; white-space: normal; }
.hoja td { border: 1px solid #555; padding: 3px 6px; vertical-align: top; }
.hoja[contenteditable="true"] { cursor: text; }
.hoja[contenteditable="true"]:focus { box-shadow: 0 0 0 2px var(--teal), 0 1px 4px rgba(0,0,0,.15); }
.hoja-barra { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 6px; background: #fff; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; position: sticky; top: 0; z-index: 2; }
.hoja-barra button { min-width: 34px; height: 34px; border: 1px solid transparent; background: none; border-radius: 6px; cursor: pointer; color: #333; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
.hoja-barra button:hover { background: #f1f2f6; border-color: var(--border); }
.hoja-barra .sep { width: 1px; height: 22px; background: var(--border); margin: 0 3px; }
.cambios ins { background: #d9f5e3; color: #065f46; text-decoration: underline; }
.cambios del { background: #fde2e2; color: #9b1c1c; text-decoration: line-through; }
@media (max-width: 760px) {
  .hoja { padding: 22px 16px; font-size: 15px; min-height: 300px; }
  .hoja-fondo { padding: 8px 4px; }
}
`

function Linea({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={d} /></svg>
  )
}

const BOTONES = [
  { cmd: 'bold', titulo: 'Negrita (Ctrl+B)', cont: <b>N</b> },
  { cmd: 'italic', titulo: 'Cursiva (Ctrl+K)', cont: <i style={{ fontFamily: 'Georgia, serif' }}>K</i> },
  { cmd: 'underline', titulo: 'Subrayado (Ctrl+S)', cont: <u>S</u> },
  'sep',
  { cmd: 'justifyLeft', titulo: 'Alinear a la izquierda', cont: <Linea d="M4 6h16M4 10h10M4 14h16M4 18h10" /> },
  { cmd: 'justifyCenter', titulo: 'Centrar', cont: <Linea d="M4 6h16M7 10h10M4 14h16M7 18h10" /> },
  { cmd: 'justifyRight', titulo: 'Alinear a la derecha', cont: <Linea d="M4 6h16M10 10h10M4 14h16M10 18h10" /> },
  { cmd: 'justifyFull', titulo: 'Justificar', cont: <Linea d="M4 6h16M4 10h16M4 14h16M4 18h16" /> },
  'sep',
  { cmd: 'outdent', titulo: 'Quitar sangría', cont: <Linea d="M11 6h9M11 10h9M11 14h9M4 18h16M7 9l-3 3 3 3" /> },
  { cmd: 'indent', titulo: 'Aumentar sangría', cont: <Linea d="M11 6h9M11 10h9M11 14h9M4 18h16M4 9l3 3-3 3" /> },
  { cmd: 'insertUnorderedList', titulo: 'Lista con viñetas', cont: <Linea d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> },
  { cmd: 'insertOrderedList', titulo: 'Lista numerada', cont: <Linea d="M10 6h10M10 12h10M10 18h10M4 5l1-1v4M4 12h2l-2 2h2M4 17h2v3H4" /> },
  'sep',
  { cmd: 'undo', titulo: 'Deshacer (Ctrl+Z)', cont: <Linea d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /> },
  { cmd: 'redo', titulo: 'Rehacer (Ctrl+Y)', cont: <Linea d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" /> },
]

export default function EditorDocumento({ inicial, editable = true, onChange }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (inicial || '')) {
      ref.current.innerHTML = inicial || '<p><br></p>'
    }
  }, [inicial])

  function avisar() {
    if (onChange && ref.current) onChange(ref.current.innerHTML)
  }

  function comando(cmd) {
    ref.current?.focus()
    try { document.execCommand('styleWithCSS', false, false) } catch { /* navegadores viejos */ }
    document.execCommand(cmd, false, null)
    avisar()
  }

  function alEnfocar() {
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch { /* sin soporte */ }
  }

  function alTeclear(e) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertText', false, '\t')
      avisar()
      return
    }
    // Atajos de Word en castellano: Ctrl+K cursiva, Ctrl+S subrayado (Ctrl+N no
    // se puede: el navegador lo usa para abrir otra ventana; Ctrl+B/I/U andan solos)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase()
      const mapa = { k: 'italic', s: 'underline' }
      if (mapa[k]) { e.preventDefault(); comando(mapa[k]) }
    }
  }

  function alPegar(e) {
    const cd = e.clipboardData
    if (!cd) return
    const html = cd.getData('text/html')
    const texto = cd.getData('text/plain')
    e.preventDefault()
    if (html) {
      document.execCommand('insertHTML', false, limpiarHtml(html))
    } else if (texto) {
      const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
      if (lineas.length === 1) document.execCommand('insertText', false, texto)
      else document.execCommand('insertHTML', false, lineas.map((l) => `<p>${esc(l) || '<br>'}</p>`).join(''))
    }
    avisar()
  }

  return (
    <div>
      <style>{CSS}</style>
      {editable && (
        <div className="hoja-barra">
          {BOTONES.map((b, i) => b === 'sep'
            ? <span key={i} className="sep" />
            : (
              <button key={b.cmd} type="button" title={b.titulo} aria-label={b.titulo}
                onMouseDown={(e) => { e.preventDefault(); comando(b.cmd) }}>
                {b.cont}
              </button>
            ))}
        </div>
      )}
      <div className="hoja-fondo">
        <div
          ref={ref}
          className="hoja"
          contentEditable={editable}
          suppressContentEditableWarning
          spellCheck={editable}
          lang="es"
          onInput={avisar}
          onFocus={alEnfocar}
          onKeyDown={editable ? alTeclear : undefined}
          onPaste={editable ? alPegar : undefined}
        />
      </div>
    </div>
  )
}

// ── Comparar dos versiones ─────────────────────────────────────

function textoParrafos(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const pars = []
  const bloques = doc.body.querySelectorAll('p, h2, h3, li, td')
  if (!bloques.length) return (doc.body.textContent || '').split('\n')
  bloques.forEach((b) => {
    if (b.querySelector('p, li, td')) return // contenedor: se toman sus hijos
    pars.push((b.textContent || '').replace(/\s+$/, ''))
  })
  return pars
}

function diffPalabras(a, b) {
  // Recorta lo igual al principio y al final (lo habitual es un cambio localizado)
  let ini = 0
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++
  let fa = a.length, fb = b.length
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) { fa--; fb-- }
  const A = a.slice(ini, fa), B = b.slice(ini, fb)
  const res = a.slice(0, ini).map((t) => ['=', t])
  if (A.length * B.length > 3000000) {
    A.forEach((t) => res.push(['-', t]))
    B.forEach((t) => res.push(['+', t]))
  } else {
    const n = A.length, m = B.length
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
    }
    let i = 0, j = 0
    while (i < n && j < m) {
      if (A[i] === B[j]) { res.push(['=', A[i]]); i++; j++ }
      else if (L[i + 1][j] >= L[i][j + 1]) { res.push(['-', A[i]]); i++ }
      else { res.push(['+', B[j]]); j++ }
    }
    while (i < n) res.push(['-', A[i++]])
    while (j < m) res.push(['+', B[j++]])
  }
  a.slice(fa).forEach((t) => res.push(['=', t]))
  return res
}

export function CambiosDocumento({ antes, despues }) {
  const tok = (html) => textoParrafos(html).join('\n').split(/(\s+)/).filter((t) => t !== '')
  const partes = diffPalabras(tok(antes), tok(despues))
  const hayCambios = partes.some(([op, t]) => op !== '=' && t.trim())
  return (
    <div className="cambios">
      <style>{CSS}</style>
      {!hayCambios && <div className="alert alert-ok" style={{ marginBottom: 8 }}>No hay diferencias en el texto.</div>}
      <div className="hoja-fondo">
        <div className="hoja" style={{ minHeight: 200 }}>
          {partes.map(([op, t], i) => op === '=' ? t
            : op === '+' ? <ins key={i}>{t}</ins>
            : <del key={i}>{t}</del>)}
        </div>
      </div>
    </div>
  )
}
