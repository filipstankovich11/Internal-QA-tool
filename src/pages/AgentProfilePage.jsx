import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import ScoreBreakdownHover from '../components/ScoreBreakdownHover'
import { useToast } from '../components/Toast'
import { gorgiasTicketUrl } from '../lib/gorgias'

// ── colour helpers ────────────────────────────────────────────────────────────
const scoreColor  = v => v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'
const dimColor    = v => v >= 4  ? '#10b981' : v >= 3  ? '#f59e0b' : '#ef4444'

const VERDICT_COLOR = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG    = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }

// ── trend chart ───────────────────────────────────────────────────────────────
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

function TrendChart({ scores }) {
  const pts = buildTrendData(scores, 30)
  if (pts.length < 2) return (
    <p className="text-xs text-center py-6" style={{ color: '#555' }}>
      Not enough data yet — need scores across 2+ days
    </p>
  )

  const W = 400, H = 80, padX = 8, padY = 6
  const vals = pts.map(p => p.avg)
  const minV = Math.max(0,   Math.min(...vals) - 5)
  const maxV = Math.min(100, Math.max(...vals) + 5)
  const range = maxV - minV || 10
  const x = day => padX + (day / 29) * (W - padX * 2)
  const y = v   => H - padY - ((v - minV) / range) * (H - padY * 2)

  const first = pts[0], last = pts[pts.length - 1]
  const line  = pts.map(({ day, avg }, i) => `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(avg).toFixed(1)}`).join(' ')
  const area  = `${line} L${x(last.day).toFixed(1)},${H} L${x(first.day).toFixed(1)},${H} Z`
  const color = last.avg > first.avg + 3 ? '#10b981' : last.avg < first.avg - 3 ? '#ef4444' : '#888'

  return (
    <div className="w-full">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 200 }}>
        <path d={area} fill={color} opacity="0.04" />
        <path d={line}  fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        {pts.map(({ day, avg }) => (
          <circle key={day} cx={x(day).toFixed(1)} cy={y(avg).toFixed(1)} r="2.5" fill={color} opacity="0.9" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: '#555' }}>30 days ago</span>
        <span className="text-xs" style={{ color: '#555' }}>Today</span>
      </div>
    </div>
  )
}

// ── dimension bar ─────────────────────────────────────────────────────────────
function DimBar({ label, weight, avg }) {
  const n = Number(avg)
  if (!isFinite(n)) return null
  const pct   = (n / 5) * 100
  const color = dimColor(n)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: '#ccc' }}>{label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: '#777', background: '#161616' }}>{weight}</span>
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{n.toFixed(1)}<span className="text-xs font-normal ml-0.5" style={{ color: '#666' }}>/5</span></span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: '#1e1e1e' }}>
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

