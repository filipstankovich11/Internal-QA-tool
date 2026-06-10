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
        background: '#0f0f0f',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.06)'}`,
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 150ms ease, border-color 150ms ease',
      }}>
      <p className="text-xs mb-2" style={{ color: '#777' }}>{label}</p>
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

function TeamSparkline({ scores }) {
  const pts = buildTrendData(scores, 30)
  if (pts.length < 2) return <span className="text-xs" style={{ color: '#555' }}>—</span>

  const W = 80, H = 24, pad = 2
  const vals = pts.map(p => p.avg)
  const minV = Math.min(...vals), maxV = Math.max(...vals)
  const range = maxV - minV || 10
  const x = d => pad + (d / 29) * (W - pad * 2)
  const y = v => H - pad - ((v - minV) / range) * (H - pad * 2)
  const d = pts.map(({ day, avg }, i) => `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(avg).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1], first = pts[0]
  const color = last.avg > first.avg + 3 ? '#10b981' : last.avg < first.avg - 3 ? '#ef4444' : '#888'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
        pathLength="1" strokeDasharray="1" strokeDashoffset="1"
        style={{ animation: 'drawLine 0.7s cubic-bezier(0.16,1,0.3,1) forwards' }} />
      <circle cx={x(last.day).toFixed(1)} cy={y(last.avg).toFixed(1)} r="2" fill={color} />
    </svg>
  )
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e1e1e' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
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
    <div className="rounded-2xl p-5" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs mb-4" style={{ color: '#777' }}>Tickets scored — last 7 days</p>
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
  const { role, profile, user } = useAuth()

  // For agents: resolve their own agent record so we can filter by agent ID
  const myAgentId = useMemo(
    () => role === 'agent' ? agents.find(a => a.user_id === user?.id)?.id ?? null : null,
    [role, agents, user]
  )
  const [activeScore, setActiveScore] = useState(null)
  const [filters, setFilters] = useState({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })

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

  const filteredScores = useMemo(() => scoreHistory.filter(s => {
    // Agents only ever see their own tickets
    if (myAgentId && !s.agentIds?.includes(myAgentId)) return false
    if (filters.agent && !s.agentIds?.includes(filters.agent)) return false
    if (filters.team  && !s.agentIds?.some(id => teamAgentMap[filters.team]?.has(id))) return false
    if (filters.verdicts.length && !filters.verdicts.includes(s.effectiveVerdict)) return false
    if (filters.dateFrom && s.scoredAt < new Date(filters.dateFrom).setHours(0,0,0,0)) return false
    if (filters.dateTo   && s.scoredAt > new Date(filters.dateTo).setHours(23,59,59,999)) return false
    return true
  }), [scoreHistory, filters, teamAgentMap, myAgentId])

  const hasFilters = (role !== 'agent' && (filters.agent || filters.team)) || filters.verdicts.length || filters.dateFrom || filters.dateTo

  // All stats use effective values (override when present, AI otherwise)
  const total    = filteredScores.length
  const pass     = filteredScores.filter(s => s.effectiveVerdict === 'PASS').length
  const review   = filteredScores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
  const fail     = filteredScores.filter(s => s.effectiveVerdict === 'FAIL').length
  const avg      = total ? (filteredScores.reduce((s, x) => s + x.effectiveScore, 0) / total).toFixed(1) : null
  const passRate = total ? Math.round((pass / total) * 100) : null
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0,0,0,0)
  const thisWeek  = filteredScores.filter(s => s.scoredAt >= weekStart.getTime()).length

  const leaderboard = useMemo(() => {
    const agentScoreMap = {}
    filteredScores.forEach(s => {
      s.agentIds?.forEach(id => {
        if (!agentScoreMap[id]) agentScoreMap[id] = []
        agentScoreMap[id].push(s)
      })
    })
    return agents
      .filter(a => agentScoreMap[a.id]?.length)
      .map(a => {
        const s = agentScoreMap[a.id]
        return { ...a, count: s.length, avg: s.reduce((acc, x) => acc + x.effectiveScore, 0) / s.length }
      })
      .sort((a, b) => b.avg - a.avg)
  }, [agents, filteredScores])

  return (
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
        <div className="rounded-2xl p-5" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-4" style={{ color: '#777' }}>Score distribution</p>
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

      {/* Agent leaderboard — hidden for agents */}
      {role !== 'agent' && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs" style={{ color: '#777' }}>Agent leaderboard</p>
            {agents.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#161616', color: leaderboard.length === agents.length ? '#10b981' : '#555' }}>
                {leaderboard.length}/{agents.length} agents reviewed
              </span>
            )}
          </div>
          {leaderboard.length === 0 ? <p className="text-xs" style={{ color: '#555' }}>No agent scores yet</p> : (
            <div className="flex flex-col gap-1">
              {leaderboard.slice(0, 8).map((a, i) => (
                <div key={a.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg stagger-item"
                  style={{ '--i': i, background: i === 0 ? 'rgba(255,151,128,0.04)' : 'transparent' }}>
                  <span className="text-xs w-4 shrink-0 tabular-nums" style={{ color: '#666' }}>{i + 1}</span>
                  <span className="text-sm text-white flex-1 truncate">{a.name}</span>
                  <span className="text-xs" style={{ color: '#777' }}>{a.count} ticket{a.count !== 1 ? 's' : ''}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: avgColor(a.avg) }}>{a.avg.toFixed(1)}</span>
                </div>
              ))}
              {(() => {
                const reviewedIds = new Set(leaderboard.map(a => a.id))
                const unreviewed = agents.filter(a => !reviewedIds.has(a.id))
                if (!unreviewed.length) return null
                return (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <p className="text-xs mb-1.5 px-2" style={{ color: '#555' }}>Not reviewed in this period</p>
                    <div className="flex flex-wrap gap-1.5 px-2">
                      {unreviewed.map(a => (
                        <span key={a.id} className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#111', color: '#666', border: '1px solid rgba(255,255,255,0.05)' }}>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Team leaderboard — hidden for agents */}
      {role !== 'agent' && teams.length > 0 && (() => {
        const teamStats = teams.map(t => {
          const agentIds = new Set(agents.filter(a => a.team_id === t.id).map(a => a.id))
          const scores   = filteredScores.filter(s => s.agentIds?.some(id => agentIds.has(id)))
          const avg      = scores.length ? scores.reduce((s, x) => s + x.effectiveScore, 0) / scores.length : null
          return { ...t, scores, avg, agentCount: agentIds.size }
        }).filter(t => t.scores.length > 0).sort((a, b) => b.avg - a.avg)

        if (!teamStats.length) return null
        return (
          <div className="rounded-2xl p-5 mb-6" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs mb-4" style={{ color: '#777' }}>Team performance — 30-day trend</p>
            <div className="flex flex-col gap-1">
              {teamStats.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 py-2 px-2 rounded-lg stagger-item"
                  style={{ '--i': i, background: i === 0 ? 'rgba(255,151,128,0.04)' : 'transparent' }}>
                  <span className="text-xs w-4 shrink-0 tabular-nums" style={{ color: '#666' }}>{i + 1}</span>
                  <span className="text-sm text-white flex-1 truncate">{t.name}</span>
                  <span className="text-xs shrink-0" style={{ color: '#777' }}>{t.agentCount} agent{t.agentCount !== 1 ? 's' : ''}</span>
                  <span className="text-xs shrink-0" style={{ color: '#777' }}>{t.scores.length} ticket{t.scores.length !== 1 ? 's' : ''}</span>
                  <TeamSparkline scores={t.scores} />
                  <span className="text-sm font-bold tabular-nums w-12 text-right shrink-0" style={{ color: avgColor(t.avg) }}>
                    {t.avg.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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

        {/* Filters */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                {[['7d', 7], ['30d', 30], ['90d', 90]].map(([label, days]) => (
                  <button key={label} onClick={() => {
                    const to   = new Date()
                    const from = new Date()
                    from.setDate(from.getDate() - days)
                    setFilters(f => ({ ...f, dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) }))
                  }}
                    className="text-xs px-3 py-2 rounded-xl border transition-all"
                    style={{ color: '#777', borderColor: 'rgba(255,255,255,0.07)' }}
                    onMouseEnter={e => { e.currentTarget.style.color='#ccc'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.color='#555'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)' }}>
                    {label}
                  </button>
                ))}
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
              <button onClick={() => setFilters({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })}
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
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="grid text-xs px-4 py-2.5" style={{
              gridTemplateColumns: '100px 1fr 150px 80px 90px 80px',
              background: '#0a0a0a', color: '#666', borderBottom: '1px solid rgba(255,255,255,0.05)'
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

                <button onClick={() => setActiveScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
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

                <span className="text-sm font-bold tabular-nums text-right"
                  style={{ color: avgColor(s.effectiveScore) }}>
                  {s.effectiveScore?.toFixed(0)}/100
                  {s.overrideVerdict && <span className="text-xs font-normal ml-0.5" style={{ color: '#818cf8' }}>*</span>}
                </span>

                <div className="flex justify-center">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ color: VERDICT_COLOR[s.effectiveVerdict], background: VERDICT_BG[s.effectiveVerdict] }}>
                    {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
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

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
