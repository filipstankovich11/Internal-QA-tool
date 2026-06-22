import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL, VERDICTS } from '../lib/verdict'

// What each verdict means — paired with the rubric's score range at render
const VERDICT_DESC = { PASS: 'Met the bar', NEEDS_REVIEW: 'Needs a human look', FAIL: 'Below standard or auto-fail' }
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

function StatCard({ label, value, format, sub, color }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const display  = value == null ? '—' : format ? format(animated) : Math.round(animated)
  const [hovered, setHovered] = useState(false)
  return (
    <div className="rounded-2xl p-5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'linear-gradient(180deg, #222 0%, #1e1e1e 100%)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)'}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,${hovered ? '0.10' : '0.07'})`,
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
      }}>
      <p className="g-label mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color: color || '#fff' }}>{display}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#999' }}>{sub}</p>}
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
    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(180deg, #222 0%, #1e1e1e 100%)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>

      {/* Header — shows back pill when a day is selected */}
      <div className="flex items-center justify-between mb-4">
        <p className="g-label">Tickets scored — last 7 days</p>
        {hasSelection && (
          <button
            onClick={() => onDayClick(null)}
            className="flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 transition-all"
            style={{ color: '#aaa', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.12)'; e.currentTarget.style.color='#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='#aaa' }}>
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
          const barColor   = d.count === 0   ? '#242426'
                           : isSelected      ? '#fff'
                           : isHovered       ? '#ffb39a'
                           : '#FF9780'
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
                <div className="relative w-full rounded-t-sm"
                  style={{ height: `${Math.max((d.count / maxCount) * 64, d.count > 0 ? 24 : 0)}px`, background: barColor, transition: 'background 150ms, height 200ms', boxShadow: isSelected ? '0 0 12px rgba(255,255,255,0.25)' : isHovered ? '0 0 8px rgba(255,151,128,0.4)' : 'none' }}>
                  {d.count > 0 && (
                    <span className="absolute top-1 left-0 right-0 text-center text-xs font-semibold tabular-nums"
                      style={{ color: 'rgba(0,0,0,0.6)' }}>
                      {d.count}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs" style={{ color: isSelected ? '#fff' : isHovered ? '#fff' : '#c8c8c8', fontWeight: isSelected ? 600 : 400, transition: 'color 150ms' }}>{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const selectStyle = {
  background: '#1e1e20',
  border: '1px solid rgba(255,255,255,0.07)',
  color: '#fff',
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

  const set = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const focus = e => e.target.style.borderColor = '#FF9780'
  const blur  = e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'

  const avgColor = (v) => v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'
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
        <h1 className="text-2xl font-bold text-white">{role === 'agent' ? 'My Performance' : 'Dashboard'}</h1>
        <p className="text-sm mt-0.5" style={{ color: '#888' }}>
          {hasFilters
            ? <><span style={{ color: '#FF9780' }}>{total}</span> ticket{total !== 1 ? 's' : ''} match your filters</>
            : <>{role === 'agent' ? 'Your QA scores' : 'QA performance overview'}{profile?.name && <> · <span style={{ color: '#FF9780' }}>{profile.name}</span></>}</>
          }
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full capitalize"
            style={{ background: 'rgba(255,151,128,0.08)', color: '#FF9780' }}>{role}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Scored',  value: total,                      format: n => Math.round(n),        sub: `${thisWeek} this week` },
          { label: 'Average Score', value: avg != null ? parseFloat(avg) : null, format: n => n.toFixed(1), sub: 'out of 100', color: avg ? avgColor(parseFloat(avg)) : null },
          { label: 'Pass Rate',     value: passRate,                   format: n => `${Math.round(n)}%`,  sub: `${pass} tickets`, color: '#10b981' },
          { label: 'Need Review',   value: review + fail,              format: n => Math.round(n),        sub: `${review} review · ${fail} fail`, color: review + fail > 0 ? '#f59e0b' : '#555' },
        ].map((p, i) => (
          <div key={p.label} className="stagger-item" style={{ '--i': i }}>
            <StatCard {...p} />
          </div>
        ))}
      </div>

      {/* Distribution + Trend */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(180deg, #222 0%, #1e1e1e 100%)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="g-label" style={{ margin: 0 }}>Score distribution<ScoreInfoPopover rubric={rubric} /></p>
            <span className="text-xs" style={{ color: '#888' }}>{total} ticket{total !== 1 ? 's' : ''}</span>
          </div>
          {total === 0 ? <p className="text-xs" style={{ color: '#555' }}>No tickets scored yet</p> : (() => {
            const vt = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
            const range = { PASS: `≥${vt.pass}`, NEEDS_REVIEW: `${vt.needs_review}–${vt.pass - 1}`, FAIL: `<${vt.needs_review}` }
            const rows = [['PASS', pass], ['NEEDS_REVIEW', review], ['FAIL', fail]]
            const C = 2 * Math.PI * 42
            const passRate = Math.round((pass / total) * 100)
            const segCount = rows.filter(([, n]) => n > 0).length
            const GAP = segCount > 1 ? 12 : 0  // crisp separation between arcs (none if a single verdict)
            const labelStyle = { fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#777' }
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
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="11" />
                      {segs}
                    </g>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums" style={{ color: VERDICT_COLOR.PASS, lineHeight: 1 }}>{passRate}%</span>
                    <span className="text-xs mt-0.5" style={{ color: '#888' }}>pass rate</span>
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
                        <span className="w-12 text-right text-xs tabular-nums" style={{ color: '#e8e8e8' }}>{n}</span>
                        <span className="w-12 text-right text-xs tabular-nums" style={{ color: '#c8c8c8' }}>{pct}%</span>
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
          <h2 className="text-white font-semibold">{role === 'agent' ? 'My Tickets' : 'All Tickets'}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: '#c8c8c8' }}>
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
                style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
                ↓ Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Ticket search — admin/lead only */}
        {role !== 'agent' && (
          <div className="relative mb-3">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: ticketSearch ? '#FF9780' : '#444' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              placeholder="Search by ticket URL or ID…"
              className="w-full rounded-xl pl-11 pr-10 py-3 text-sm outline-none transition-all"
              style={{
                background: '#1c1c1e',
                border: `1px solid ${ticketSearch ? 'rgba(255,151,128,0.4)' : 'rgba(255,255,255,0.07)'}`,
                color: '#fff',
                boxShadow: ticketSearch ? '0 0 0 3px rgba(255,151,128,0.06)' : 'none',
              }}
            />
            {ticketSearch && (
              <button onClick={() => setTicketSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-sm transition-colors"
                style={{ color: '#666', background: 'rgba(255,255,255,0.10)' }}
                onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.color='#666'; e.currentTarget.style.background='rgba(255,255,255,0.10)' }}>
                ×
              </button>
            )}
            {ticketSearch && searchTicketId && (
              <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#FF9780', background: 'rgba(255,151,128,0.1)' }}>
                #{searchTicketId}
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'linear-gradient(180deg, #222 0%, #1e1e1e 100%)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
          <div className="flex flex-wrap gap-3 items-end">

            {role !== 'agent' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-xs" style={{ color: '#c8c8c8' }}>Agent</label>
                <select value={filters.agent} onChange={e => set('agent', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">All agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            {role !== 'agent' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-xs" style={{ color: '#c8c8c8' }}>Team</label>
                <select value={filters.team} onChange={e => set('team', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">All teams</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#c8c8c8' }}>From</label>
              <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#c8c8c8' }}>To</label>
              <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#c8c8c8' }}>Quick range</label>
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
                      className="text-xs px-3 py-2 rounded-xl border transition-all font-medium"
                      style={isActive
                        ? { color: '#FF9780', borderColor: 'rgba(255,151,128,0.4)', background: 'rgba(255,151,128,0.08)' }
                        : { color: '#fff', borderColor: 'rgba(255,255,255,0.07)', background: 'transparent' }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' } }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#c8c8c8' }}>Status</label>
              <div className="flex gap-1.5">
                {VERDICTS.map(v => {
                  const active = filters.verdicts.includes(v)
                  return (
                    <button key={v} onClick={() => set('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                      className="text-xs px-3 py-2 rounded-xl border transition-all font-medium"
                      style={active
                        ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                        : { color: '#fff', borderColor: 'rgba(255,255,255,0.07)' }}>
                      {VERDICT_LABEL[v]}
                    </button>
                  )
                })}
              </div>
            </div>

            {hasFilters && (
              <button onClick={() => { setFilters({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' }); setActiveRange(null); setTicketSearch(''); setSelectedDay(null) }}
                className="text-xs px-3 py-2 rounded-xl self-end transition-colors"
                style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => { e.currentTarget.style.color='#ef4444'; e.currentTarget.style.borderColor='rgba(239,68,68,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {dataLoading && scoreHistory.length === 0 ? (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div className="grid px-4 py-3" style={{
              gridTemplateColumns: '100px 1fr 120px 80px 90px 80px',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#c8c8c8',
            }}>
              <span>Ticket</span><span>Subject</span><span className="text-center">Agents</span>
              <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
            </div>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: '100px 1fr 120px 80px 90px 80px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
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
          <div className="text-center py-16" style={{ color: '#555' }}>
            <p className="text-sm">{total === 0 ? 'No tickets scored yet.' : 'No tickets match your filters.'}</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div className="grid px-4 py-3" style={{
              gridTemplateColumns: '100px 1fr 120px 80px 90px 80px',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#c8c8c8',
            }}>
              <span>Ticket</span><span>Subject</span><span className="text-center">Agents</span>
              <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
            </div>

            {filteredScores.slice(0, visibleCount).map(s => (
              <div key={s.id} className="grid items-center px-4 py-3 transition-colors"
                style={{ gridTemplateColumns: '100px 1fr 120px 80px 90px 80px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e1e20'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs" style={{ color: '#FF9780' }}
                  onMouseEnter={e => e.target.style.textDecoration='underline'}
                  onMouseLeave={e => e.target.style.textDecoration='none'}>
                  #{s.ticketId}
                </a>

                <button onClick={() => openPanel({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                  className="text-sm text-left truncate pr-3 transition-colors"
                  style={{ color: '#e8e8e8' }}
                  onMouseEnter={e => e.target.style.color='#fff'}
                  onMouseLeave={e => e.target.style.color='#e8e8e8'}>
                  {s.fullScore?.ticket_subject || '—'}
                </button>

                <div className="flex flex-wrap gap-1 justify-center">
                  {s.agentIds?.length > 0
                    ? s.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
                        style={{ background: '#1a1a1a', color: '#c8c8c8' }}>{name}</span>
                    ))
                    : <span style={{ color: '#888' }}>—</span>}
                </div>

                <span className="text-sm tabular-nums text-right" style={{ color: '#e8e8e8' }}>
                  {s.effectiveScore?.toFixed(0)}/100
                  {s.overrideVerdict && <span className="text-xs ml-0.5" style={{ color: '#818cf8' }}>*</span>}
                </span>

                <div className="flex justify-center">
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[s.effectiveVerdict], flexShrink: 0, opacity: 0.8 }} />
                    <span className="text-xs font-medium" style={{ color: '#c8c8c8', letterSpacing: '0.04em' }}>
                      {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
                    </span>
                  </span>
                </div>

                <span className="text-xs text-right" style={{ color: '#c8c8c8' }}>
                  {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}

            {visibleCount < filteredScores.length && (
              <div className="flex items-center justify-center px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.10)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
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
