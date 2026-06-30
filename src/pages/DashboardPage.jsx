import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import DatePicker from '../components/DatePicker'
import Dropdown from '../components/Dropdown'
import Segmented from '../components/Segmented'
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
const svg = (children) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>{children}</svg>
const STAT_ICONS = {
  total:  svg(<><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>),
  avg:    svg(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>),
  pass:   svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>),
  review: svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
}

function StatCard({ label, value, format, sub, color, icon, onClick, spark }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const display  = value == null ? '—' : format ? format(animated) : Math.round(animated)
  const [hovered, setHovered] = useState(false)
  const accent = color || '#1A1E23'
  const clickable = !!onClick
  const trend = spark && spark.length > 1
    ? (spark[spark.length - 1] > spark[0] + 1 ? ' · trending up' : spark[spark.length - 1] < spark[0] - 1 ? ' · trending down' : ' · steady')
    : ''
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
      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl shrink-0" style={{ color: color || '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, lineHeight: 1 }}>{display}</p>
        {spark && spark.length > 1 && (() => {
          const n = spark.length
          const lo = Math.min(...spark), hi = Math.max(...spark), range = (hi - lo) || 1
          const x = (i) => 3 + (i / (n - 1)) * 90
          const y = (v) => 31 - ((v - lo) / range) * 28
          const last = spark[n - 1]
          return (
            <svg width="96" height="34" viewBox="0 0 96 34" className="shrink-0 mb-0.5" style={{ overflow: 'visible' }}>
              <polyline fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                points={spark.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
              <circle cx={x(n - 1).toFixed(1)} cy={y(last).toFixed(1)} r="3" fill={accent} />
            </svg>
          )
        })()}
      </div>
      {sub && (
        <p className="text-xs mt-1" style={{ color: clickable && hovered ? '#B84A2E' : 'rgba(26,30,35,.5)', transition: 'color 150ms' }}>
          {sub}{trend}{clickable && <span style={{ marginLeft: 4, opacity: hovered ? 1 : 0, transition: 'opacity 150ms' }}>→</span>}
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

      <div className="flex gap-3 overflow-visible">
        {days.map((d, i) => {
          const isSelected = selectedDay === d.dateStr
          const isHovered  = hoveredBar === i && d.count > 0
          const isDimmed   = hasSelection && !isSelected
          // Shorter bars get a lighter coral; the busiest day is full-strength coral
          const intensity  = 0.5 + 0.5 * (d.count / maxCount)
          const barBg      = d.count === 0 ? '#F0ECE9'
                           : isSelected     ? '#B84A2E'
                           : isHovered       ? '#FF9780'
                           : `rgba(255,151,128,${intensity.toFixed(2)})`
          const barH       = d.count === 0 ? 6 : Math.max((d.count / maxCount) * 120, 46)
          return (
            <div key={i}
              className="flex-1 flex flex-col items-center gap-2"
              style={{ cursor: d.count > 0 ? 'pointer' : 'default', opacity: isDimmed ? 0.4 : 1, transition: 'opacity 200ms' }}
              onClick={() => d.count > 0 && onDayClick(d.dateStr)}
              onMouseEnter={() => setHoveredBar(i)}
              onMouseLeave={() => setHoveredBar(null)}
              title={d.count > 0 ? `${d.count} ticket${d.count !== 1 ? 's' : ''} on ${d.label}` : undefined}>
              {/* Fixed-height track so every bar shares one baseline */}
              <div className="relative w-full flex items-end justify-center" style={{ height: 130 }}>
                <div className="relative w-full" style={{
                  height: barH, background: barBg,
                  borderTopLeftRadius: 10, borderTopRightRadius: 10,
                  borderBottomLeftRadius: d.count === 0 ? 10 : 0, borderBottomRightRadius: d.count === 0 ? 10 : 0,
                  transition: 'background 150ms, height 200ms',
                }}>
                  {d.count > 0 && (
                    <span className="absolute left-0 right-0 text-center tabular-nums"
                      style={{ top: 8, color: isSelected ? '#FFFFFF' : '#1A1E23', fontWeight: 700, fontSize: 13 }}>
                      {d.count}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm" style={{ color: isSelected ? '#1A1E23' : 'rgba(26,30,35,.55)', fontWeight: isSelected ? 600 : 400, transition: 'color 150ms' }}>{d.label}</span>
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

// Full-width average-score area chart with a pass-threshold reference line
// Average score grouped into month or week buckets, oldest → newest (last `limit`)
function bucketAverages(scores, granularity, limit = 12) {
  const map = new Map()
  for (const s of scores) {
    const v = s.effectiveScore
    if (v == null) continue
    const d = new Date(s.scoredAt)
    let key, label
    if (granularity === 'monthly') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      label = d.toLocaleDateString('en-US', { month: 'short' })
    } else {
      const w = new Date(d); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); w.setHours(0, 0, 0, 0)
      key = w.toISOString().slice(0, 10)
      label = w.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    if (!map.has(key)) map.set(key, { key, label, sum: 0, n: 0 })
    const b = map.get(key); b.sum += v; b.n++
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-limit)
    .map(b => ({ label: b.label, avg: b.sum / b.n }))
}

function AvgTrendChart({ scores, passLine = 80 }) {
  const [gran, setGran] = useState('monthly')
  const pts = useMemo(() => bucketAverages(scores, gran), [scores, gran])
  const card = { background: '#fff', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }
  const toggle = (
    <Segmented options={[{ id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }]}
      value={gran} onChange={setGran} segWidth={84} fontPx={13} padY={6} />
  )

  if (pts.length < 2) return (
    <div className="p-5 mb-6" style={card}>
      <div className="flex items-center justify-between mb-3"><p className="g-label" style={{ margin: 0 }}>Average score over time</p>{toggle}</div>
      <p className="text-xs text-center py-10" style={{ color: 'rgba(26,30,35,.45)' }}>Not enough data yet — need scores across 2+ {gran === 'monthly' ? 'months' : 'weeks'}.</p>
    </div>
  )

  const W = 900, H = 210, padL = 34, padR = 16, padTop = 16, padBot = 30
  const vals = pts.map(p => p.avg)
  const lo = Math.max(0, Math.floor((Math.min(...vals, passLine) - 6) / 10) * 10)
  let hi = Math.min(100, Math.ceil((Math.max(...vals, passLine) + 6) / 10) * 10)
  if (hi - lo < 20) hi = Math.min(100, lo + 20)
  const x = (i) => padL + (pts.length === 1 ? 0.5 : i / (pts.length - 1)) * (W - padL - padR)
  const y = (v) => padTop + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - padTop - padBot)
  const coords = pts.map((p, i) => ({ x: x(i), y: y(p.avg) }))
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${H - padBot} L${coords[0].x.toFixed(1)},${H - padBot} Z`
  const step = (hi - lo) / 2 >= 30 ? 20 : 10
  const ticks = []; for (let v = lo; v <= hi; v += step) ticks.push(v)
  const current = pts[pts.length - 1].avg
  const delta = current - pts[pts.length - 2].avg
  const dir = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'steady'
  const trendColor = dir === 'down' ? '#D14B3D' : dir === 'up' ? '#2F8F5B' : 'rgba(26,30,35,.5)'

  return (
    <div className="p-5 mb-6" style={card}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="g-label" style={{ margin: 0 }}>Average score over time</p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: trendColor }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {dir === 'down'
                ? <><polyline points="3 7 9 13 13 9 21 17"/><polyline points="21 12 21 17 16 17"/></>
                : <><polyline points="3 17 9 11 13 15 21 7"/><polyline points="21 12 21 7 16 7"/></>}
            </svg>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)} {gran === 'monthly' ? 'this month' : 'this week'}
          </span>
        </div>
        {toggle}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="avgtrend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF9780" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FF9780" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map(v => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#F0ECE9" strokeWidth="1" />
            <text x={padL - 8} y={y(v)} dominantBaseline="central" textAnchor="end" style={{ fontSize: 11, fill: 'rgba(26,30,35,.4)' }}>{v}</text>
          </g>
        ))}
        <line x1={padL} y1={y(passLine)} x2={W - padR} y2={y(passLine)} stroke="#C8841E" strokeWidth="1" strokeDasharray="5 5" opacity="0.7" />
        <path d={area} fill="url(#avgtrend-fill)" />
        <path d={line} fill="none" stroke="#FF9780" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => {
          const last = i === coords.length - 1
          return <circle key={i} cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={last ? 4 : 3} fill={last ? '#FF9780' : '#fff'} stroke="#FF9780" strokeWidth="2" />
        })}
        {pts.map((p, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'rgba(26,30,35,.5)' }}>{p.label}</text>)}
      </svg>
      <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'rgba(26,30,35,.5)' }}>
        <span style={{ width: 16, borderTop: '1px dashed #C8841E', display: 'inline-block' }} />
        Pass threshold reference ({passLine}) · current average {current.toFixed(1)}, trending {dir}
      </p>
    </div>
  )
}

export default function DashboardPage() {
  const { scoreHistory, agents, teams, rubric } = useApp()
  const { role, profile } = useAuth()

  // myAgentId from context — used only for display; scoreHistory is already scoped
  const { myAgentId, dataLoading, openScore } = useApp()
  const [filters,      setFilters]      = useState({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })
  const [activeRange,  setActiveRange]  = useState(null) // '7d' | '30d' | '90d'
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedDay,  setSelectedDay]  = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE) // progressive "Show more" reveal
  const tableRef = useRef(null)

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
  const vt = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  const avgSpark = useMemo(() => buildTrendData(filteredScores, 14).map(p => p.avg), [filteredScores])

  return (
    <div className="panel-push">
    <div className="max-w-5xl mx-auto px-8 pt-8 pb-14">

      {/* Header */}
      <div className="mb-8">
        <h1 style={{ fontSize: 30, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>{role === 'agent' ? 'My Performance' : 'Dashboard'}</h1>
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
          { label: 'Average Score', value: avg != null ? parseFloat(avg) : null, format: n => n.toFixed(1), sub: 'out of 100', color: '#C8841E', icon: STAT_ICONS.avg, spark: avgSpark },
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
            const DIST = { PASS: '#3B7DD8', NEEDS_REVIEW: '#C8841E', FAIL: '#D14B3D' }
            const NAME = { PASS: 'Pass', NEEDS_REVIEW: 'Review', FAIL: 'Fail' }
            const vt = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
            const range = { PASS: `≥${vt.pass}`, NEEDS_REVIEW: `${vt.needs_review}–${vt.pass - 1}`, FAIL: `<${vt.needs_review}` }
            const rows = [['PASS', pass], ['NEEDS_REVIEW', review], ['FAIL', fail]]
            const C = 2 * Math.PI * 42
            const passRate = Math.round((pass / total) * 100)
            const labelStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(26,30,35,.45)' }
            let acc = 0
            // Continuous ring — segments meet flush (no gaps)
            const segs = rows.filter(([, n]) => n > 0).map(([v, n]) => {
              const frac = n / total
              const seg = (
                <circle key={v} cx="50" cy="50" r="42" fill="none" stroke={DIST[v]} strokeWidth="12"
                  strokeDasharray={`${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`}
                  strokeDashoffset={(-(acc * C)).toFixed(2)} />
              )
              acc += frac
              return seg
            })
            return (
              <div className="flex items-center gap-6">
                {/* Donut — pass rate in the center */}
                <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
                  <svg width="150" height="150" viewBox="0 0 100 100">
                    <g transform="rotate(-90 50 50)">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#F0ECE9" strokeWidth="12" />
                      {segs}
                    </g>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="tabular-nums" style={{ fontSize: 30, color: '#1A1E23', lineHeight: 1, fontFamily: "'Inter Tight', sans-serif", fontWeight: 600 }}>{passRate}%</span>
                    <span className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.5)' }}>pass rate</span>
                  </div>
                </div>
                {/* Legend — labelled columns with hairline dividers */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-4 pb-2" style={{ borderBottom: '1px solid #F0ECE9' }}>
                    <span className="flex-1" />
                    <span className="w-14 text-right" style={labelStyle}>Tickets</span>
                    <span className="w-12 text-right" style={labelStyle}>Share</span>
                  </div>
                  {rows.map(([v, n], idx) => {
                    const pct = total > 0 ? Math.round((n / total) * 100) : 0
                    return (
                      <div key={v} className="flex items-center gap-4 py-2.5"
                        style={{ borderBottom: idx < rows.length - 1 ? '1px solid #F0ECE9' : 'none' }}
                        title={`${VERDICT_DESC[v]} · score ${range[v]}`}>
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: DIST[v], flexShrink: 0 }} />
                          <span className="font-semibold" style={{ fontSize: 15, color: DIST[v] }}>{NAME[v]}</span>
                        </div>
                        <span className="w-14 text-right tabular-nums font-bold" style={{ fontSize: 15, color: '#1A1E23' }}>{n}</span>
                        <span className="w-12 text-right tabular-nums" style={{ fontSize: 14, color: 'rgba(26,30,35,.55)' }}>{pct}%</span>
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

      {/* Full-width average-score trend */}
      <AvgTrendChart scores={filteredScores} passLine={vt.pass} />

      {/* ── Ticket table with filters ── */}
      <div ref={tableRef}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 20, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600 }}>{role === 'agent' ? 'My Tickets' : 'All tickets'}</h2>
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
                <Dropdown value={filters.agent} onChange={v => set('agent', v)} width={170} avatars
                  options={[{ value: '', label: 'All agents' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} />
              </div>
            )}

            {role !== 'agent' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Team</label>
                <Dropdown value={filters.team} onChange={v => set('team', v)} width={170}
                  options={[{ value: '', label: 'All teams' }, ...teams.map(t => ({ value: t.id, label: t.name }))]} />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>From</label>
              <DatePicker value={filters.dateFrom} onChange={v => { set('dateFrom', v); setActiveRange(null) }} width={150} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>To</label>
              <DatePicker value={filters.dateTo} onChange={v => { set('dateTo', v); setActiveRange(null) }} width={150} />
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

                <button onClick={() => openScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
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
    </div>
    </div>
  )
}
