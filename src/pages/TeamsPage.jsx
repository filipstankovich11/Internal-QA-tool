import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import { TrendChart } from '../components/TrendChart'
import ScoreModal from '../components/ScoreModal'
import { VERDICT_COLOR, gradeColor } from '../lib/verdict'

const SORT_OPTIONS   = [
  { id: 'avg',    label: 'Avg score' },
  { id: 'agents', label: 'Agents'    },
  { id: 'name',   label: 'Name'      },
]
const PERIOD_OPTIONS = [
  { id: 'week',  label: 'This week'  },
  { id: 'month', label: 'This month' },
  { id: 'all',   label: 'All time'   },
]

function windowMs(period) {
  if (period === 'week')  return 7  * 86400000
  if (period === 'month') return 30 * 86400000
  return null
}

function filterByPeriod(scores, period) {
  const ms = windowMs(period)
  if (!ms) return scores
  const cutoff = Date.now() - ms
  return scores.filter(s => s.scoredAt >= cutoff)
}

const LOW_SAMPLE = 5 // fewer scored tickets than this → flag the average as low-confidence

// Single pass over a score set → all the aggregates a card/row needs
function aggregate(scores) {
  let sum = 0, pass = 0, rev = 0, fail = 0, unack = 0, disputed = 0, autoFail = 0
  for (const s of scores) {
    sum += s.effectiveScore
    const v = s.effectiveVerdict
    if (v === 'PASS') pass++
    else if (v === 'NEEDS_REVIEW') rev++
    else if (v === 'FAIL') fail++
    if (!s.acknowledged) unack++
    if (s.disputed) disputed++
    if (s.fullScore?.auto_fail?.triggered) autoFail++
  }
  const n = scores.length
  return { n, avg: n ? +(sum / n).toFixed(1) : null, pass, rev, fail, unack, disputed, autoFail, passRate: n ? Math.round((pass / n) * 100) : null }
}

// Average each rubric dimension's 1–5 score across a set of tickets (for the
// weakest-area callout and the detail panel's breakdown)
function dimensionAverages(scores, dims) {
  return dims.map(d => {
    let sum = 0, n = 0
    for (const s of scores) {
      const v = s.fullScore?.scores?.[d.id]?.dimension_average
      if (typeof v === 'number') { sum += v; n++ }
    }
    return { id: d.id, name: d.name, weight: d.weight, avg: n ? +(sum / n).toFixed(1) : null }
  })
}

// ── Trend badge ────────────────────────────────────────────────────────────────

function TrendBadge({ current, prev }) {
  if (current === null || prev === null) return null
  const diff = +(current - prev).toFixed(1)
  if (Math.abs(diff) < 1) return <span className="text-xs ml-2" style={{ color: '#888' }}>→ stable</span>
  const up = diff > 0
  return (
    <span className="text-xs font-medium ml-2" style={{ color: up ? '#10b981' : '#ef4444' }}>
      {up ? '↑' : '↓'} {Math.abs(diff)} pts
    </span>
  )
}

// ── Summary tile ─────────────────────────────────────────────────────────────

function SummaryTile({ label, value, color }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      <p className="text-xl font-bold tabular-nums" style={{ color: color || '#fff' }}>{value}</p>
      <p className="mt-0.5 text-xs" style={{ color: '#c8c8c8' }}>{label}</p>
    </div>
  )
}

// ── Comparison bar chart ───────────────────────────────────────────────────────