// ── score row in history ──────────────────────────────────────────────────────
function ScoreRow({ s, onView, onAcknowledge }) {
  const [acking, setAcking] = useState(false)

  const handleAck = async (e) => {
    e.stopPropagation()
    setAcking(true)
    await onAcknowledge(s.id)
    setAcking(false)
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      onClick={() => onView(s)}
      onMouseEnter={e => e.currentTarget.style.background = '#1e1e20'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Unread dot */}
      <div className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: s.acknowledged ? 'transparent' : '#FF9780' }} />

      {/* Ticket ID */}
      <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
        className="font-mono text-xs shrink-0 w-20"
        style={{ color: '#FF9780' }}
        onClick={e => e.stopPropagation()}
        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
        onMouseLeave={e => e.target.style.textDecoration = 'none'}>
        #{s.ticketId}
      </a>

      {/* Subject */}
      <span className="text-sm flex-1 truncate" style={{ color: '#ccc' }}>
        {s.fullScore?.ticket_subject || '—'}
      </span>

      {/* Status indicators */}
      <div className="flex items-center gap-2 shrink-0">
        {s.disputed && (
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }}>
            Disputed
          </span>
        )}
        {!s.acknowledged && (
          <button
            onClick={handleAck}
            disabled={acking}
            className="text-xs px-2.5 py-1 rounded-lg transition-colors shrink-0"
            style={{ color: '#888', border: '1px solid rgba(255,255,255,0.1)', opacity: acking ? 0.5 : 1 }}
            onMouseEnter={e => { if (!acking) e.currentTarget.style.color = '#10b981' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888' }}>
            {acking ? '…' : 'Mark seen'}
          </button>
        )}
        {s.acknowledged && (
          <span className="text-xs" style={{ color: '#555' }}>✓</span>
        )}
      </div>

      {/* Score */}
      <ScoreBreakdownHover scores={s.fullScore?.scores} align="right">
        <span className="text-sm font-bold tabular-nums w-16 text-right shrink-0 cursor-default"
          style={{ color: scoreColor(s.effectiveScore) }}>
          {s.effectiveScore?.toFixed(0)}/100
          {s.overrideVerdict && <span className="text-xs font-normal ml-0.5" style={{ color: '#818cf8' }}>*</span>}
        </span>
      </ScoreBreakdownHover>

      {/* Verdict */}
      <span className="text-xs font-medium px-2 py-0.5 rounded-full w-16 text-center shrink-0"
        style={{ color: VERDICT_COLOR[s.effectiveVerdict], background: VERDICT_BG[s.effectiveVerdict] }}>
        {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
      </span>

      {/* Date */}
      <span className="text-xs shrink-0 hidden sm:block" style={{ color: '#666' }}>
        {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function AgentProfilePage() {
  const { agents, teams, scoreHistory, acknowledgeScore } = useApp()
  const { profile, user } = useAuth()
  const toast = useToast()

  const [activeScore, setActiveScore] = useState(null)

  const agent  = agents.find(a => a.user_id === user?.id) ?? null
  const team   = teams.find(t => t.id === agent?.team_id)
  const scores = agent ? scoreHistory.filter(s => s.agentIds?.includes(agent.id)) : []

  const sorted = useMemo(() => [...scores].sort((a, b) => b.scoredAt - a.scoredAt), [scores])

  // ── stats ──────────────────────────────────────────────────────────────────
  const total    = scores.length
  const pass     = scores.filter(s => s.effectiveVerdict === 'PASS').length
  const passRate = total ? Math.round((pass / total) * 100) : null
  const avgRaw   = total ? scores.reduce((s, x) => s + (x.effectiveScore ?? 0), 0) / total : null
  const avg      = avgRaw != null && !isNaN(avgRaw) ? avgRaw : null

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const thisMonth  = scores.filter(s => s.scoredAt >= monthStart.getTime()).length
  const unread     = scores.filter(s => !s.acknowledged).length

  // ── Month-over-month ───────────────────────────────────────────────────────
  const prevMonthStart = new Date(monthStart); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
  const thisMonthScores = scores.filter(s => s.scoredAt >= monthStart.getTime())
  const prevMonthScores = scores.filter(s => s.scoredAt >= prevMonthStart.getTime() && s.scoredAt < monthStart.getTime())
  const thisMonthAvg = thisMonthScores.length ? thisMonthScores.reduce((a, x) => a + x.effectiveScore, 0) / thisMonthScores.length : null
  const prevMonthAvg = prevMonthScores.length ? prevMonthScores.reduce((a, x) => a + x.effectiveScore, 0) / prevMonthScores.length : null
  const momDelta = thisMonthAvg != null && prevMonthAvg != null ? thisMonthAvg - prevMonthAvg : null

  // ── dimension averages ─────────────────────────────────────────────────────
  const dimAvg = key => {
    const vals = scores.map(s => Number(s.fullScore?.scores?.[key]?.dimension_average)).filter(v => isFinite(v))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const irAvg  = dimAvg('inquiry_resolution')
  const ipAvg  = dimAvg('internal_processes')
  const cpAvg  = dimAvg('customer_perception')

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleAcknowledge = async (id) => {
    const ok = await acknowledgeScore(id)
    if (ok) toast.success('Marked as seen')
    else    toast.error('Failed to acknowledge')
  }

  const openScore = (s) => setActiveScore({
    ...s.fullScore,
    scoreId:        s.id,
    reviewerNote:   s.notes,
    overrideVerdict: s.overrideVerdict,
    overrideScore:   s.overrideScore,
    overrideNote:    s.overrideNote,
    overrideAt:      s.overrideAt,
    disputed:        s.disputed,
    disputeNote:     s.disputeNote,
    disputeAt:       s.disputeAt,
    acknowledged:    s.acknowledged,
    acknowledgedAt:  s.acknowledgedAt,
  })

  const displayName = agent?.name || profile?.name || '—'
  const initials    = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">

      {/* ── Profile header ── */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0"
          style={{ background: 'rgba(255,151,128,0.12)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.2)' }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{displayName}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {agent?.email && <span className="text-sm" style={{ color: '#777' }}>{agent.email}</span>}
            {team && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#FF9780', background: 'rgba(255,151,128,0.1)' }}>
                {team.name}
              </span>
            )}
            {unread > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}>
                {unread} new score{unread !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Key metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {/* Avg Score */}
        <div className="rounded-2xl p-5 stagger-item" style={{ '--i': 0, background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p className="text-xs mb-2" style={{ color: '#777' }}>Avg Score</p>
          <p className="text-3xl font-bold" style={{ color: avg != null ? scoreColor(avg) : '#555' }}>{avg != null ? avg.toFixed(1) : '—'}</p>
          <p className="text-xs mt-1" style={{ color: '#666' }}>out of 100</p>
        </div>

        {/* Pass Rate */}
        <div className="rounded-2xl p-5 stagger-item" style={{ '--i': 1, background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p className="text-xs mb-2" style={{ color: '#777' }}>Pass Rate</p>
          <p className="text-3xl font-bold" style={{ color: '#10b981' }}>{passRate != null ? `${passRate}%` : '—'}</p>
          <p className="text-xs mt-1" style={{ color: '#666' }}>{pass} of {total}</p>
        </div>

        {/* This Month — with MoM delta */}
        <div className="rounded-2xl p-5 stagger-item" style={{ '--i': 2, background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p className="text-xs mb-2" style={{ color: '#777' }}>This Month</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-white">{thisMonth}</p>
            {momDelta != null && (() => {
              const up    = momDelta >= 0
              const color = Math.abs(momDelta) < 2 ? '#555' : up ? '#10b981' : '#ef4444'
              return (
                <span className="text-sm font-semibold mb-1 tabular-nums" style={{ color }}>
                  {up ? '↑' : '↓'} {Math.abs(momDelta).toFixed(1)}
                </span>
              )
            })()}
          </div>
          <p className="text-xs mt-1" style={{ color: '#666' }}>
            {thisMonthAvg != null ? `${thisMonthAvg.toFixed(1)} avg` : 'tickets'}{prevMonthAvg != null ? ` · prev ${prevMonthAvg.toFixed(1)}` : ''}
          </p>
        </div>

        {/* Unread */}
        <div className="rounded-2xl p-5 stagger-item" style={{ '--i': 3, background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p className="text-xs mb-2" style={{ color: '#777' }}>New Scores</p>
          <p className="text-3xl font-bold" style={{ color: unread > 0 ? '#f59e0b' : '#555' }}>{unread}</p>
          <p className="text-xs mt-1" style={{ color: '#666' }}>to acknowledge</p>
        </div>
      </div>

      {/* ── Goal progress ── */}
      {agent?.goal_score && avg != null && (() => {
        const pct     = Math.min(Math.round((avg / agent.goal_score) * 100), 100)
        const reached = avg >= agent.goal_score
        const close   = !reached && avg >= agent.goal_score - 8
        const color   = reached ? '#10b981' : close ? '#f59e0b' : '#ef4444'
        return (
          <div className="rounded-2xl p-5 mb-6" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs" style={{ color: '#777' }}>Score goal</p>
              <span className="text-sm font-bold tabular-nums" style={{ color }}>
                {avg.toFixed(1)} <span style={{ color: '#666' }}>/ {agent.goal_score}</span>
                {reached && <span className="ml-2 text-xs">✓ Reached</span>}
              </span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: '#1e1e1e' }}>
              <div className="h-full rounded-full"
                style={{ width: `${pct}%`, background: color, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
            {!reached && (
              <p className="text-xs mt-2" style={{ color: '#666' }}>
                {(agent.goal_score - avg).toFixed(1)} points away from your goal
              </p>
            )}
          </div>
        )
      })()}

      {/* ── Dimension breakdown + Trend (side by side on larger screens) ── */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">

        {/* Dimension breakdown */}
        <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p className="text-xs mb-5" style={{ color: '#777' }}>Performance by area</p>
          {total === 0 ? (
            <p className="text-xs" style={{ color: '#555' }}>No scores yet</p>
          ) : (
            <div className="flex flex-col gap-4">
              <DimBar label="Inquiry Resolution"  weight="50%" avg={irAvg} />
              <DimBar label="Internal Processes"  weight="25%" avg={ipAvg} />
              <DimBar label="Customer Perception" weight="25%" avg={cpAvg} />
            </div>
          )}
        </div>

        {/* 30-day trend */}
        <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
          <p className="text-xs mb-4" style={{ color: '#777' }}>Score trend — last 30 days</p>
          <TrendChart scores={scores} />
        </div>
      </div>

      {/* ── Score history ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Score History</h2>
          <span className="text-xs" style={{ color: '#666' }}>{total} ticket{total !== 1 ? 's' : ''}</span>
        </div>

        {total === 0 ? (
          <div className="text-center py-16" style={{ color: '#555' }}>
            <p className="text-sm">No tickets scored yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
            {/* Header row */}
            <div className="grid text-xs px-4 py-2.5"
              style={{ background: '#171719', color: '#666', borderBottom: '1px solid rgba(255,255,255,0.08)',
                gridTemplateColumns: '10px 80px 1fr auto 80px 70px 70px' }}>
              <span />
              <span>Ticket</span>
              <span>Subject</span>
              <span />
              <span className="text-right">Score</span>
              <span className="text-center">Status</span>
              <span className="text-right hidden sm:block">Date</span>
            </div>

            {sorted.map(s => (
              <ScoreRow
                key={s.id}
                s={s}
                onView={openScore}
                onAcknowledge={handleAcknowledge}
              />
            ))}
          </div>
        )}
      </div>

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
