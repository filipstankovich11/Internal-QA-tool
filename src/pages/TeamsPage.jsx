import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import { TrendChart } from '../components/TrendChart'
import Segmented from '../components/Segmented'
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
  if (Math.abs(diff) < 1) return <span className="text-xs ml-2" style={{ color: 'rgba(26,30,35,.5)' }}>→ stable</span>
  const up = diff > 0
  return (
    <span className="text-xs font-medium ml-2" style={{ color: up ? '#2F8F5B' : '#D14B3D' }}>
      {up ? '↑' : '↓'} {Math.abs(diff)} pts
    </span>
  )
}

// ── Summary tile ─────────────────────────────────────────────────────────────

function SummaryTile({ label, value, color, borderColor }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${borderColor || '#EEEEEE'}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
      <p className="tabular-nums m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 28, color: color || '#1A1E23', lineHeight: 1.1 }}>{value}</p>
      <p className="m-0 mt-1 uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>{label}</p>
    </div>
  )
}

// ── Comparison bar chart ───────────────────────────────────────────────────────

function ComparisonView({ rows, thresholds }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
      <p className="uppercase mb-5" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>Team comparison</p>
      <div className="flex flex-col gap-4">
        {rows.map(({ team, agg, members }) => (
          <div key={team.id}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: '#1A1E23' }}>{team.name}</span>
                <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>{members.length} agent{members.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: 'rgba(26,30,35,.5)' }}>{agg.n} tickets</span>
                {agg.passRate !== null && <span style={{ color: '#2F8F5B' }}>{agg.passRate}% pass</span>}
                <span className="font-bold" style={{ color: gradeColor(agg.avg, thresholds) }}>
                  {agg.avg !== null ? `${agg.avg}/100` : '—'}
                </span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#F0ECE9' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: agg.avg !== null ? `${agg.avg}%` : '0%', background: gradeColor(agg.avg, thresholds) }} />
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
    <div className="px-5 py-4" style={{ borderTop: '1px solid #F0ECE9', background: '#FBF7F3' }}>
      <p className="uppercase mb-3" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>Manage agents</p>

      {teamAgents.length > 0 && (
        <div className="mb-4">
          <p className="text-xs mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>In this team</p>
          <div className="flex flex-col gap-1">
            {teamAgents.map(a => (
              <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #F0ECE9' }}>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: '#FFD2C9', color: '#B84A2E' }}>
                    {a.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm" style={{ color: '#1A1E23' }}>{a.name}</span>
                </div>
                <button onClick={() => onUnassign(a.id)}
                  className="text-xs transition-colors" style={{ color: 'rgba(26,30,35,.5)' }}
                  onMouseEnter={e => e.target.style.color = '#D14B3D'}
                  onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.5)'}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>Add agents</p>
        <input placeholder="Search agents…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-xs mb-2 g-input" />
        {unassigned.length === 0
          ? <p className="text-xs text-center py-2" style={{ color: 'rgba(26,30,35,.5)' }}>No agents available to add</p>
          : (
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {unassigned.map(a => (
                <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #F0ECE9' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: '#E8E3E1', color: 'rgba(26,30,35,.6)' }}>
                      {a.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm" style={{ color: '#1A1E23' }}>{a.name}</span>
                    {a.team_id && <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>· currently in another team</span>}
                  </div>
                  <button onClick={() => onAssign(a.id)}
                    className="text-xs transition-colors" style={{ color: '#B84A2E' }}
                    onMouseEnter={e => e.target.style.color = '#1A1E23'}
                    onMouseLeave={e => e.target.style.color = '#B84A2E'}>+ Add</button>
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
  const strongest  = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg > a.avg ? b : a) : null

  const save = () => { if (name.trim()) onEdit(team.id, name.trim()); setEditing(false) }

  const scoreColor = gradeColor(agg.avg, thresholds)
  // Roster health — needs attention when there's a low performer or pending acks
  const needsAttention = agg.n > 0 && ((bottom && bottom.avg < (thresholds?.needs_review ?? 60)) || agg.fail > 0)

  const metrics = [
    { label: 'Score',     value: agg.avg !== null ? `${agg.avg}` : '—',          sub: '/100', color: scoreColor, progress: true },
    { label: 'Pass rate', value: agg.passRate !== null ? `${agg.passRate}%` : '—', color: '#2F8F5B' },
    { label: 'Passed',    value: agg.pass, color: '#1A1E23' },
    { label: 'In review', value: agg.rev,  color: '#1A1E23' },
    { label: 'Failed',    value: agg.fail, color: '#D14B3D' },
  ]

  const actionBtn = 'text-xs px-3 rounded-lg transition-colors'
  const actionBtnStyle = { height: 32, border: '1px solid #E7E3DF', color: 'rgba(26,30,35,.72)' }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            {editing ? (
              <input autoFocus value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                onBlur={save}
                className="rounded-lg px-2.5 py-1 g-input" style={{ border: '1px solid #FF9780', fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 19 }} />
            ) : (
              <div className="flex items-center gap-2.5 flex-wrap">
                <button onClick={onOpen} className="text-left block min-w-0 transition-colors" title="Open team details"
                  onMouseEnter={e => e.currentTarget.querySelector('p').style.color = '#B84A2E'}
                  onMouseLeave={e => e.currentTarget.querySelector('p').style.color = '#1A1E23'}>
                  <p className="truncate transition-colors m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 19, color: '#1A1E23' }}>{team.name}</p>
                </button>
                {agg.n > 0 && (
                  needsAttention
                    ? <span className="px-2.5 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: '#FFEAE6', color: '#B84A2E' }}>Needs attention</span>
                    : <span className="px-2.5 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: '#E6F4EC', border: '1px solid #BFE3CD', color: '#2F8F5B' }}>Healthy roster</span>
                )}
              </div>
            )}
            <p className="text-xs mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: 'rgba(26,30,35,.6)' }}>
              <span>{members.length} agent{members.length !== 1 ? 's' : ''} · {agg.n} ticket{agg.n !== 1 ? 's' : ''} scored</span>
              {agg.n > 0 && agg.n < LOW_SAMPLE && (
                <span className="px-1.5 py-0.5 rounded" style={{ background: '#FBF7F3', color: 'rgba(26,30,35,.5)' }}
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
              <button className={actionBtn} style={{ ...actionBtnStyle, color: managing ? '#B84A2E' : 'rgba(26,30,35,.72)', borderColor: managing ? '#FFD2C9' : '#E7E3DF' }}
                onClick={() => { setManaging(v => !v); setExpanded(false) }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                Manage
              </button>
              <button className={actionBtn} style={actionBtnStyle}
                onClick={() => setEditing(true)}
                onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                Edit
              </button>
              <button className={actionBtn} style={actionBtnStyle}
                onClick={() => setConfirmDelete(true)}
                onMouseEnter={e => { e.currentTarget.style.color = '#D14B3D'; e.currentTarget.style.background = '#FEF6F4' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.background = 'transparent' }}>
                Delete
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#D14B3D' }}>Delete team?</span>
              <button className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: '#FEF6F4', border: '1px solid #F4DDD7', color: '#D14B3D' }} onClick={() => onDelete(team.id)}>Yes</button>
              <button className="text-xs g-btn-ghost px-2 py-0.5" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid mt-5 pt-5" style={{ gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '1px solid #F0ECE9', gap: 16 }}>
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="uppercase m-0" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(26,30,35,.5)' }}>{m.label}</p>
            <p className="m-0 mt-1.5" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 26, color: m.color, lineHeight: 1.1 }}>
              {m.value}{m.sub && <span style={{ fontSize: 13, color: 'rgba(26,30,35,.5)', fontWeight: 600 }}>{m.sub}</span>}
              {m.label === 'Score' && agg.avg !== null && prevAvg !== null && <TrendBadge current={agg.avg} prev={prevAvg} />}
            </p>
            {m.progress && (
              <div className="w-full rounded-full overflow-hidden mt-2" style={{ height: 6, background: '#F0ECE9' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: agg.avg !== null ? `${agg.avg}%` : '0%', background: scoreColor }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Strongest + weakest rubric dimensions — what went well vs coaching focus */}
      {agg.n > 0 && weakest && (
        <button onClick={onOpen}
          className="w-full text-left transition-colors flex flex-wrap items-center gap-x-6 gap-y-2 mt-4"
          style={{ background: '#FBF7F3', borderRadius: 10, padding: '12px 16px' }}
          onMouseEnter={e => e.currentTarget.style.background = '#F6F2EF'}
          onMouseLeave={e => e.currentTarget.style.background = '#FBF7F3'}
          title="Highest- and lowest-scoring rubric dimensions for this team. Click for the full breakdown.">
          {strongest && strongest.name !== weakest.name && (
            <span className="inline-flex items-center gap-2 text-xs">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
              <span style={{ color: 'rgba(26,30,35,.6)' }}>Strong area</span>
              <span style={{ color: '#1A1E23', fontWeight: 500 }}>{strongest.name}</span>
              <span style={{ color: 'rgba(26,30,35,.5)' }}>· {strongest.avg}/5</span>
            </span>
          )}
          <span className="inline-flex items-center gap-2 text-xs">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D14B3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>
            </svg>
            <span style={{ color: 'rgba(26,30,35,.6)' }}>Weakest area</span>
            <span style={{ color: '#1A1E23', fontWeight: 500 }}>{weakest.name}</span>
            <span style={{ color: 'rgba(26,30,35,.5)' }}>· {weakest.avg}/5</span>
          </span>
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 mt-4 pt-4" style={{ borderTop: '1px solid #F0ECE9' }}>
        <div className="flex items-center gap-4 min-w-0">
          {top && (
            <span className="inline-flex items-center gap-1.5 text-xs truncate" style={{ color: 'rgba(26,30,35,.72)' }} title="Top performer in this team">
              <span style={{ color: '#2F8F5B' }}>★</span>{top.agent.name} · {top.avg}/100
            </span>
          )}
          {bottom && (
            <span className="inline-flex items-center gap-1.5 text-xs truncate" style={{ color: 'rgba(26,30,35,.72)' }} title="Lowest average in this team">
              <span style={{ color: 'rgba(26,30,35,.5)' }}>↘</span>{bottom.agent.name} · {bottom.avg}/100
            </span>
          )}
          {!top && !bottom && <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>No agents scored yet</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {agg.autoFail > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: '#FEF6F4', color: '#D14B3D', border: '1px solid #F4DDD7' }}
              title="Tickets that triggered an auto-fail condition">
              {agg.autoFail} auto-fail
            </span>
          )}
          {agg.disputed > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: '#FBF7F3', color: '#C8841E', border: '1px solid #F0ECE9' }}
              title="Scores the agent has disputed">
              {agg.disputed} disputed
            </span>
          )}
          {agg.unack > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: '#FFEAE6', color: '#B84A2E' }}
              title="Scored tickets in this team not yet acknowledged by the agent">
              {agg.unack} pending
            </span>
          )}
          {members.length > 0 && !managing && (
            <button onClick={() => setExpanded(v => !v)}
              className="text-xs px-2.5 py-1 rounded-lg transition-colors" style={{ border: '1px solid #E7E3DF', color: 'rgba(26,30,35,.72)' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {expanded ? 'Hide agents ▲' : 'Show agents ▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded agent list */}
      {expanded && !managing && members.length > 0 && (
        <div className="flex flex-col gap-2 mt-4">
          {memberStats.map((m) => {
            const isTop = top?.agent.id === m.agent.id && scored.length > 1
            const isLow = bottom?.agent.id === m.agent.id && scored.length > 1
            return (
              <div key={m.agent.id} className="flex items-center justify-between gap-3"
                style={{ border: `1px solid ${isLow ? '#F4DDD7' : '#F0ECE9'}`, borderRadius: 12, padding: '12px 14px', background: isLow ? '#FEF6F4' : '#FFFFFF' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 34, height: 34, background: isLow ? '#E8E3E1' : '#FFD2C9', color: '#B84A2E' }}>
                    {m.agent.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate" style={{ fontSize: 14, fontWeight: 500, color: '#1A1E23' }}>{m.agent.name}</span>
                      {isTop && <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ fontWeight: 600, background: '#E6F4EC', color: '#2F8F5B' }}>Top</span>}
                      {isLow && <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ fontWeight: 600, background: '#FFEAE6', color: '#B84A2E' }}>Needs attention</span>}
                    </div>
                    {m.n > 0 && <span style={{ fontSize: 12, color: 'rgba(26,30,35,.5)' }}>{m.n} ticket{m.n !== 1 ? 's' : ''} scored</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {m.n > 0 ? (
                    <>
                      <div className="rounded-full overflow-hidden" style={{ width: 140, height: 6, background: '#F0ECE9' }}>
                        <div className="h-full rounded-full" style={{ width: `${m.avg}%`, background: gradeColor(m.avg, thresholds) }} />
                      </div>
                      <span className="tabular-nums text-right" style={{ color: gradeColor(m.avg, thresholds), fontWeight: 600, minWidth: 48 }}>{m.avg}/100</span>
                      {m.passRate !== null && <span style={{ color: gradeColor(m.avg, thresholds) }}>{m.passRate}% pass</span>}
                    </>
                  ) : (
                    <span style={{ color: 'rgba(26,30,35,.45)' }}>No scores yet</span>
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
  const weakestId   = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg < a.avg ? b : a).id : null
  const strongestId = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg > a.avg ? b : a).id : null

  const metrics = [
    { label: 'Avg',       value: agg.avg !== null ? agg.avg : '—',          color: gradeColor(agg.avg, thresholds) },
    { label: 'Pass rate', value: agg.passRate !== null ? `${agg.passRate}%` : '—', color: '#2F8F5B' },
    { label: 'Tickets',   value: agg.n,     color: '#1A1E23' },
    { label: 'Pending',   value: agg.unack, color: agg.unack > 0 ? '#B84A2E' : '#1A1E23' },
  ]

  return (
    <>
      <div className="fixed inset-0" style={{ zIndex: 39, background: 'rgba(26,30,35,0.28)', backdropFilter: 'blur(2px)', animation: 'fadeIn 180ms ease' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen overflow-y-auto z-40 panel-enter"
        style={{ width: 560, background: '#FFFFFF', borderLeft: '1px solid #EEEEEE', boxShadow: '-24px 0 64px rgba(0,0,0,0.12)' }}>
        <div className="p-6 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div style={{ width: 4, height: 32, background: '#FF9780', borderRadius: 2, flexShrink: 0 }} />
              <div className="min-w-0">
                <h2 className="truncate m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 22, color: '#1A1E23' }}>{team.name}</h2>
                <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: 'rgba(26,30,35,.6)' }}>
                  <span>{members.length} agent{members.length !== 1 ? 's' : ''} · {agg.n} ticket{agg.n !== 1 ? 's' : ''} scored</span>
                  {agg.n > 0 && agg.n < LOW_SAMPLE && (
                    <span className="px-1.5 py-0.5 rounded" style={{ background: '#FBF7F3', color: 'rgba(26,30,35,.5)' }}>low sample</span>
                  )}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="g-btn-ghost text-xs px-3 py-1.5 shrink-0">Close</button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-2">
            {metrics.map(m => (
              <div key={m.label} style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <p className="tabular-nums m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 20, color: m.color }}>{m.value}</p>
                <p className="m-0 mt-1 uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(26,30,35,.5)' }}>{m.label}</p>
              </div>
            ))}
          </div>

          {/* 30-day trend */}
          <div>
            <p className="uppercase mb-3" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>30-day score trend</p>
            <TrendChart scores={allScores} />
          </div>

          {/* Dimension breakdown */}
          {scoredDims.length > 0 && (
            <div>
              <p className="uppercase mb-3" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>
                Rubric dimensions <span style={{ color: 'rgba(26,30,35,.45)' }}>· avg / 5</span>
              </p>
              <div className="flex flex-col gap-3">
                {dims.map(d => {
                  const isWeak = d.id === weakestId
                  const isTop  = d.id === strongestId && !isWeak
                  const pct = d.avg != null ? (d.avg / 5) * 100 : 0
                  const c = d.avg == null ? 'rgba(26,30,35,.45)' : d.avg >= 4 ? '#2F8F5B' : d.avg >= 3 ? '#C8841E' : '#D14B3D'
                  return (
                    <div key={d.id}>
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <span style={{ color: '#1A1E23' }}>
                          {d.name} <span style={{ color: 'rgba(26,30,35,.45)' }}>· {d.weight}%</span>
                          {isTop  && <span className="ml-2 px-1.5 py-0.5 rounded" style={{ background: '#E6F4EC', color: '#2F8F5B' }}>Top area</span>}
                          {isWeak && <span className="ml-2 px-1.5 py-0.5 rounded" style={{ background: '#FBF7F3', color: '#C8841E' }}>Focus area</span>}
                        </span>
                        <span className="tabular-nums font-semibold" style={{ color: c }}>{d.avg != null ? `${d.avg}/5` : '—'}</span>
                      </div>
                      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#F0ECE9' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
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
              <p className="uppercase mb-2" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>Verdict mix</p>
              <div className="flex rounded-full overflow-hidden h-2 w-full mb-2" style={{ background: '#F0ECE9' }}>
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
                    <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#FEF6F4', color: '#D14B3D', border: '1px solid #F4DDD7' }}>
                      {agg.autoFail} auto-fail
                    </span>
                  )}
                  {agg.disputed > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#FBF7F3', color: '#C8841E', border: '1px solid #F0ECE9' }}>
                      {agg.disputed} disputed
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Agents */}
          <div>
            <p className="uppercase mb-2" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>
              Agents <span className="normal-case" style={{ fontWeight: 400, letterSpacing: 0, color: 'rgba(26,30,35,.45)' }}>· click to see tickets</span>
            </p>
            {members.length === 0 ? (
              <p className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>No agents in this team.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {memberStats.map(m => {
                  const isOpen = expanded === m.agent.id
                  return (
                    <div key={m.agent.id} className="rounded-lg overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #F0ECE9' }}>
                      <button onClick={() => m.n > 0 && setExpanded(isOpen ? null : m.agent.id)}
                        className="w-full flex items-center justify-between py-2 px-3 text-left transition-colors"
                        style={{ cursor: m.n > 0 ? 'pointer' : 'default' }}
                        onMouseEnter={e => { if (m.n > 0) e.currentTarget.style.background = '#FBF7F3' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: '#FFD2C9', color: '#B84A2E' }}>
                            {m.agent.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm truncate" style={{ color: '#1A1E23' }}>{m.agent.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs shrink-0">
                          {m.n > 0 ? (
                            <>
                              <span style={{ color: 'rgba(26,30,35,.5)' }}>{m.n} tickets</span>
                              <span className="tabular-nums font-semibold" style={{ color: gradeColor(m.avg, thresholds) }}>{m.avg}/100</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ color: 'rgba(26,30,35,.45)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </>
                          ) : <span style={{ color: 'rgba(26,30,35,.5)' }}>No scores</span>}
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #F0ECE9' }}>
                          {m.scores.map(s => (
                            <button key={s.id}
                              onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                              className="w-full flex items-center gap-2 py-1.5 px-3 text-left text-xs transition-colors"
                              style={{ borderTop: '1px solid #F0ECE9' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span className="font-mono shrink-0" style={{ color: '#B84A2E' }}>#{s.ticketId}</span>
                              <span className="flex-1 truncate" style={{ color: 'rgba(26,30,35,.6)' }}>{s.fullScore?.ticket_subject || '—'}</span>
                              <span className="tabular-nums shrink-0" style={{ color: 'rgba(26,30,35,.72)' }}>{s.effectiveScore?.toFixed(0)}/100</span>
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
  const { teams, agents, scoreHistory, rubric, addTeam, updateTeam, deleteTeam, updateAgent, activeOverlay, setActiveOverlay, openScore } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()

  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [sort,    setSort]    = useState('avg')
  const [period,  setPeriod]  = useState('all')
  const [view,    setView]    = useState('cards')
  const [detailTeamId, setDetailTeamId] = useState(null)

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
  const detailStat = detailTeamId ? teamStats.find(s => s.team.id === detailTeamId) : null

  return (
    <div className={`panel-push ${detailStat ? 'is-open' : ''}`}>
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 30, color: '#1A1E23' }}>Teams</h1>
          <p className="text-sm mt-1 flex items-center" style={{ color: 'rgba(26,30,35,.6)' }}>
            Group agents and track collective performance<ScoreInfoPopover rubric={rubric} />
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setAdding(true)}
            className="g-btn-primary shrink-0 whitespace-nowrap inline-flex items-center gap-1.5"
            style={{ height: 40, padding: '0 16px', borderRadius: 8, fontSize: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add team
          </button>
        )}
      </div>

      {/* Roster summary */}
      {teams.length > 0 && (
        <div className="grid mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <SummaryTile label="Teams" value={summary.teams} />
          <SummaryTile label="Agents" value={summary.agents} />
          <SummaryTile label="Overall avg" value={summary.overall != null ? summary.overall : '—'} color={gradeColor(summary.overall, vt)} />
          <SummaryTile label="Unassigned" value={summary.unassigned}
            color={summary.unassigned > 0 ? '#B84A2E' : '#2F8F5B'}
            borderColor={summary.unassigned > 0 ? '#FFD2C9' : '#EEEEEE'} />
        </div>
      )}

      {/* Movers — biggest changes vs the previous period */}
      {movers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <span className="text-xs uppercase mr-1" style={{ fontWeight: 600, letterSpacing: '.06em', color: 'rgba(26,30,35,.5)' }}>
            Movers <span className="normal-case" style={{ fontWeight: 400, letterSpacing: 0, color: 'rgba(26,30,35,.45)' }}>{moversLabel}</span>
          </span>
          {movers.map(m => (
            <span key={m.team.id} className="text-xs px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5"
              style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', color: '#1A1E23' }}>
              {m.team.name}
              <span style={{ color: m.delta > 0 ? '#2F8F5B' : '#D14B3D', fontWeight: 600 }}>{m.delta > 0 ? '↑' : '↓'} {Math.abs(m.delta)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {teams.length > 0 && (
        <div className="flex items-center flex-wrap mb-6 pb-5" style={{ gap: 14, borderBottom: '1px solid #EEEEEE' }}>
          {/* Period */}
          <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} segWidth={84} fontPx={12} padY={6} />

          {/* Cards / Compare */}
          {teams.length > 1 && (
            <Segmented options={[{ id: 'cards', label: 'Cards' }, { id: 'compare', label: 'Compare' }]} value={view} onChange={setView} segWidth={72} fontPx={12} padY={6} />
          )}

          {/* Sort by (cards only) */}
          {view === 'cards' && teams.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>Sort by</span>
              <div className="flex items-center gap-1.5">
                {SORT_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => setSort(o.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={sort === o.id
                      ? { border: '1px solid #1A1E23', color: '#1A1E23', background: '#FFFFFF' }
                      : { border: '1px solid #E7E3DF', color: 'rgba(26,30,35,.6)', background: '#FFFFFF' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export CSV — pushed to right */}
          <div className="ml-auto">
            <button onClick={() => exportCSV(sortedTeams, period)}
              className="text-xs transition-colors inline-flex items-center gap-1.5"
              style={{ height: 40, padding: '0 14px', borderRadius: 8, color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Add team form */}
      {adding && (
        <div className="mb-4 flex items-center gap-3" style={{ background: '#FFFFFF', border: '1px solid #FFD2C9', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
          <input autoFocus placeholder="Team name..."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            className="flex-1 text-sm g-input" style={{ borderRadius: 8, padding: '10px 16px' }}
          />
          <button onClick={handleAdd} className="g-btn-primary text-sm" style={{ height: 40, padding: '0 16px', borderRadius: 8 }}>Save</button>
          <button onClick={() => setAdding(false)} className="text-sm px-3 g-btn-ghost" style={{ height: 40 }}>Cancel</button>
        </div>
      )}

      {/* Content */}
      {teams.length === 0 && !adding ? (
        <div className="text-center py-20" style={{ color: 'rgba(26,30,35,.5)' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">No teams yet. Add one to start grouping agents.</p>
        </div>
      ) : view === 'compare' ? (
        <ComparisonView rows={sortedTeams} thresholds={vt} />
      ) : (
        <div className="flex flex-col gap-4">
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
    {detailStat && <TeamDetailPanel stat={detailStat} thresholds={vt} onClose={closeDetail} onViewScore={openScore} />}
    </div>
  )
}
