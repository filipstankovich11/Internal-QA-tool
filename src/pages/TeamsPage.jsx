import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronDown, Download, LoaderCircle, Pencil, Plus, Search,
  Star, Trash2, TrendingDown, TrendingUp, UserMinus, UserPlus,
  UsersRound, X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import { TrendChart } from '../components/TrendChart'
import Segmented from '../components/Segmented'
import { VERDICT_COLOR, gradeColor } from '../lib/verdict'
import './TeamsPage.css'

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
  let sum = 0, scoreCount = 0, pass = 0, rev = 0, fail = 0, unack = 0, disputed = 0, autoFail = 0
  for (const s of scores) {
    if (Number.isFinite(s.effectiveScore)) {
      sum += s.effectiveScore
      scoreCount++
    }
    const v = s.effectiveVerdict
    if (v === 'PASS') pass++
    else if (v === 'NEEDS_REVIEW') rev++
    else if (v === 'FAIL') fail++
    if (!s.acknowledged) unack++
    if (s.disputed) disputed++
    if (s.fullScore?.auto_fail?.triggered) autoFail++
  }
  const n = scores.length
  return { n, avg: scoreCount ? +(sum / scoreCount).toFixed(1) : null, pass, rev, fail, unack, disputed, autoFail, passRate: n ? Math.round((pass / n) * 100) : null }
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
  if (Math.abs(diff) < 1) return <span className="teams-trend is-stable">Stable</span>
  const up = diff > 0
  return (
    <span className={`teams-trend ${up ? 'is-up' : 'is-down'}`}>
      {up ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
      {Math.abs(diff)} pts
    </span>
  )
}

// ── Summary tile ─────────────────────────────────────────────────────────────

function SummaryTile({ label, value, color, borderColor }) {
  return (
    <div className="teams-summary-tile" style={{ borderColor: borderColor || undefined }}>
      <p className="tabular-nums m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 28, color: color || '#1A1E23', lineHeight: 1.1 }}>{value}</p>
      <p className="m-0 mt-1 uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>{label}</p>
    </div>
  )
}

// ── Comparison bar chart ───────────────────────────────────────────────────────

