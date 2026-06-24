import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL, VERDICTS, VERDICT_DESC } from '../lib/verdict'

const PAGE_SIZE     = 10 // ticket rows shown before "Show more"

function useCountUp(target, duration = 650) {
  const [display, setDisplay] = useState(target ?? 0)
  const prev = useRef(target ?? 0)
  const raf  = useRef(null)

  useEffect(() => {
    const to = target ?? 0
    const from = prev.current
    if (from === to) return
    cancelAnimationFrame(raf.current)
    const start = performance.now()
    const tick = (now) => {
      const t      = Math.min((now - start) / duration, 1)
      const eased  = 1 - Math.pow(1 - t, 3)   // ease-out cubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else { setDisplay(to); prev.current = to }
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return display
}

// Stat-card icons (stroke, inherit color from the accent chip)
const svg = (children) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
const STAT_ICONS = {
  total:  svg(<><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>),
  avg:    svg(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>),
  pass:   svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>),
  review: svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
}

function StatCard({ label, value, format, sub, color, icon, onClick }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const display  = value == null ? '—' : format ? format(animated) : Math.round(animated)
  const [hovered, setHovered] = useState(false)
  const accent = color || '#1A1E23'
  const clickable = !!onClick
  return (
    <div className="p-5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }) : undefined}
      title={clickable ? 'Show all scored tickets below' : undefined}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${hovered ? '#E4E0DC' : '#EEEEEE'}`,
        borderRadius: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
        cursor: clickable ? 'pointer' : 'default',
      }}>
      <div className="flex items-start justify-between mb-2">
        <p className="g-label" style={{ margin: 0 }}>{label}</p>
        {icon && (
          <span className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: 28, height: 28, background: `${accent}1f`, color: accent, transition: 'background 150ms' }}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-3xl" style={{ color: color || '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600 }}>{display}</p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: clickable && hovered ? '#B84A2E' : 'rgba(26,30,35,.5)', transition: 'color 150ms' }}>
          {sub}{clickable && <span style={{ marginLeft: 4, opacity: hovered ? 1 : 0, transition: 'opacity 150ms' }}>→</span>}
        </p>
      )}
    </div>
  )
}

function buildTrendData(scores, days = 30) {
  const cutoff = Date.now() - days * 86400000
  const recent = scores.filter(s => s.scoredAt >= cutoff)
  if (!recent.length) return []
  const buckets = {}
  recent.forEach(s => {
    const idx = Math.floor((s.scoredAt - cutoff) / 86400000)
    if (!buckets[idx]) buckets[idx] = []
    buckets[idx].push(s.effectiveScore)
  })
  return Object.entries(buckets)
    .map(([day, vals]) => ({ day: parseInt(day), avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.day - b.day)
}


function ScoreTrend({ scores, onDayClick, selectedDay }) {
  const [hoveredBar, setHoveredBar] = useState(null)

  const days = useMemo(() => {
    const result = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label   = d.toLocaleDateString('en-US', { weekday: 'short' })
      const start   = new Date(d.setHours(0, 0, 0, 0)).getTime()
      const end     = start + 86400000
      const count   = scores.filter(s => s.scoredAt >= start && s.scoredAt < end).length
      result.push({ label, count, dateStr })
    }
    return result
  }, [scores])

  const maxCount    = Math.max(...days.map(d => d.count), 1)
  const hasSelection = !!selectedDay
  const selectedLabel = hasSelection
    ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null

  return (
    <div className="p-5" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>

      {/* Header — shows back pill when a day is selected */}
      <div className="flex items-center justify-between mb-4">
        <p className="g-label">Tickets scored — last 7 days</p>
        {hasSelection && (
          <button
            onClick={() => onDayClick(null)}
            className="flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 transition-all"
            style={{ color: 'rgba(26,30,35,.6)', background: '#F1ECE8', border: '1px solid #E7E3DF' }}
            onMouseEnter={e => { e.currentTarget.style.background='#F6F2EF'; e.currentTarget.style.color='#1A1E23' }}
            onMouseLeave={e => { e.currentTarget.style.background='#F1ECE8'; e.currentTarget.style.color='rgba(26,30,35,.6)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            {selectedLabel}
          </button>
        )}
      </div>

      <div className="flex items-end gap-2 h-20 overflow-visible">
        {days.map((d, i) => {
          const isSelected = selectedDay === d.dateStr
          const isHovered  = hoveredBar === i && d.count > 0
          const isDimmed   = hasSelection && !isSelected
          const barColor   = d.count === 0   ? '#F0ECE9'
                           : isSelected      ? '#B84A2E'
                           : isHovered       ? '#ffb39a'
                           : '#FF9780'
          // Solid coral fill, with a soft glow on hover/select
          const barBg     = d.count === 0 ? '#F0ECE9' : barColor
          const barGlow   = isSelected ? '0 0 12px rgba(184,74,46,0.20)' : isHovered ? '0 0 10px rgba(255,151,128,0.40)' : null
          const barShadow = d.count > 0 && barGlow ? barGlow : 'none'
          return (
            <div key={i}
              className="flex-1 flex flex-col items-center gap-1"
              style={{ cursor: d.count > 0 ? 'pointer' : 'default', opacity: isDimmed ? 0.35 : 1, transition: 'opacity 200ms' }}
              onClick={() => d.count > 0 && onDayClick(d.dateStr)}
              onMouseEnter={() => setHoveredBar(i)}
              onMouseLeave={() => setHoveredBar(null)}
              title={d.count > 0 ? `${d.count} ticket${d.count !== 1 ? 's' : ''} on ${d.label}` : undefined}>
              <div className="relative w-full">
                {/* Hover background glow behind the bar — soft gradient that fades upward */}
                {isHovered && !isSelected && (
                  <div className="absolute bottom-0 pointer-events-none"
                    style={{
                      left: '-20%', right: '-20%', height: '92px',
                      background: 'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(255,151,128,0.22) 0%, rgba(255,151,128,0.10) 35%, rgba(255,151,128,0) 75%)',
                      filter: 'blur(6px)',
                      transition: 'opacity 150ms',
                    }} />
                )}
                <div className="relative w-full rounded-t-md"
                  style={{ height: `${Math.max((d.count / maxCount) * 64, d.count > 0 ? 24 : 0)}px`, background: barBg, transition: 'background 150ms, height 200ms, box-shadow 150ms', boxShadow: barShadow }}>
                  {d.count > 0 && (
                    <span className="absolute -top-5 left-0 right-0 text-center text-xs font-semibold tabular-nums"
                      style={{ color: '#1A1E23' }}>
                      {d.count}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs" style={{ color: isSelected ? '#1A1E23' : isHovered ? '#1A1E23' : 'rgba(26,30,35,.5)', fontWeight: isSelected ? 600 : 400, transition: 'color 150ms' }}>{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const selectStyle = {
  background: '#FFFFFF',
  border: '1px solid #E1DCD7',
  color: '#1A1E23',
  outline: 'none',
}

export default function DashboardPage() {
  const { scoreHistory, agents, teams, rubric } = useApp()
  const { role, profile } = useAuth()

  // myAgentId from context — used only for display; scoreHistory is already scoped
  const { myAgentId, activeOverlay, setActiveOverlay, dataLoading } = useApp()
  const [panelScore, setPanelScore] = useState(null)
  const [modalScore, setModalScore] = useState(null)
  const [filters,      setFilters]      = useState({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })
  const [activeRange,  setActiveRange]  = useState(null) // '7d' | '30d' | '90d'
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedDay,  setSelectedDay]  = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE) // progressive "Show more" reveal
  const tableRef = useRef(null)

  // Close the score panel when another overlay (notifications / settings) opens
  useEffect(() => {
    if (activeOverlay !== 'score') setPanelScore(null)
  }, [activeOverlay])

  const openPanel = (score) => { setPanelScore(score); setActiveOverlay('score') }
  const closePanel = () => { setPanelScore(null); setActiveOverlay(o => o === 'score' ? null : o) }

  const handleDayClick = (dateStr) => {
    if (!dateStr || selectedDay === dateStr) {
      setSelectedDay(null)
      setFilters(f => ({ ...f, dateFrom: '', dateTo: '' }))
    } else {
      setSelectedDay(dateStr)
      setFilters(f => ({ ...f, dateFrom: dateStr, dateTo: dateStr }))
      setActiveRange(null)
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }

  // Total Scored card → clear every filter (so the table shows all scored tickets,
  // matching the count) and scroll down to the list.
  const showAllTickets = () => {
    setFilters({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })
    setActiveRange(null); setTicketSearch(''); setSelectedDay(null)
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const set = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const focus = e => e.target.style.borderColor = '#FF9780'
  const blur  = e => e.target.style.borderColor = '#E1DCD7'

  const agentName = (id) => agents.find(a => a.id === id)?.name

  const teamAgentMap = useMemo(() => {
    const map = {}
    teams.forEach(t => { map[t.id] = new Set(agents.filter(a => a.team_id === t.id).map(a => a.id)) })
    return map
  }, [teams, agents])

  const searchTicketId = useMemo(() => {
    const raw = ticketSearch.trim()
    if (!raw) return null
    const match = raw.match(/\/(?:tickets?|views\/\d+)\/(\d+)/) || raw.match(/^(\d+)$/)
    return match ? match[1] : raw
  }, [ticketSearch])

  const filteredScores = useMemo(() => scoreHistory.filter(s => {
    // scoreHistory is already scoped to agent's own tickets via AppContext
    if (searchTicketId && String(s.ticketId) !== searchTicketId) return false
    if (filters.agent && !s.agentIds?.includes(filters.agent)) return false
    if (filters.team  && !s.agentIds?.some(id => teamAgentMap[filters.team]?.has(id))) return false
    if (filters.verdicts.length && !filters.verdicts.includes(s.effectiveVerdict)) return false
    if (filters.dateFrom && s.scoredAt < new Date(filters.dateFrom).setHours(0,0,0,0)) return false
    if (filters.dateTo   && s.scoredAt > new Date(filters.dateTo).setHours(23,59,59,999)) return false
    return true
  }), [scoreHistory, filters, teamAgentMap, searchTicketId])

  const hasFilters = (role !== 'agent' && (filters.agent || filters.team)) || filters.verdicts.length || filters.dateFrom || filters.dateTo || ticketSearch

  // Reset the progressive reveal back to the first page whenever the result set changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filteredScores])

  // All stats use effective values (override when present, AI otherwise)
  const total    = filteredScores.length
  const pass     = filteredScores.filter(s => s.effectiveVerdict === 'PASS').length
  const review   = filteredScores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
  const fail     = filteredScores.filter(s => s.effectiveVerdict === 'FAIL').length
  const avg      = total ? (filteredScores.reduce((s, x) => s + x.effectiveScore, 0) / total).toFixed(1) : null
  const passRate = total ? Math.round((pass / total) * 100) : null
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0,0,0,0)
  const thisWeek  = filteredScores.filter(s => s.scoredAt >= weekStart.getTime()).length

  return (
    <div className={`panel-push ${panelScore ? 'is-open' : ''}`}>
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-16">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl" style={{ color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600 }}>{role === 'agent' ? 'My Performance' : 'Dashboard'}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
          {hasFilters
            ? <><span style={{ color: '#B84A2E' }}>{total}</span> ticket{total !== 1 ? 's' : ''} match your filters</>
            : <>{role === 'agent' ? 'Your QA scores' : 'QA performance overview'}{profile?.name && <> · <span style={{ color: '#B84A2E' }}>{profile.name}</span></>}</>
          }
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full capitalize"
            style={{ background: '#FFEAE6', color: '#B84A2E' }}>{role}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Scored',  value: total,                      format: n => Math.round(n),        sub: `${thisWeek} this week`, color: '#1A1E23', icon: STAT_ICONS.total, onClick: showAllTickets },
          { label: 'Average Score', value: avg != null ? parseFloat(avg) : null, format: n => n.toFixed(1), sub: 'out of 100', color: '#C8841E', icon: STAT_ICONS.avg },
          { label: 'Pass Rate',     value: passRate,                   format: n => `${Math.round(n)}%`,  sub: `${pass} tickets`, color: '#3B7DD8', icon: STAT_ICONS.pass },
          { label: 'Need Review',   value: review + fail,              format: n => Math.round(n),        sub: `${review} review · ${fail} fail`, color: review + fail > 0 ? '#C8841E' : 'rgba(26,30,35,.45)', icon: STAT_ICONS.review },
        ].map((p, i) => (
          <div key={p.label} className="stagger-item" style={{ '--i': i }}>
            <StatCard {...p} />
          </div>
        ))}
      </div>

      {/* Distribution + Trend */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="p-5" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="g-label" style={{ margin: 0 }}>Score distribution<ScoreInfoPopover rubric={rubric} /></p>
            <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>{total} ticket{total !== 1 ? 's' : ''}</span>
          </div>
          {total === 0 ? <p className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>No tickets scored yet</p> : (() => {
            const vt = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
            const range = { PASS: `≥${vt.pass}`, NEEDS_REVIEW: `${vt.needs_review}–${vt.pass - 1}`, FAIL: `<${vt.needs_review}` }
            const rows = [['PASS', pass], ['NEEDS_REVIEW', review], ['FAIL', fail]]
            const C = 2 * Math.PI * 42
            const passRate = Math.round((pass / total) * 100)
            const segCount = rows.filter(([, n]) => n > 0).length
            const GAP = segCount > 1 ? 12 : 0  // crisp separation between arcs (none if a single verdict)
            const labelStyle = { fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(26,30,35,.5)' }
            let acc = 0
            const segs = rows.filter(([, n]) => n > 0).map(([v, n]) => {
              const frac = n / total
              const len = Math.max(1, frac * C - GAP)
              const seg = (
                <circle key={v} cx="50" cy="50" r="42" fill="none" stroke={VERDICT_COLOR[v]} strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                  strokeDashoffset={(-(acc * C) - GAP / 2).toFixed(2)} />
              )
              acc += frac
              return seg
            })
            return (
              <div className="flex items-center gap-5">
                {/* Donut — pass rate in the center */}
                <div className="relative shrink-0" style={{ width: 116, height: 116 }}>
                  <svg width="116" height="116" viewBox="0 0 100 100">
                    <g transform="rotate(-90 50 50)">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#F0ECE9" strokeWidth="11" />
                      {segs}
                    </g>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl tabular-nums" style={{ color: VERDICT_COLOR.PASS, lineHeight: 1, fontFamily: "'Inter Tight', sans-serif", fontWeight: 600 }}>{passRate}%</span>
                    <span className="text-xs mt-0.5" style={{ color: 'rgba(26,30,35,.5)' }}>pass rate</span>
                  </div>
                </div>
                {/* Legend — labelled columns so each number is clear */}
                <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                  <div className="flex items-center gap-4">
                    <span className="flex-1" />
                    <span className="w-12 text-right" style={labelStyle}>Tickets</span>
                    <span className="w-12 text-right" style={labelStyle}>Share</span>
                  </div>
                  {rows.map(([v, n]) => {
                    const pct = total > 0 ? Math.round((n / total) * 100) : 0
                    return (
                      <div key={v} className="flex items-center gap-4" title={`${VERDICT_DESC[v]} · score ${range[v]}`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: VERDICT_COLOR[v], flexShrink: 0 }} />
                          <span className="text-xs font-medium" style={{ color: VERDICT_COLOR[v] }}>{VERDICT_LABEL[v]}</span>
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums" style={{ color: '#1A1E23' }}>{n}</span>
                        <span className="w-12 text-right text-xs tabular-nums" style={{ color: 'rgba(26,30,35,.6)' }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
        <ScoreTrend scores={filteredScores} onDayClick={handleDayClick} selectedDay={selectedDay} />
      </div>

      {/* ── Ticket table with filters ── */}
      <div ref={tableRef}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600 }}>{role === 'agent' ? 'My Tickets' : 'All Tickets'}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>
              Showing {Math.min(visibleCount, filteredScores.length)} of {filteredScores.length}
              {filteredScores.length !== total && ` · ${total} total`}
            </span>
            {filteredScores.length > 0 && (
              <button
                onClick={() => {
                  const rows = [
                    ['Ticket ID', 'Subject', 'Agents', 'Score', 'Verdict', 'Overridden', 'Date'],
                    ...filteredScores.map(s => [
                      s.ticketId,
                      `"${(s.fullScore?.ticket_subject || '').replace(/"/g, '""')}"`,
                      `"${s.agentIds?.map(id => agentName(id)).filter(Boolean).join(', ') || ''}"`,
                      s.effectiveScore?.toFixed(1) ?? '',
                      s.effectiveVerdict,
                      s.overrideVerdict ? 'Yes' : 'No',
                      new Date(s.scoredAt).toLocaleDateString(),
                    ])
                  ]
                  const csv  = rows.map(r => r.join(',')).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url  = URL.createObjectURL(blob)
                  const a    = document.createElement('a')
                  a.href = url; a.download = `qa-scores-${new Date().toISOString().slice(0,10)}.csv`
                  a.click(); URL.revokeObjectURL(url)
                }}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#1A1E23', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF'; e.currentTarget.style.borderColor = '#E4E0DC' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
                ↓ Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Ticket search — admin/lead only */}
        {role !== 'agent' && (
          <div className="relative mb-3">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: ticketSearch ? '#FF9780' : 'rgba(26,30,35,.45)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              placeholder="Search by ticket URL or ID…"
              className="w-full rounded-lg pl-11 pr-10 py-3 text-sm outline-none transition-all"
              style={{
                background: '#FFFFFF',
                border: `1px solid ${ticketSearch ? '#FF9780' : '#E1DCD7'}`,
                color: '#1A1E23',
                boxShadow: ticketSearch ? '0 0 0 3px rgba(255,151,128,0.18)' : 'none',
              }}
            />
            {ticketSearch && (
              <button onClick={() => setTicketSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-sm transition-colors"
                style={{ color: 'rgba(26,30,35,.5)', background: '#F1ECE8' }}
                onMouseEnter={e => { e.currentTarget.style.color='#1A1E23'; e.currentTarget.style.background='#F6F2EF' }}
                onMouseLeave={e => { e.currentTarget.style.color='rgba(26,30,35,.5)'; e.currentTarget.style.background='#F1ECE8' }}>
                ×
              </button>
            )}
            {ticketSearch && searchTicketId && (
              <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#B84A2E', background: '#FFEAE6' }}>
                #{searchTicketId}
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="p-4 mb-4" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
          <div className="flex flex-wrap gap-3 items-end">

            {role !== 'agent' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Agent</label>
                <select value={filters.agent} onChange={e => set('agent', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">All agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            {role !== 'agent' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Team</label>
                <select value={filters.team} onChange={e => set('team', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">All teams</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>From</label>
              <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'light' }} onFocus={focus} onBlur={blur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>To</label>
              <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'light' }} onFocus={focus} onBlur={blur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Quick range</label>
              <div className="flex gap-1.5">
                {[['7d', 7], ['30d', 30], ['90d', 90]].map(([label, days]) => {
                  const isActive = activeRange === label
                  return (
                    <button key={label} onClick={() => {
                      const to   = new Date()
                      const from = new Date()
                      from.setDate(from.getDate() - days)
                      setFilters(f => ({ ...f, dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) }))
                      setActiveRange(label)
                    }}
                      className="text-xs px-3 py-2 rounded-lg border transition-all font-medium"
                      style={isActive
                        ? { color: '#B84A2E', borderColor: '#FF9780', background: '#FFEAE6' }
                        : { color: '#1A1E23', borderColor: '#E7E3DF', background: '#FFFFFF' }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background='#F6F2EF'; e.currentTarget.style.borderColor='#E4E0DC' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.borderColor='#E7E3DF' } }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Status</label>
              <div className="flex gap-1.5">
                {VERDICTS.map(v => {
                  const active = filters.verdicts.includes(v)
                  return (
                    <button key={v} onClick={() => set('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                      className="text-xs px-3 py-2 rounded-lg border transition-all font-medium flex items-center gap-1.5"
                      style={active
                        ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                        : { color: '#1A1E23', borderColor: '#E7E3DF', background: '#FFFFFF' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[v], flexShrink: 0 }} />
                      {VERDICT_LABEL[v]}
                    </button>
                  )
                })}
              </div>
            </div>

            {hasFilters && (
              <button onClick={() => { setFilters({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' }); setActiveRange(null); setTicketSearch(''); setSelectedDay(null) }}
                className="text-xs px-3 py-2 rounded-lg self-end transition-colors"
                style={{ color: '#1A1E23', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                onMouseEnter={e => { e.currentTarget.style.color='#D14B3D'; e.currentTarget.style.borderColor='rgba(209,75,61,0.4)' }}
                onMouseLeave={e => { e.currentTarget.style.color='#1A1E23'; e.currentTarget.style.borderColor='#E7E3DF' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {dataLoading && scoreHistory.length === 0 ? (
          <div className="overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
            <div className="grid px-4 py-3" style={{
              gridTemplateColumns: '100px 1fr 120px 80px 90px 80px',
              background: '#FBF7F3',
              borderBottom: '1px solid #F0ECE9',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'rgba(26,30,35,.5)',
            }}>
              <span>Ticket</span><span>Subject</span><span className="text-center">Agents</span>
              <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
            </div>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: '100px 1fr 120px 80px 90px 80px', borderBottom: '1px solid #F0ECE9' }}>
                <span className="skeleton-bar" style={{ width: 56 }} />
                <span className="skeleton-bar" style={{ width: '70%' }} />
                <span className="skeleton-bar" style={{ width: 80 }} />
                <span className="skeleton-bar justify-self-end" style={{ width: 44 }} />
                <span className="skeleton-bar justify-self-center" style={{ width: 50 }} />
                <span className="skeleton-bar justify-self-end" style={{ width: 36 }} />
              </div>
            ))}
          </div>
        ) : filteredScores.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'rgba(26,30,35,.45)' }}>
            <p className="text-sm">{total === 0 ? 'No tickets scored yet.' : 'No tickets match your filters.'}</p>
          </div>
        ) : (
          <div className="overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
            <div className="grid px-4 py-3" style={{
              gridTemplateColumns: '100px 1fr 120px 80px 90px 80px',
              background: '#FBF7F3',
              borderBottom: '1px solid #F0ECE9',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'rgba(26,30,35,.5)',
            }}>
              <span>Ticket</span><span>Subject</span><span className="text-center">Agents</span>
              <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
            </div>

            {filteredScores.slice(0, visibleCount).map(s => (
              <div key={s.id} className="grid items-center px-4 py-3 transition-colors"
                style={{ gridTemplateColumns: '100px 1fr 120px 80px 90px 80px', borderBottom: '1px solid #F0ECE9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs" style={{ color: '#B84A2E' }}
                  onMouseEnter={e => e.target.style.textDecoration='underline'}
                  onMouseLeave={e => e.target.style.textDecoration='none'}>
                  #{s.ticketId}
                </a>

                <button onClick={() => openPanel({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                  className="text-sm text-left truncate pr-3 transition-colors"
                  style={{ color: '#1A1E23' }}
                  onMouseEnter={e => e.target.style.color='#B84A2E'}
                  onMouseLeave={e => e.target.style.color='#1A1E23'}>
                  {s.fullScore?.ticket_subject || '—'}
                </button>

                <div className="flex flex-wrap gap-1 justify-center">
                  {s.agentIds?.length > 0
                    ? s.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
                        style={{ background: '#F1ECE8', color: 'rgba(26,30,35,.72)' }}>{name}</span>
                    ))
                    : <span style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}
                </div>

                <span className="text-sm tabular-nums text-right" style={{ color: '#1A1E23' }}>
                  {s.effectiveScore?.toFixed(0)}/100
                  {s.overrideVerdict && <span className="text-xs ml-0.5" style={{ color: '#3B7DD8' }}>*</span>}
                </span>

                <div className="flex justify-center">
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[s.effectiveVerdict], flexShrink: 0 }} />
                    <span className="text-xs font-medium" style={{ color: 'rgba(26,30,35,.72)', letterSpacing: '0.04em' }}>
                      {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
                    </span>
                  </span>
                </div>

                <span className="text-xs text-right" style={{ color: 'rgba(26,30,35,.5)' }}>
                  {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}

            {visibleCount < filteredScores.length && (
              <div className="flex items-center justify-center px-4 py-3" style={{ background: '#FBF7F3' }}>
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#1A1E23', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF'; e.currentTarget.style.borderColor = '#E4E0DC' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
                  Show more · {Math.min(PAGE_SIZE, filteredScores.length - visibleCount)} of {filteredScores.length - visibleCount} remaining
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {panelScore && (
        <ScoreModal
          score={panelScore}
          onClose={closePanel}
          onExpand={() => { setModalScore(panelScore); closePanel() }}
          panel
        />
      )}
      {modalScore && <ScoreModal score={modalScore} onClose={() => setModalScore(null)} />}
    </div>
    </div>
  )
}
