import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { gorgiasTicketUrl } from '../lib/gorgias'

const VERDICT_COLOR = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG    = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const VERDICTS      = ['PASS', 'NEEDS_REVIEW', 'FAIL']

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
        borderTop: `2px solid ${color || 'rgba(255,255,255,0.15)'}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,${hovered ? '0.10' : '0.07'})`,
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
      }}>
      <p className="g-label mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color: color || '#fff' }}>{display}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#666' }}>{sub}</p>}
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


function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
      </div>
      <span className="text-xs tabular-nums w-6 text-right" style={{ color: '#777' }}>{value}</span>
    </div>
  )
}

function ScoreTrend({ scores }) {
  const days = useMemo(() => {
    const result = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      const start = new Date(d.setHours(0, 0, 0, 0)).getTime()
      const end   = start + 86400000
      const day   = scores.filter(s => s.scoredAt >= start && s.scoredAt < end)
      result.push({ label, count: day.length })
    }
    return result
  }, [scores])

  const maxCount = Math.max(...days.map(d => d.count), 1)

  return (
    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(180deg, #222 0%, #1e1e1e 100%)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
      <p className="g-label mb-4">Tickets scored — last 7 days</p>
      <div className="flex items-end gap-2 h-20 overflow-visible">
        {days.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="relative w-full">
              {d.count > 0 && (d.count / maxCount) <= 0.5 && (
                <span className="absolute -top-5 left-0 right-0 text-center text-xs font-semibold tabular-nums"
                  style={{ color: '#FF9780' }}>
                  {d.count}
                </span>
              )}
              <div className="relative w-full rounded-t-sm transition-all"
                style={{ height: `${Math.max((d.count / maxCount) * 64, d.count > 0 ? 6 : 0)}px`, background: d.count > 0 ? '#FF9780' : '#1e1e1e' }}>
                {d.count > 0 && (d.count / maxCount) > 0.5 && (
                  <span className="absolute top-1 left-0 right-0 text-center text-xs font-semibold tabular-nums"
                    style={{ color: 'rgba(0,0,0,0.6)' }}>
                    {d.count}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs" style={{ color: '#666' }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const selectStyle = {
  background: '#0f0f0f',
  border: '1px solid rgba(255,255,255,0.07)',
  color: '#ccc',
  outline: 'none',
}

export default function DashboardPage() {
  const { scoreHistory, agents, teams } = useApp()
  const { role, profile } = useAuth()

  // myAgentId from context — used only for display; scoreHistory is already scoped
  const { myAgentId } = useApp()
  const [panelScore, setPanelScore] = useState(null)
  const [filters,      setFilters]      = useState({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })
  const [activeRange,  setActiveRange]  = useState(null) // '7d' | '30d' | '90d'
  const [ticketSearch, setTicketSearch] = useState('')

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
    <div style={{ paddingRight: panelScore ? 560 : 0, transition: 'padding-right 300ms cubic-bezier(0.16,1,0.3,1)' }}>
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
          <p className="g-label mb-4">Score distribution</p>
          {total === 0 ? <p className="text-xs" style={{ color: '#555' }}>No tickets scored yet</p> : (
            <div className="flex flex-col gap-3">
              {[['PASS', pass], ['NEEDS_REVIEW', review], ['FAIL', fail]].map(([v, n]) => (
                <div key={v}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ color: VERDICT_COLOR[v], background: VERDICT_BG[v] }}>{VERDICT_LABEL[v]}</span>
                    <span className="text-xs" style={{ color: '#777' }}>{total > 0 ? Math.round((n/total)*100) : 0}%</span>
                  </div>
                  <MiniBar value={n} max={total} color={VERDICT_COLOR[v]} />
                </div>
              ))}
            </div>
          )}
        </div>
        <ScoreTrend scores={filteredScores} />
      </div>

      {/* ── Ticket table with filters ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">{role === 'agent' ? 'My Tickets' : 'All Tickets'}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: '#666' }}>{filteredScores.length} / {total}</span>
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
                style={{ color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
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
                background: '#111',
                border: `1px solid ${ticketSearch ? 'rgba(255,151,128,0.4)' : 'rgba(255,255,255,0.07)'}`,
                color: '#ccc',
                boxShadow: ticketSearch ? '0 0 0 3px rgba(255,151,128,0.06)' : 'none',
              }}
            />
            {ticketSearch && (
              <button onClick={() => setTicketSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-sm transition-colors"
                style={{ color: '#666', background: 'rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.color='#666'; e.currentTarget.style.background='rgba(255,255,255,0.06)' }}>
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
                <label className="text-xs" style={{ color: '#777' }}>Agent</label>
                <select value={filters.agent} onChange={e => set('agent', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">All agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            {role !== 'agent' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-xs" style={{ color: '#777' }}>Team</label>
                <select value={filters.team} onChange={e => set('team', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">All teams</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#777' }}>From</label>
              <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#777' }}>To</label>
              <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#777' }}>Quick range</label>
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
                        : { color: '#777', borderColor: 'rgba(255,255,255,0.07)', background: 'transparent' }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color='#ccc'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color='#777'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' } }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#777' }}>Status</label>
              <div className="flex gap-1.5">
                {VERDICTS.map(v => {
                  const active = filters.verdicts.includes(v)
                  return (
                    <button key={v} onClick={() => set('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                      className="text-xs px-3 py-2 rounded-xl border transition-all font-medium"
                      style={active
                        ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                        : { color: '#777', borderColor: 'rgba(255,255,255,0.07)' }}>
                      {VERDICT_LABEL[v]}
                    </button>
                  )
                })}
              </div>
            </div>

            {hasFilters && (
              <button onClick={() => { setFilters({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' }); setActiveRange(null); setTicketSearch('') }}
                className="text-xs px-3 py-2 rounded-xl self-end transition-colors"
                style={{ color: '#777', border: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => { e.currentTarget.style.color='#ef4444'; e.currentTarget.style.borderColor='rgba(239,68,68,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color='#555'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {filteredScores.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#555' }}>
            <p className="text-sm">{total === 0 ? 'No tickets scored yet.' : 'No tickets match your filters.'}</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
            <div className="grid px-4 py-3" style={{
              gridTemplateColumns: '100px 1fr 150px 80px 90px 80px',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#777',
            }}>
              <span>Ticket</span><span>Subject</span><span>Agents</span>
              <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
            </div>

            {filteredScores.map(s => (
              <div key={s.id} className="grid items-center px-4 py-3 transition-colors"
                style={{ gridTemplateColumns: '100px 1fr 150px 80px 90px 80px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs" style={{ color: '#FF9780' }}
                  onMouseEnter={e => e.target.style.textDecoration='underline'}
                  onMouseLeave={e => e.target.style.textDecoration='none'}>
                  #{s.ticketId}
                </a>

                <button onClick={() => setPanelScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                  className="text-sm text-left truncate pr-3 transition-colors"
                  style={{ color: '#ccc' }}
                  onMouseEnter={e => e.target.style.color='#fff'}
                  onMouseLeave={e => e.target.style.color='#ccc'}>
                  {s.fullScore?.ticket_subject || '—'}
                </button>

                <div className="flex flex-wrap gap-1 pr-2">
                  {s.agentIds?.length > 0
                    ? s.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-[130px]"
                        style={{ background: '#1a1a1a', color: '#888' }}>{name}</span>
                    ))
                    : <span style={{ color: '#555' }}>—</span>}
                </div>

                <span className="text-sm tabular-nums text-right" style={{ color: '#999' }}>
                  {s.effectiveScore?.toFixed(0)}/100
                  {s.overrideVerdict && <span className="text-xs ml-0.5" style={{ color: '#818cf8' }}>*</span>}
                </span>

                <div className="flex justify-center">
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[s.effectiveVerdict], flexShrink: 0, opacity: 0.8 }} />
                    <span className="text-xs font-medium" style={{ color: '#888', letterSpacing: '0.04em' }}>
                      {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
                    </span>
                  </span>
                </div>

                <span className="text-xs text-right" style={{ color: '#666' }}>
                  {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {panelScore && <ScoreModal score={panelScore} onClose={() => setPanelScore(null)} panel />}
    </div>
    </div>
  )
}