function ComparisonView({ rows, thresholds }) {
  return (
    <section className="teams-comparison" aria-labelledby="team-comparison-title">
      <h2 id="team-comparison-title" className="teams-section-title">Team comparison</h2>
      <div className="flex flex-col gap-4">
        {rows.map(({ team, agg, members }) => (
          <div key={team.id}>
            <div className="teams-comparison-heading">
              <div className="teams-comparison-name">
                <span className="text-sm font-medium" style={{ color: '#1A1E23' }}>{team.name}</span>
                <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>{members.length} agent{members.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="teams-comparison-metrics">
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
    </section>
  )
}

// ── Manage agents panel ────────────────────────────────────────────────────────

function ManageAgentsPanel({ teamId, teamAgents, allAgents, onAssign, onUnassign }) {
  const [search, setSearch] = useState('')
  const [busyAgentId, setBusyAgentId] = useState(null)
  const [error, setError] = useState('')
  const searchId = useId()
  const unassigned = allAgents.filter(a =>
    a.team_id !== teamId &&
    (!search || a.name?.toLowerCase().includes(search.toLowerCase()))
  )

  const changeMembership = async (agentId, action) => {
    if (busyAgentId) return
    setBusyAgentId(agentId)
    setError('')
    const ok = await action(agentId)
    if (!ok) setError('The team assignment could not be updated. Try again.')
    setBusyAgentId(null)
  }

  return (
    <div className="teams-manage-panel">
      <h3 className="teams-section-title">Manage agents</h3>
      {error && <p className="teams-inline-error" role="alert">{error}</p>}

      {teamAgents.length > 0 && (
        <div className="mb-4">
          <p className="text-xs mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>In this team</p>
          <div className="flex flex-col gap-1">
            {teamAgents.map(a => (
              <div key={a.id} className="teams-agent-manage-row">
                <div className="teams-agent-identity">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: '#FFD2C9', color: '#B84A2E' }}>
                    {a.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="teams-agent-name">{a.name}</span>
                </div>
                <button type="button" disabled={!!busyAgentId} onClick={() => changeMembership(a.id, onUnassign)}
                  className="teams-roster-action is-remove" aria-label={`Remove ${a.name} from this team`}>
                  {busyAgentId === a.id ? <LoaderCircle className="teams-spinner" size={15} aria-hidden="true" /> : <UserMinus size={15} aria-hidden="true" />}
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor={searchId} className="teams-field-label">Add agents</label>
        <div className="teams-search-wrap">
          <Search size={15} aria-hidden="true" />
          <input id={searchId} placeholder="Search agents…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="teams-search-input" />
        </div>
        {unassigned.length === 0
          ? <p className="text-xs text-center py-2" style={{ color: 'rgba(26,30,35,.5)' }}>No agents available to add</p>
          : (
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {unassigned.map(a => (
                <div key={a.id} className="teams-agent-manage-row">
                  <div className="teams-agent-identity">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: '#E8E3E1', color: 'rgba(26,30,35,.6)' }}>
                      {a.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="teams-agent-name">{a.name}</span>
                    {a.team_id && <span className="teams-agent-note">Currently in another team</span>}
                  </div>
                  <button type="button" disabled={!!busyAgentId} onClick={() => changeMembership(a.id, onAssign)}
                    className="teams-roster-action" aria-label={`Add ${a.name} to this team`}>
                    {busyAgentId === a.id ? <LoaderCircle className="teams-spinner" size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                    Add
                  </button>
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
  const [savingName,    setSavingName]    = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [error,         setError]         = useState('')
  const agentsPanelId = useId()
  const managePanelId = useId()

  const scored = memberStats.filter(m => m.n > 0)
  const top    = scored[0] ?? null
  const bottom = scored.length > 1 ? scored[scored.length - 1] : null

  const scoredDims = (dims || []).filter(d => d.avg != null)
  const weakest    = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg < a.avg ? b : a) : null
  const strongest  = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg > a.avg ? b : a) : null

  const cancelEdit = () => { setName(team.name); setEditing(false); setError('') }
  const save = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Enter a team name before saving.')
      return
    }
    if (trimmedName === team.name) {
      setEditing(false)
      return
    }
    setSavingName(true)
    setError('')
    const ok = await onEdit(team.id, trimmedName)
    if (ok) setEditing(false)
    else setError('The team name could not be saved. Try again.')
    setSavingName(false)
  }

  const removeTeam = async () => {
    if (deleting) return
    setDeleting(true)
    setError('')
    const ok = await onDelete(team.id)
    if (!ok) {
      setError('The team could not be deleted. Try again.')
      setDeleting(false)
    }
  }

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

  return (
    <article className="teams-card">

      {/* Header */}
      <div className="teams-card-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            {editing ? (
              <div className="teams-name-editor">
                <label className="sr-only" htmlFor={`team-name-${team.id}`}>Team name</label>
                <input id={`team-name-${team.id}`} autoFocus value={name} maxLength={80}
                  onChange={e => { setName(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancelEdit() }}
                  aria-invalid={!!error}
                  className="teams-name-input" />
                <button type="button" className="teams-icon-action is-confirm" onClick={save} disabled={savingName} aria-label="Save team name">
                  {savingName ? <LoaderCircle className="teams-spinner" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                </button>
                <button type="button" className="teams-icon-action" onClick={cancelEdit} disabled={savingName} aria-label="Cancel editing team name">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
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

        <div className="teams-card-actions">
          {canEdit && !confirmDelete && (
            <>
              <button type="button" className={`teams-card-action${managing ? ' is-active' : ''}`}
                onClick={() => { setManaging(v => !v); setExpanded(false) }}
                aria-expanded={managing} aria-controls={managePanelId}>
                <UserPlus size={15} aria-hidden="true" />
                Manage
              </button>
              <button type="button" className="teams-card-action"
                onClick={() => { setEditing(true); setError('') }}>
                <Pencil size={15} aria-hidden="true" />
                Edit
              </button>
              <button type="button" className="teams-card-action is-danger"
                onClick={() => { setConfirmDelete(true); setError('') }}>
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="teams-delete-confirm" role="group" aria-label={`Delete ${team.name}`}>
              <span>Delete this team?</span>
              <button type="button" className="teams-delete-button" disabled={deleting} onClick={removeTeam}>
                {deleting && <LoaderCircle className="teams-spinner" size={15} aria-hidden="true" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" className="teams-cancel-button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="teams-inline-error" role="alert">{error}</p>}

      {/* Metric strip */}
      <div className="teams-metric-strip">
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
      <div className="teams-card-footer">
        <div className="teams-performers">
          {top && (
            <span className="inline-flex items-center gap-1.5 text-xs truncate" style={{ color: 'rgba(26,30,35,.72)' }} title="Top performer in this team">
              <Star size={13} fill="currentColor" className="teams-success-icon" aria-hidden="true" />{top.agent.name} · {top.avg}/100
            </span>
          )}
          {bottom && (
            <span className="inline-flex items-center gap-1.5 text-xs truncate" style={{ color: 'rgba(26,30,35,.72)' }} title="Lowest average in this team">
              <TrendingDown size={13} aria-hidden="true" />{bottom.agent.name} · {bottom.avg}/100
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
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="teams-disclosure-button" aria-expanded={expanded} aria-controls={agentsPanelId}>
              {expanded ? 'Hide agents' : 'Show agents'}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded agent list */}
      {expanded && !managing && members.length > 0 && (
        <div id={agentsPanelId} className="teams-agent-list">
          {memberStats.map((m) => {
            const isTop = top?.agent.id === m.agent.id && scored.length > 1
            const isLow = bottom?.agent.id === m.agent.id && scored.length > 1
            return (
              <div key={m.agent.id} className={`teams-agent-stat${isLow ? ' is-low' : ''}`}>
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
                <div className="teams-agent-stat-values">
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
        <div id={managePanelId} className="teams-disclosure-panel">
          <ManageAgentsPanel
          teamId={team.id}
          teamAgents={members}
          allAgents={allAgents}
          onAssign={onAssign}
          onUnassign={onUnassign}
          />
        </div>
      )}
    </article>
  )
}

// ── Team detail side-panel ───────────────────────────────────────────────────

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function TeamDetailPanel({ stat, thresholds, onClose, onViewScore }) {
  const { team, agg, members, memberStats, dims, allScores } = stat
  const [expanded, setExpanded] = useState(null)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)
  const closeTimerRef = useRef(null)
  const closingRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const scoredDims = dims.filter(d => d.avg != null)
  const weakestId   = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg < a.avg ? b : a).id : null
  const strongestId = scoredDims.length > 1 ? scoredDims.reduce((a, b) => b.avg > a.avg ? b : a).id : null

  const metrics = [
    { label: 'Avg',       value: agg.avg !== null ? agg.avg : '—',          color: gradeColor(agg.avg, thresholds) },
    { label: 'Pass rate', value: agg.passRate !== null ? `${agg.passRate}%` : '—', color: '#2F8F5B' },
    { label: 'Tickets',   value: agg.n,     color: '#1A1E23' },
    { label: 'Pending',   value: agg.unack, color: agg.unack > 0 ? '#B84A2E' : '#1A1E23' },
  ]

  const requestClose = useCallback((restoreFocus = true) => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(
      () => onClose({ restoreFocus }),
      prefersReducedMotion() ? 80 : 150,
    )
  }, [onClose])

  useEffect(() => {
    const hiddenSurfaces = ['.teams-page-content', '.app-sidebar', '.mobile-app-header']
      .map(selector => document.querySelector(selector))
      .filter(Boolean)
      .map(element => ({ element, inert: element.inert }))
    hiddenSurfaces.forEach(({ element }) => { element.inert = true })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => closeButtonRef.current?.focus())

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose(true)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...panelRef.current.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(closeTimerRef.current)
      hiddenSurfaces.forEach(({ element, inert }) => { element.inert = inert })
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [requestClose])

  return (
    <div className={`teams-detail-overlay${closing ? ' is-closing' : ''}`} onClick={() => requestClose(true)}>
      <aside ref={panelRef} className={`teams-detail-panel${closing ? ' is-closing' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
        onClick={event => event.stopPropagation()}>
        <div className="teams-detail-content">
          {/* Header */}
          <header className="teams-detail-header">
            <div className="teams-detail-heading">
              <div className="min-w-0">
                <h2 id={titleId}>{team.name}</h2>
                <p id={descriptionId} className="teams-detail-subtitle">
                  <span>{members.length} agent{members.length !== 1 ? 's' : ''} · {agg.n} ticket{agg.n !== 1 ? 's' : ''} scored</span>
                  {agg.n > 0 && agg.n < LOW_SAMPLE && (
                    <span className="px-1.5 py-0.5 rounded" style={{ background: '#FBF7F3', color: 'rgba(26,30,35,.5)' }}>low sample</span>
                  )}
                </p>
              </div>
            </div>
            <button ref={closeButtonRef} type="button" onClick={() => requestClose(true)} className="teams-detail-close" aria-label={`Close ${team.name} details`}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {/* Metrics */}
          <div className="teams-detail-metrics">
            {metrics.map(m => (
              <div key={m.label} className="teams-detail-metric">
                <p className="tabular-nums m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 20, color: m.color }}>{m.value}</p>
                <p className="m-0 mt-1 uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(26,30,35,.5)' }}>{m.label}</p>
              </div>
            ))}
          </div>

          {/* 30-day trend */}
          <section>
            <h3 className="teams-section-title">30-day score trend</h3>
            <TrendChart scores={allScores} />
          </section>

          {/* Dimension breakdown */}
          {scoredDims.length > 0 && (
            <section>
              <h3 className="teams-section-title">
                Rubric dimensions <span style={{ color: 'rgba(26,30,35,.45)' }}>· avg / 5</span>
              </h3>
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
            </section>
          )}

          {/* Verdict mix */}
          {agg.n > 0 && (
            <section>
              <h3 className="teams-section-title">Verdict mix</h3>
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
            </section>
          )}

          {/* Agents */}
          <section>
            <h3 className="teams-section-title">Agents <span>· select an agent to see tickets</span></h3>
            {members.length === 0 ? (
              <p className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>No agents in this team.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {memberStats.map(m => {
                  const isOpen = expanded === m.agent.id
                  return (
                    <div key={m.agent.id} className="teams-detail-agent">
                      <button type="button" onClick={() => setExpanded(isOpen ? null : m.agent.id)}
                        className="teams-detail-agent-button" disabled={m.n === 0}
                        aria-expanded={m.n > 0 ? isOpen : undefined}
                        aria-controls={m.n > 0 ? `team-agent-tickets-${m.agent.id}` : undefined}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: '#FFD2C9', color: '#B84A2E' }}>
                            {m.agent.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm truncate" style={{ color: '#1A1E23' }}>{m.agent.name}</span>
                        </div>
                        <div className="teams-detail-agent-stats">
                          {m.n > 0 ? (
                            <>
                              <span style={{ color: 'rgba(26,30,35,.5)' }}>{m.n} tickets</span>
                              <span className="tabular-nums font-semibold" style={{ color: gradeColor(m.avg, thresholds) }}>{m.avg}/100</span>
                              <ChevronDown className="teams-chevron" size={14} aria-hidden="true" />
                            </>
                          ) : <span style={{ color: 'rgba(26,30,35,.5)' }}>No scores</span>}
                        </div>
                      </button>
                      {isOpen && (
                        <div id={`team-agent-tickets-${m.agent.id}`} className="teams-ticket-list">
                          {m.scores.map(s => (
                            <button key={s.id}
                              onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                              className="teams-ticket-button"
                              aria-label={`Open ticket ${s.ticketId}, ${s.fullScore?.ticket_subject || 'untitled'}, score ${s.effectiveScore?.toFixed(0) ?? 'unavailable'} out of 100`}>
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
          </section>
        </div>
      </aside>
    </div>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(rows, period) {
  const header = ['Team', 'Agents', 'Tickets', 'Avg Score', 'Pass Rate %', 'Pass', 'Needs Review', 'Fail']
  const data = rows.map(({ team, agg, members }) =>
    [team.name, members.length, agg.n, agg.avg ?? '', agg.passRate ?? '', agg.pass, agg.rev, agg.fail])
  const cell = value => `"${String(value).replaceAll('"', '""')}"`
  const csv  = [header, ...data].map(row => row.map(cell).join(',')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `teams-${period}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const { teams, agents, scoreHistory, rubric, dataLoading, addTeam, updateTeam, deleteTeam, updateAgent, activeOverlay, setActiveOverlay, openScore } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()

  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [sort,    setSort]    = useState('avg')
  const [period,  setPeriod]  = useState('week')
  const [view,    setView]    = useState('cards')
  const [detailTeamId, setDetailTeamId] = useState(null)
  const [addingTeam, setAddingTeam] = useState(false)
  const [addError, setAddError] = useState('')
  const addTriggerRef = useRef(null)
  const detailTriggerRef = useRef(null)

  // Team detail panel — coordinated with the global overlay (notifications/settings)
  const openDetail  = (id, trigger) => {
    detailTriggerRef.current = trigger || document.activeElement
    setDetailTeamId(id)
    setActiveOverlay('team')
  }
  const closeDetail = useCallback(({ restoreFocus = true } = {}) => {
    setDetailTeamId(null)
    setActiveOverlay(o => o === 'team' ? null : o)
    if (restoreFocus) requestAnimationFrame(() => detailTriggerRef.current?.focus())
  }, [setActiveOverlay])
  useEffect(() => { if (activeOverlay !== 'team') setDetailTeamId(null) }, [activeOverlay])

  const handleAdd = async () => {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      setAddError('Enter a team name before saving.')
      return
    }
    if (addingTeam) return
    setAddingTeam(true)
    setAddError('')
    try {
      const result = await addTeam(trimmedName)
      if (result?.error) {
        setAddError('The team could not be created. Check your connection and try again.')
        toast.error('Could not create the team.')
      } else {
        setNewName('')
        setAdding(false)
        toast.success('Team created')
        requestAnimationFrame(() => addTriggerRef.current?.focus())
      }
    } catch {
      setAddError('The team could not be created. Check your connection and try again.')
      toast.error('Could not create the team.')
    } finally {
      setAddingTeam(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      const result = await deleteTeam(id)
      if (result?.error) {
        toast.error('Could not delete the team.')
        return false
      }
      toast.success('Team deleted')
      return true
    } catch {
      toast.error('Could not delete the team.')
      return false
    }
  }

  const handleEdit = async (id, name) => {
    try {
      await updateTeam(id, { name })
      toast.success('Team name updated')
      return true
    } catch {
      toast.error('Could not update the team name.')
      return false
    }
  }

  const handleAssign = async (agentId, teamId) => {
    try {
      const result = await updateAgent(agentId, { teamId })
      if (result?.error) throw result.error
      toast.success('Agent added to team')
      return true
    } catch {
      toast.error('Could not add the agent to this team.')
      return false
    }
  }

  const handleUnassign = async (agentId) => {
    try {
      const result = await updateAgent(agentId, { teamId: null })
      if (result?.error) throw result.error
      toast.success('Agent removed from team')
      return true
    } catch {
      toast.error('Could not remove the agent from this team.')
      return false
    }
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
    <div className={`teams-page panel-push ${detailStat ? 'is-open' : ''}`}>
    <main className="teams-page-content">
      {/* Header */}
      <div className="teams-page-header">
        <div>
          <h1 className="m-0" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, fontSize: 30, color: '#1A1E23' }}>Teams</h1>
          <div className="teams-page-subtitle">
            Group agents and track collective performance<ScoreInfoPopover rubric={rubric} />
          </div>
        </div>
        {isAdmin && (
          <button ref={addTriggerRef} type="button" onClick={() => { setAdding(true); setAddError('') }}
            className="g-btn-primary teams-add-trigger">
            <Plus size={17} aria-hidden="true" />
            Add team
          </button>
        )}
      </div>

      {/* Roster summary */}
      {teams.length > 0 && (
        <div className="teams-summary" aria-label="Team summary">
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
              <span className="inline-flex items-center gap-1" style={{ color: m.delta > 0 ? '#2F8F5B' : '#D14B3D', fontWeight: 600 }}>
                {m.delta > 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                {Math.abs(m.delta)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {teams.length > 0 && (
        <div className="teams-toolbar">
          {/* Period */}
          <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} segWidth={84} fontPx={12} padY={6} />

          {/* Cards / Compare */}
          {teams.length > 1 && (
            <Segmented options={[{ id: 'cards', label: 'Cards' }, { id: 'compare', label: 'Compare' }]} value={view} onChange={setView} segWidth={72} fontPx={12} padY={6} />
          )}

          {/* Sort by (cards only) */}
          {view === 'cards' && teams.length > 1 && (
            <div className="teams-sort-group" role="group" aria-label="Sort teams by">
              <span>Sort by</span>
              <div>
                {SORT_OPTIONS.map(o => (
                  <button key={o.id} type="button" onClick={() => setSort(o.id)} aria-pressed={sort === o.id}
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
          <div className="teams-export-wrap">
            <button onClick={() => exportCSV(sortedTeams, period)}
              className="teams-export-button">
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Add team form */}
      {adding && (
        <form className="teams-add-form" onSubmit={event => { event.preventDefault(); handleAdd() }} noValidate>
          <div className="teams-add-field">
            <label htmlFor="new-team-name">Team name</label>
            <input id="new-team-name" autoFocus placeholder="e.g. Billing support" maxLength={80}
              value={newName} onChange={e => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setAddError(''); requestAnimationFrame(() => addTriggerRef.current?.focus()) } }}
              aria-invalid={!!addError} aria-describedby={addError ? 'new-team-error' : undefined}
              className="teams-add-input" />
            {addError && <p id="new-team-error" className="teams-inline-error" role="alert">{addError}</p>}
          </div>
          <div className="teams-add-actions">
            <button type="submit" disabled={addingTeam} className="g-btn-primary teams-form-button">
              {addingTeam && <LoaderCircle className="teams-spinner" size={16} aria-hidden="true" />}
              {addingTeam ? 'Saving…' : 'Save team'}
            </button>
            <button type="button" disabled={addingTeam} onClick={() => { setAdding(false); setAddError(''); requestAnimationFrame(() => addTriggerRef.current?.focus()) }} className="teams-cancel-button">Cancel</button>
          </div>
        </form>
      )}

      {/* Content */}
      {dataLoading ? (
        <div className="teams-empty" role="status">
          <LoaderCircle className="teams-spinner" size={24} aria-hidden="true" />
          <p>Loading teams…</p>
        </div>
      ) : teams.length === 0 && !adding ? (
        <div className="teams-empty">
          <UsersRound size={28} aria-hidden="true" />
          <h2>No teams yet</h2>
          <p>Add a team to group agents and track their performance together.</p>
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
              onEdit={handleEdit}
              onDelete={handleDelete}
              canEdit={isAdmin}
              onAssign={id => handleAssign(id, team.id)}
              onUnassign={handleUnassign}
              onOpen={event => openDetail(team.id, event.currentTarget)}
            />
          ))}
        </div>
      )}
    </main>
    {detailStat && <TeamDetailPanel stat={detailStat} thresholds={vt} onClose={closeDetail} onViewScore={openScore} />}
    </div>
  )
}
