// Render text with any URLs (http(s):// or bare www.) as clickable links.
// Trailing sentence punctuation is kept out of the link. Clicks don't bubble,
// so linkifying inside a clickable row/bubble won't trigger the row's onClick.
const URL_RE = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/gi
const TRAIL_RE = /[.,;:!?]+$/

export default function Linkify({ text, color = '#B84A2E' }) {
  if (text == null || text === '') return text
  const str = String(text)
  const out = []
  let last = 0, m
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(str)) !== null) {
    const raw = m[0]
    const trail = (raw.match(TRAIL_RE) || [''])[0]
    const url = trail ? raw.slice(0, raw.length - trail.length) : raw
    if (m.index > last) out.push(str.slice(last, m.index))
    out.push(
      <a key={m.index} href={url.startsWith('http') ? url : `https://${url}`}
        target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}
        style={{ color, textDecoration: 'underline', wordBreak: 'break-word' }}>{url}</a>
    )
    if (trail) out.push(trail)
    last = m.index + raw.length
  }
  if (last < str.length) out.push(str.slice(last))
  return out.length ? out : str
}
