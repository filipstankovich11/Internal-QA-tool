import { useState, useRef, useEffect } from 'react'

// Custom select (Gorgias warm/light) — replaces native <select> everywhere.
// Controlled: `value` + `onChange(value)`. options: array of { value, label } or strings.
const AVATAR_COLORS = ['#FFD2C9', '#E8E3E1', '#D9C9F2', '#BFE3CD', '#FBEBD3']

const ChevronDown = ({ open }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ color: 'rgba(26,30,35,.45)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s', flexShrink: 0 }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const Check = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#B84A2E', flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
const UsersGlyph = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>

function Avatar({ o, i }) {
  const isAll = /^all\b/i.test(o.label || '')
  if (isAll) return <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24, borderRadius: '50%', background: '#F1ECE8', color: 'rgba(26,30,35,.5)' }}><UsersGlyph /></span>
  return <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], color: '#1A1E23', fontSize: 11, fontWeight: 700 }}>{(o.label || '?')[0].toUpperCase()}</span>
}

export default function Dropdown({ value, onChange, options, placeholder = 'Select…', width = 160, avatars = false }) {
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = opts.find(o => o.value === value)
  const selIdx = opts.indexOf(selected)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative" style={{ width }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg text-sm transition-colors"
        style={{ height: 38, padding: '0 10px', background: '#fff', border: `1px solid ${open ? '#FF9780' : '#E1DCD7'}`, color: selected ? '#1A1E23' : 'rgba(26,30,35,.45)', outline: 'none' }}>
        <span className="flex items-center gap-2 truncate">
          {avatars && selected && <Avatar o={selected} i={selIdx} />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown open={open} />
      </button>

      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1.5"
          style={{ background: '#fff', border: '1px solid #EEEEEE', borderRadius: 14, boxShadow: '0 16px 36px -10px rgba(0,0,0,.2)', padding: 6, maxHeight: 280, overflowY: 'auto', animation: 'datepop .18s ease' }}>
          {opts.map((o, i) => {
            const sel = o.value === value
            return (
              <button key={o.value} type="button" onClick={() => { onChange?.(o.value); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition-colors"
                style={{ background: sel ? '#FFF4F1' : 'transparent', color: '#1A1E23' }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#FBF7F3' }}
                onMouseLeave={e => { e.currentTarget.style.background = sel ? '#FFF4F1' : 'transparent' }}>
                {avatars && <Avatar o={o} i={i} />}
                <span className="flex-1 truncate">{o.label}</span>
                {sel && <Check />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