function ComparisonView({ rows, thresholds }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: '#c8c8c8' }}>Team comparison</p>
      <div className="flex flex-col gap-4">
        {rows.map(({ team, agg, members }) => (
          <div key={team.id}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{team.name}</span>
                <span className="text-xs" style={{ color: '#888' }}>{members.length} agent{members.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: '#888' }}>{agg.n} tickets</span>
                {agg.passRate !== null && <span style={{ color: '#10b981' }}>{agg.passRate}% pass</span>}
                <span className="font-bold" style={{ color: gradeColor(agg.avg, thresholds) }}>
                  {agg.avg !== null ? `${agg.avg}/100` : '—'}
                </span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: agg.avg !== null ? `${agg.avg}%` : '0%', background: gradeColor(agg.avg, thresholds), opacity: 0.85 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Manage agents panel ────────────────────────────────────────────────────────

function ManageAgentsPanel({ teamId, teamAgents, allAgents, onAssign, onUnassign }) {
  const [search, setSearch] = useState('')
  const unassigned = allAgents.filter(a =>
    a.team_id !== teamId &&
    (!search || a.name?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.18)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#c8c8c8' }}>Manage agents</p>

      {teamAgents.length > 0 && (
        <div className="mb-4">
          <p className="text-xs mb-2" style={{ color: '#888' }}>In this team</p>
          <div className="flex flex-col gap-1">
            {teamAgents.map(a => (
              <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#1c1c1e' }}>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: '#1a1a1a', color: '#FF9780' }}>
                    {a.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm" style={{ color: '#e8e8e8' }}>{a.name}</span>
                </div>
                <button onClick={() => onUnassign(a.id)}
                  className="text-xs transition-colors" style={{ color: '#888' }}
                  onMouseEnter={e => e.target.style.color = '#ef4444'}
                  onMouseLeave={e => e.target.style.color = '#888'}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs mb-2" style={{ color: '#888' }}>Add agents</p>
        <input placeholder="Search agents…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-xs mb-2 g-input" style={{ color: '#fff' }} />
        {unassigned.length === 0
          ? <p className="text-xs text-center py-2" style={{ color: '#888' }}>No agents available to add</p>
          : (
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {unassigned.map(a => (
                <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#1c1c1e' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: '#1a1a1a', color: '#c8c8c8' }}>
                      {a.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm" style={{ color: '#e8e8e8' }}>{a.name}</span>
                    {a.team_id && <span className="text-xs" style={{ color: '#777' }}>· currently in another team</span>}
                  </div>
                  <button onClick={() => onAssign(a.id)}
                    className="text-xs transition-colors" style={{ color: '#FF9780' }}
                    onMouseEnter={e => e.target.style.color = '#fff'}
                    onMouseLeave={e => e.target.style.color = '#FF9780'}>+ Add</button>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────────

function TeamCard({ team, agg, prevAvg, members, memberStats, dims, allAgents, thresholds, onEdit, onDelete, canEdit, onAssign, onUnassign, onOpen }) {
  const [editing,       setEditing]       = useState(false)
  const [name,          setName]          = useState(team.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [managing,      setManaging]      = useState(false)

  const scored = memberStats.filter(m => m.n > 0)
  const top    = scored[0] ?? null
  const bottom = scored.length > 1 ? scored[scored.length - 1] : null

  const scoredDims = (dims || []).filter(d => d.avg != null)
  const weakest    = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg < a.avg ? b : a) : null

  const save = () => { if (name.trim()) onEdit(team.id, name.trim()); setEditing(false) }

  const metrics = [
    { label: 'Score',     value: agg.avg !== null ? `${agg.avg}` : '—',          sub: '/100', color: '#FF9780' },
    { label: 'Pass rate', value: agg.passRate !== null ? `${agg.passRate}%` : '—', color: '#10b981' },
    { label: 'Passed',    value: agg.pass, color: '#e0e0e0' },
    { label: 'In review', value: agg.rev,  color: '#e0e0e0' },
    { label: 'Failed',    value: agg.fail, color: '#ef4444' },
  ]

  const actionBtn = 'text-xs px-3 py-1 rounded-lg transition-colors'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            {editing ? (
              <input autoFocus value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                onBlur={save}
                className="rounded-lg px-2.5 py-1 text-sm font-medium g-input" style={{ border: '1px solid #FF9780', color: '#fff' }} />
            ) : (
              <button onClick={onOpen} className="text-left block min-w-0 transition-colors" title="Open team details"
                onMouseEnter={e => e.currentTarget.querySelector('p').style.color = '#FF9780'}
                onMouseLeave={e => e.currentTarget.querySelector('p').style.color = '#fff'}>
                <p className="text-white font-semibold truncate transition-colors">{team.name}</p>
              </button>
            )}
            <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: '#888' }}>
              <span>{members.length} agent{members.length !== 1 ? 's' : ''} · {agg.n} ticket{agg.n !== 1 ? 's' : ''} scored</span>
              {agg.n > 0 && agg.n < LOW_SAMPLE && (
                <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#999' }}
                  title={`Only ${agg.n} ticket${agg.n !== 1 ? 's' : ''} scored — the average is low-confidence`}>
                  low sample
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && !confirmDelete && (
            <>
              <button className={actionBtn} style={{ border: '1px solid rgba(255,255,255,0.10)', color: managing ? '#FF9780' : '#c8c8c8' }}
                onClick={() => { setManaging(v => !v); setExpanded(false) }}
                onMouseEnter={e => { e.currentTarget.style.color = '#FF9780'; e.currentTarget.style.borderColor = 'rgba(255,151,128,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = managing ? '#FF9780' : '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                Manage
              </button>
              <button className={actionBtn} style={{ border: '1px solid rgba(255,255,255,0.10)', color: '#c8c8c8' }}
                onClick={() => setEditing(true)}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                Edit
              </button>
              <button className={actionBtn} style={{ border: '1px solid rgba(255,255,255,0.10)', color: '#c8c8c8' }}
                onClick={() => setConfirmDelete(true)}
                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                Delete
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#ef4444' }}>Delete team?</span>
              <button className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} onClick={() => onDelete(team.id)}>Yes</button>
              <button className="text-xs g-btn-ghost px-2 py-0.5" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}>
        {metrics.map((m, i) => (
          <div key={m.label} className="px-5 py-3.5" style={{ borderRight: i < 4 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
            <p className="text-xs uppercase m-0" style={{ letterSpacing: '0.04em', color: '#c8c8c8' }}>{m.label}</p>
            <p className="font-semibold m-0 mt-1" style={{ fontSize: 20, color: m.color }}>
              {m.value}{m.sub && <span className="text-xs" style={{ color: '#888' }}>{m.sub}</span>}
              {m.label === 'Score' && agg.avg !== null && prevAvg !== null && <TrendBadge current={agg.avg} prev={prevAvg} />}
            </p>
          </div>
        ))}
      </div>

      {/* Weakest rubric dimension — coaching focus */}
      {agg.n > 0 && weakest && (
        <button onClick={onOpen}
          className="w-full text-left px-5 py-2 text-xs transition-colors"
          style={{ background: 'rgba(0,0,0,0.10)', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#888' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.10)'}
          title="Lowest-scoring rubric dimension for this team — the best place to focus coaching. Click for the full breakdown.">
          Weakest area: <span style={{ color: '#f59e0b' }}>{weakest.name}</span> <span style={{ color: '#c8c8c8' }}>· {weakest.avg}/5</span>
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-2.5 gap-3" style={{ background: 'rgba(0,0,0,0.12)' }}>
        <div className="flex items-center gap-4 min-w-0">
          {top && (
            <span className="inline-flex items-center gap-1.5 text-xs truncate" style={{ color: '#c8c8c8' }} title="Top performer in this team">
              <span style={{ color: '#10b981' }}>★</span>{top.agent.name} · {top.avg}/100
            </span>
          )}
          {bottom && (
            <span className="inline-flex items-center gap-1.5 text-xs truncate" style={{ color: '#c8c8c8' }} title="Lowest average in this team">
              <span style={{ color: '#888' }}>↘</span>{bottom.agent.name} · {bottom.avg}/100
            </span>
          )}
          {!top && !bottom && <span className="text-xs" style={{ color: '#888' }}>No agents scored yet</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {agg.autoFail > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
              title="Tickets that triggered an auto-fail condition">
              {agg.autoFail} auto-fail
            </span>
          )}
          {agg.disputed > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
              title="Scores the agent has disputed">
              {agg.disputed} disputed
            </span>
          )}
          {agg.unack > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: 'rgba(255,151,128,0.08)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.2)' }}
              title="Scored tickets in this team not yet acknowledged by the agent">
              {agg.unack} pending
            </span>
          )}
          {members.length > 0 && !managing && (
            <button onClick={() => setExpanded(v => !v)}
              className="text-xs px-2.5 py-0.5 rounded-lg transition-colors" style={{ border: '1px solid rgba(255,255,255,0.10)', color: '#c8c8c8' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
              {expanded ? 'Hide agents ▲' : 'Show agents ▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded agent list */}
      {expanded && !managing && members.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {memberStats.map((m, idx) => {
            const isTop = top?.agent.id === m.agent.id && scored.length > 1
            const isLow = bottom?.agent.id === m.agent.id && scored.length > 1
            return (
              <div key={m.agent.id} className="flex items-center justify-between px-5 py-2.5 gap-3"
                style={{ borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: 'rgba(255,255,255,0.01)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: '#1a1a1a', color: '#FF9780' }}>
                    {m.agent.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm truncate" style={{ color: '#e8e8e8' }}>{m.agent.name}</span>
                  {isTop && <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Top</span>}
                  {isLow && <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>Needs attention</span>}
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {m.n > 0 ? (
                    <>
                      <span style={{ color: '#888' }}>{m.n} tickets</span>
                      <span style={{ color: gradeColor(m.avg, thresholds), fontWeight: 500 }}>{m.avg}/100</span>
                      {m.passRate !== null && <span style={{ color: '#10b981' }}>{m.passRate}% pass</span>}
                    </>
                  ) : (
                    <span style={{ color: '#888' }}>No scores yet</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Manage agents panel */}
      {managing && (
        <ManageAgentsPanel
          teamId={team.id}
          teamAgents={members}
          allAgents={allAgents}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
      )}
    </div>
  )
}

// ── Team detail side-panel ───────────────────────────────────────────────────

function TeamDetailPanel({ stat, thresholds, onClose, onViewScore }) {
  const { team, agg, members, memberStats, dims, allScores } = stat
  const [expanded, setExpanded] = useState(null)
  const scoredDims = dims.filter(d => d.avg != null)
  const weakestId = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg < a.avg ? b : a).id : null

  const metrics = [
    { label: 'Avg',       value: agg.avg !== null ? agg.avg : '—',          color: gradeColor(agg.avg, thresholds) },
    { label: 'Pass rate', value: agg.passRate !== null ? `${agg.passRate}%` : '—', color: '#10b981' },
    { label: 'Tickets',   value: agg.n,     color: '#fff' },
    { label: 'Pending',   value: agg.unack, color: agg.unack > 0 ? '#FF9780' : '#fff' },
  ]

  return (
    <>
      <div className="fixed inset-0" style={{ zIndex: 39, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', animation: 'fadeIn 180ms ease' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen overflow-y-auto z-40 panel-enter"
        style={{ width: 560, background: '#171719', borderLeft: '1px solid rgba(255,255,255,0.08)', boxShadow: '-24px 0 64px rgba(0,0,0,0.5)' }}>
        <div className="p-6 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div style={{ width: 4, height: 32, background: '#FF9780', borderRadius: 2, flexShrink: 0 }} />
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-white truncate">{team.name}</h2>
                <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: '#888' }}>
                  <span>{members.length} agent{members.length !== 1 ? 's' : ''} · {agg.n} ticket{agg.n !== 1 ? 's' : ''} scored</span>
                  {agg.n > 0 && agg.n < LOW_SAMPLE && (
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#999' }}>low sample</span>
                  )}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="g-btn-ghost text-xs px-3 py-1.5 shrink-0">Close</button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-2">
            {metrics.map(m => (
              <div key={m.label} className="rounded-xl p-3 text-center" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
                <p className="text-lg font-bold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                <p className="text-xs mt-0.5" style={{ color: '#c8c8c8' }}>{m.label}</p>
              </div>
            ))}
          </div>

          {/* 30-day trend */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#c8c8c8' }}>30-day score trend</p>
            <TrendChart scores={allScores} />
          </div>

          {/* Dimension breakdown */}
          {scoredDims.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#c8c8c8' }}>
                Rubric dimensions <span style={{ color: '#666' }}>· avg / 5</span>
              </p>
              <div className="flex flex-col gap-3">
                {dims.map(d => {
                  const isWeak = d.id === weakestId
                  const pct = d.avg != null ? (d.avg / 5) * 100 : 0
                  const c = d.avg == null ? '#555' : d.avg >= 4 ? '#10b981' : d.avg >= 3 ? '#f59e0b' : '#ef4444'
                  return (
                    <div key={d.id}>
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <span style={{ color: '#e8e8e8' }}>
                          {d.name} <span style={{ color: '#666' }}>· {d.weight}%</span>
                          {isWeak && <span className="ml-2 px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>Focus area</span>}
                        </span>
                        <span className="tabular-nums font-semibold" style={{ color: c }}>{d.avg != null ? `${d.avg}/5` : '—'}</span>
                      </div>
                      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c, opacity: 0.7 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Verdict mix */}
          {agg.n > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#c8c8c8' }}>Verdict mix</p>
              <div className="flex rounded-full overflow-hidden h-2 w-full mb-2" style={{ background: '#1a1a1a' }}>
                {agg.pass > 0 && <div style={{ width: `${(agg.pass / agg.n) * 100}%`, background: VERDICT_COLOR.PASS }} />}
                {agg.rev  > 0 && <div style={{ width: `${(agg.rev  / agg.n) * 100}%`, background: VERDICT_COLOR.NEEDS_REVIEW }} />}
                {agg.fail > 0 && <div style={{ width: `${(agg.fail / agg.n) * 100}%`, background: VERDICT_COLOR.FAIL }} />}
              </div>
              <div className="flex gap-4 text-xs">
                <span style={{ color: VERDICT_COLOR.PASS }}>{agg.pass} pass</span>
                <span style={{ color: VERDICT_COLOR.NEEDS_REVIEW }}>{agg.rev} review</span>
                <span style={{ color: VERDICT_COLOR.FAIL }}>{agg.fail} fail</span>
              </div>
              {(agg.autoFail > 0 || agg.disputed > 0) && (
                <div className="flex gap-2 mt-3">
                  {agg.autoFail > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                      {agg.autoFail} auto-fail
                    </span>
                  )}
                  {agg.disputed > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                      {agg.disputed} disputed
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Agents */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#c8c8c8' }}>
              Agents <span className="normal-case font-normal" style={{ color: '#666' }}>· click to see tickets</span>
            </p>
            {members.length === 0 ? (
              <p className="text-xs" style={{ color: '#888' }}>No agents in this team.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {memberStats.map(m => {
                  const isOpen = expanded === m.agent.id
                  return (
                    <div key={m.agent.id} className="rounded-lg overflow-hidden" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button onClick={() => m.n > 0 && setExpanded(isOpen ? null : m.agent.id)}
                        className="w-full flex items-center justify-between py-2 px-3 text-left transition-colors"
                        style={{ cursor: m.n > 0 ? 'pointer' : 'default' }}
                        onMouseEnter={e => { if (m.n > 0) e.currentTarget.style.background = '#161616' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: '#1a1a1a', color: '#FF9780' }}>
                            {m.agent.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm truncate" style={{ color: '#e8e8e8' }}>{m.agent.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs shrink-0">
                          {m.n > 0 ? (
                            <>
                              <span style={{ color: '#888' }}>{m.n} tickets</span>
                              <span className="tabular-nums font-semibold" style={{ color: gradeColor(m.avg, thresholds) }}>{m.avg}/100</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ color: '#888', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </>
                          ) : <span style={{ color: '#888' }}>No scores</span>}
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {m.scores.map(s => (
                            <button key={s.id}
                              onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                              className="w-full flex items-center gap-2 py-1.5 px-3 text-left text-xs transition-colors"
                              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#161616'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span className="font-mono shrink-0" style={{ color: '#FF9780' }}>#{s.ticketId}</span>
                              <span className="flex-1 truncate" style={{ color: '#aaa' }}>{s.fullScore?.ticket_subject || '—'}</span>
                              <span className="tabular-nums shrink-0" style={{ color: '#c8c8c8' }}>{s.effectiveScore?.toFixed(0)}/100</span>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: gradeColor(s.effectiveScore, thresholds) }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(rows, period) {
  const header = ['Team', 'Agents', 'Tickets', 'Avg Score', 'Pass Rate %', 'Pass', 'Needs Review', 'Fail']
  const data = rows.map(({ team, agg, members }) =>
    [team.name, members.length, agg.n, agg.avg ?? '', agg.passRate ?? '', agg.pass, agg.rev, agg.fail])
  const csv  = [header, ...data].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `teams-${period}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const { teams, agents, scoreHistory, rubric, addTeam, updateTeam, deleteTeam, updateAgent, activeOverlay, setActiveOverlay } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()

  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [sort,    setSort]    = useState('avg')
  const [period,  setPeriod]  = useState('all')
  const [view,    setView]    = useState('cards')
  const [detailTeamId, setDetailTeamId] = useState(null)
  const [modalScore,   setModalScore]   = useState(null)

  // Team detail panel — coordinated with the global overlay (notifications/settings)
  const openDetail  = (id) => { setDetailTeamId(id); setActiveOverlay('team') }
  const closeDetail = () => { setDetailTeamId(null); setActiveOverlay(o => o === 'team' ? null : o) }
  useEffect(() => { if (activeOverlay !== 'team') setDetailTeamId(null) }, [activeOverlay])

  const handleAdd = async () => {
    if (!newName.trim()) return
    await addTeam(newName.trim())
    setNewName(''); setAdding(false)
    toast.success('Team created')
  }

  const handleDelete = async (id) => {
    await deleteTeam(id)
    toast.success('Team deleted')
  }

  const handleAssign = async (agentId, teamId) => {
    await updateAgent(agentId, { teamId })
    toast.success('Agent added to team')
  }

  const handleUnassign = async (agentId) => {
    await updateAgent(agentId, { teamId: null })
    toast.success('Agent removed from team')
  }

  // ── Single-pass maps: one walk over scoreHistory fills both agent and team
  // buckets (a score lands in a team once even if several of its agents are on it). ──
  const { agentScores, teamScores } = useMemo(() => {
    const agentScores = new Map(agents.map(a => [a.id, []]))
    const agentTeam   = new Map(agents.map(a => [a.id, a.team_id]))
    const teamScores  = new Map(teams.map(t => [t.id, []]))
    for (const s of scoreHistory) {
      if (!s.agentIds) continue
      const teamSet = new Set()
      for (const id of s.agentIds) {
        const arr = agentScores.get(id); if (arr) arr.push(s)
        const tid = agentTeam.get(id);   if (tid) teamSet.add(tid)
      }
      for (const tid of teamSet) { const arr = teamScores.get(tid); if (arr) arr.push(s) }
    }
    return { agentScores, teamScores }
  }, [agents, teams, scoreHistory])

  // ── Per-team stats for the selected period (computed once, reused everywhere) ──
  const teamStats = useMemo(() => {
    const ms = windowMs(period)
    const now = Date.now()
    const dims = rubric?.dimensions || []
    return teams.map(t => {
      const all        = teamScores.get(t.id) || []
      const scores     = filterByPeriod(all, period)
      const prevScores = ms ? all.filter(s => s.scoredAt >= now - 2 * ms && s.scoredAt < now - ms) : []
      const members    = agents.filter(a => a.team_id === t.id)
      const memberStats = members
        .map(a => { const sc = filterByPeriod(agentScores.get(a.id) || [], period); return { agent: a, scores: sc, ...aggregate(sc) } })
        .sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1))
      return { team: t, members, memberStats, allScores: all, dims: dimensionAverages(scores, dims), agg: aggregate(scores), prevAvg: aggregate(prevScores).avg }
    })
  }, [teams, agents, teamScores, agentScores, period, rubric])

  const sortedTeams = useMemo(() => [...teamStats].sort((a, b) => {
    if (sort === 'name')   return a.team.name.localeCompare(b.team.name)
    if (sort === 'agents') return b.members.length - a.members.length
    return (b.agg.avg ?? -1) - (a.agg.avg ?? -1)
  }), [teamStats, sort])

  const summary = useMemo(() => ({
    teams:      teams.length,
    agents:     agents.length,
    overall:    aggregate(filterByPeriod(scoreHistory, period)).avg,
    unassigned: agents.filter(a => !a.team_id).length,
  }), [teams, agents, scoreHistory, period])

  // Biggest avg-score changes vs the previous equal-length window (only for week/month)
  const movers = useMemo(() => {
    if (!windowMs(period)) return []
    return teamStats
      .filter(s => s.agg.avg != null && s.prevAvg != null)
      .map(s => ({ team: s.team, delta: +(s.agg.avg - s.prevAvg).toFixed(1) }))
      .filter(m => Math.abs(m.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4)
  }, [teamStats, period])
  const moversLabel = period === 'week' ? 'vs last week' : 'vs previous month'

  const vt = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  const tabStyle = (active) => active ? { background: '#1e1e1e', color: '#fff' } : { color: '#c8c8c8' }
  const detailStat = detailTeamId ? teamStats.find(s => s.team.id === detailTeamId) : null

  return (
    <div className={`panel-push ${detailStat ? 'is-open' : ''}`}>
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-sm mt-0.5 flex items-center" style={{ color: '#c8c8c8' }}>
            Group agents and track collective performance<ScoreInfoPopover rubric={rubric} />
          </p>
        </div>
        {isAdmin && <button onClick={() => setAdding(true)} className="g-btn-primary text-xs px-3 py-1.5 rounded-lg shrink-0 whitespace-nowrap">+ Add Team</button>}
      </div>

      {/* Roster summary */}
      {teams.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryTile label="Teams" value={summary.teams} />
          <SummaryTile label="Agents" value={summary.agents} />
          <SummaryTile label="Overall avg" value={summary.overall != null ? summary.overall : '—'} color={gradeColor(summary.overall, vt)} />
          <SummaryTile label="Unassigned" value={summary.unassigned} color={summary.unassigned > 0 ? '#f59e0b' : '#10b981'} />
        </div>
      )}

      {/* Movers — biggest changes vs the previous period */}
      {movers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <span className="text-xs uppercase tracking-wider mr-1" style={{ color: '#c8c8c8' }}>
            Movers <span className="normal-case" style={{ color: '#666' }}>{moversLabel}</span>
          </span>
          {movers.map(m => (
            <span key={m.team.id} className="text-xs px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5"
              style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)', color: '#e8e8e8' }}>
              {m.team.name}
              <span style={{ color: m.delta > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{m.delta > 0 ? '↑' : '↓'} {Math.abs(m.delta)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {teams.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Period */}
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#171719', border: '1px solid rgba(255,255,255,0.07)' }}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.id} onClick={() => setPeriod(o.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={tabStyle(period === o.id)}
                onMouseEnter={e => { if (period !== o.id) e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { if (period !== o.id) e.currentTarget.style.color = '#c8c8c8' }}>
                {o.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.07)' }} />

          {/* Cards / Compare */}
          {teams.length > 1 && (
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#171719', border: '1px solid rgba(255,255,255,0.07)' }}>
              {['cards', 'compare'].map(v => (
                <button key={v} onClick={() => setView(v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                  style={tabStyle(view === v)}
                  onMouseEnter={e => { if (view !== v) e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { if (view !== v) e.currentTarget.style.color = '#c8c8c8' }}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Sort by (cards only) */}
          {view === 'cards' && teams.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#888' }}>Sort by</span>
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#171719', border: '1px solid rgba(255,255,255,0.07)' }}>
                {SORT_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => setSort(o.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={tabStyle(sort === o.id)}
                    onMouseEnter={e => { if (sort !== o.id) e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { if (sort !== o.id) e.currentTarget.style.color = '#c8c8c8' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export CSV — pushed to right */}
          <div className="ml-auto">
            <button onClick={() => exportCSV(sortedTeams, period)}
              className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.07)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
              ↓ Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Add team form */}
      {adding && (
        <div className="rounded-2xl p-5 mb-4 flex items-center gap-3" style={{ background: '#1e1e20', border: '1px solid rgba(255,147,128,0.3)' }}>
          <input autoFocus placeholder="Team name..."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#444] g-input"
          />
          <button onClick={handleAdd} className="g-btn-primary text-sm px-4 py-2.5 rounded-xl">Save</button>
          <button onClick={() => setAdding(false)} className="text-sm px-3 py-2.5 g-btn-ghost">Cancel</button>
        </div>
      )}

      {/* Content */}
      {teams.length === 0 && !adding ? (
        <div className="text-center py-20" style={{ color: '#888' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">No teams yet. Add one to start grouping agents.</p>
        </div>
      ) : view === 'compare' ? (
        <ComparisonView rows={sortedTeams} thresholds={vt} />
      ) : (
        <div className="flex flex-col gap-3">
          {sortedTeams.map(({ team, agg, prevAvg, members, memberStats, dims }) => (
            <TeamCard key={team.id} team={team}
              agg={agg}
              prevAvg={prevAvg}
              members={members}
              memberStats={memberStats}
              dims={dims}
              allAgents={agents}
              thresholds={vt}
              onEdit={updateTeam}
              onDelete={handleDelete}
              canEdit={isAdmin}
              onAssign={id => handleAssign(id, team.id)}
              onUnassign={handleUnassign}
              onOpen={() => openDetail(team.id)}
            />
          ))}
        </div>
      )}
    </div>
    {detailStat && <TeamDetailPanel stat={detailStat} thresholds={vt} onClose={closeDetail} onViewScore={setModalScore} />}
    {modalScore && <ScoreModal score={modalScore} onClose={() => setModalScore(null)} />}
    </div>
  )
}
