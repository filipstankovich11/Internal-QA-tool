import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from '../context/NavigationContext'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

// ⌘K / Ctrl-K command palette — search + grouped Actions / Go-to / Recent.
const PAGES = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'score',       label: 'Score',        scorer: true },
  { id: 'grade',       label: 'Grade a ticket', scorer: true },
  { id: 'review',      label: 'Review Queue', scorer: true },
  { id: 'myqueue',     label: 'My Queue',     admin: true },
  { id: 'agents',      label: 'Agents' },
  { id: 'teams',       label: 'Teams',        scorer: true },
  { id: 'rubric',      label: 'QA Guidance',  admin: true },
  { id: 'calibration', label: 'Calibration',  scorer: true },
  { id: 'inbox',       label: 'Inbox',        agent: true },
  { id: 'coaching',    label: 'Coaching',     agent: true },
]

export default function CommandPalette() {
  const navigate = useNavigate()
  const { canScore, isAdmin, role } = useAuth()
  const { scoreHistory } = useApp()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef(null)
  const isAgent = role === 'agent'

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) }
      else if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) { setQ(''); setHi(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  useEffect(() => { setHi(0) }, [q])

  const ql = q.trim().toLowerCase()
  const match = (label) => !ql || label.toLowerCase().includes(ql)

  const groups = useMemo(() => {
    const pages = PAGES.filter(p => !(p.scorer && !canScore) && !(p.admin && !isAdmin) && !(p.agent && !isAgent))
    const actions = [
      canScore && { id: 'a-score', label: 'Score a ticket', go: 'score' },
      canScore && { id: 'a-review', label: 'Open the review queue', go: 'review' },
      isAdmin && { id: 'a-cal', label: 'New calibration session', go: 'calibration' },
      isAdmin && { id: 'a-rubric', label: 'Edit QA guidance', go: 'rubric' },
    ].filter(Boolean)
    const recent = [...scoreHistory].sort((a, b) => b.scoredAt - a.scoredAt).slice(0, 4)
      .map(s => ({ id: 'r-' + s.id, label: `#${s.ticketId} · ${s.fullScore?.ticket_subject || '—'}`, go: 'dashboard' }))
    return [
      { name: 'Actions', items: actions.filter(i => match(i.label)) },
      { name: 'Go to',   items: pages.map(p => ({ id: 'g-' + p.id, label: p.label, go: p.id })).filter(i => match(i.label)) },
      { name: 'Recent',  items: recent.filter(i => match(i.label)) },
    ].filter(g => g.items.length)
  }, [ql, canScore, isAdmin, isAgent, scoreHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  const flat = groups.flatMap(g => g.items)
  const run = (item) => { navigate(item.go); setOpen(false) }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[hi]) run(flat[hi]) }
  }

  if (!open) return null
  let idx = -1
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4" style={{ paddingTop: '12vh', background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(2px)' }} onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}
        style={{ background: '#fff', border: '1px solid #EEEEEE', boxShadow: '0 24px 64px rgba(0,0,0,.22)', animation: 'datepop .18s ease' }}>
        {/* Search */}
        <div className="flex items-center gap-2.5 px-4" style={{ borderBottom: '1px solid #F0ECE9' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(26,30,35,.4)', flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search actions, pages, tickets…"
            className="flex-1 py-3.5 text-sm outline-none" style={{ background: 'transparent', color: '#1A1E23' }} />
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#F1ECE8', color: 'rgba(26,30,35,.5)' }}>esc</span>
        </div>
        {/* Results */}
        <div className="overflow-y-auto py-2" style={{ maxHeight: 360 }}>
          {flat.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'rgba(26,30,35,.45)' }}>No results for “{q}”</p>
          ) : groups.map(g => (
            <div key={g.name} className="px-2 mb-1">
              <p className="px-2.5 py-1 uppercase" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.4)' }}>{g.name}</p>
              {g.items.map(item => {
                idx++
                const myIdx = idx
                const active = myIdx === hi
                return (
                  <button key={item.id} onMouseEnter={() => setHi(myIdx)} onClick={() => run(item)}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-sm truncate transition-colors"
                    style={{ background: active ? '#FBF7F3' : 'transparent', color: '#1A1E23' }}>
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
