import { useState, useRef, useEffect } from 'react'

// Reusable calendar-popover date picker (Gorgias warm/light).
// Controlled: `value` is a YYYY-MM-DD string ('' = empty); `onChange(YYYY-MM-DD)`.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const pad = (n) => String(n).padStart(2, '0')
const fmt = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`      // dd.mm.yyyy
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`     // YYYY-MM-DD (local)
const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return y ? new Date(y, m - 1, d) : null }
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const Chevron = ({ dir }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
  </svg>
)

export default function DatePicker({ value, onChange, placeholder = 'dd.mm.yyyy', width = 150 }) {
  const [open, setOpen] = useState(false)
  const selected = parseISO(value)
  const [view, setView] = useState(selected || new Date())
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setView(selected || new Date())
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date()
  const year = view.getFullYear(), month = view.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))]

  const navBtn = { width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(26,30,35,.6)', background: 'transparent', border: 'none', cursor: 'pointer' }

  return (
    <div ref={rootRef} className="relative" style={{ width }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg text-sm transition-colors"
        style={{ height: 38, padding: '0 10px', background: '#fff', border: `1px solid ${open ? '#FF9780' : '#E1DCD7'}`, color: selected ? '#1A1E23' : 'rgba(26,30,35,.45)', outline: 'none' }}>
        <span className="truncate">{selected ? fmt(selected) : placeholder}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(26,30,35,.45)', flexShrink: 0 }}>
          <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-40 left-0 mt-1.5"
          style={{ width: 246, background: '#fff', border: '1px solid #EEEEEE', borderRadius: 14, boxShadow: '0 16px 36px -10px rgba(0,0,0,.2)', padding: 12, animation: 'datepop .18s ease' }}>
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" style={navBtn} onClick={() => setView(new Date(year, month - 1, 1))}
              onMouseEnter={e => e.currentTarget.style.background = '#F4EEE9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Chevron dir="left" /></button>
            <span className="text-sm font-semibold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif" }}>{MONTHS[month]} {year}</span>
            <button type="button" style={navBtn} onClick={() => setView(new Date(year, month + 1, 1))}
              onMouseEnter={e => e.currentTarget.style.background = '#F4EEE9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Chevron dir="right" /></button>
          </div>
          {/* Day-of-week row */}
          <div className="grid grid-cols-7 mb-1">
            {DOW.map((d, i) => <span key={i} className="text-center" style={{ fontSize: 10, fontWeight: 600, color: 'rgba(26,30,35,.45)' }}>{d}</span>)}
          </div>
          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => d === null ? <span key={i} /> : (
              <button key={i} type="button" onClick={() => { onChange?.(toISO(d)); setOpen(false) }}
                className="rounded-md text-sm flex items-center justify-center transition-colors"
                style={{ aspectRatio: '1 / 1',
                  ...(sameDay(d, selected)
                    ? { background: '#FF9780', color: '#1A1E23', fontWeight: 600 }
                    : { background: 'transparent', color: sameDay(d, today) ? '#B84A2E' : '#1A1E23', fontWeight: sameDay(d, today) ? 600 : 400 }) }}
                onMouseEnter={e => { if (!sameDay(d, selected)) e.currentTarget.style.background = '#F4EEE9' }}
                onMouseLeave={e => { if (!sameDay(d, selected)) e.currentTarget.style.background = 'transparent' }}>
                {d.getDate()}
              </button>
            ))}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange?.(''); setOpen(false) }}
              className="w-full mt-2 text-xs py-1.5 rounded-md transition-colors" style={{ color: 'rgba(26,30,35,.55)' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F4EEE9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
