import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

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

function scoreColor(v) {
  if (v === null || v === undefined) return '#555'
  return v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'
}

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

// ── Trend badge ────────────────────────────────────────────────────────────────

function TrendBadge({ current, prev }) {
  if (current === null || prev === null) return null
  const diff = +(current - prev).toFixed(1)
  if (Math.abs(diff) < 1) return <span className="text-xs" style={{ color: '#666' }}>→ stable</span>
  const up = diff > 0
  return (
    <span className="text-xs font-medium" style={{ color: up ? '#10b981' : '#ef4444' }}>
      {up ? '↑' : '↓'} {Math.abs(diff)} pts
    </span>
  )
}

// ── Comparison bar chart ───────────────────────────────────────────────────────

function ComparisonView({ teams, agents, getTeamScores, avgScore, period }) {
  const rows = teams.map(t => {
    const scores     = filterByPeriod(getTeamScores(t.id), period)
    const avg        = avgScore(scores)
    const pass       = scores.filter(s => s.effectiveVerdict === 'PASS').length
    const passRate   = scores.length ? Math.round((pass / scores.length) * 100) : null
    const agentCount = agents.filter(a => a.team_id === t.id).length
    return { team: t, avg, agentCount, tickets: scores.length, passRate }
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: '#666' }}>Team Comparison</p>
      <div className="flex flex-col gap-4">
        {rows.map(({ team, avg, agentCount, tickets, passRate }) => (
          <div key={team.id}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{team.name}</span>
                <span className="text-xs" style={{ color: '#666' }}>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: '#666' }}>{tickets} tickets</span>
                {passRate !== null && <span style={{ color: '#10b981' }}>{passRate}% pass</span>}
                <span className="font-bold" style={{ color: scoreColor(avg) }}>
                  {avg !== null ? `${avg}/100` : '—'}
                </span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: avg !== null ? `${avg}%` : '0%', background: scoreColor(avg), opacity: 0.85 }} />
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
    <div className="border-t px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.18)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#777' }}>Manage Agents</p>

      {teamAgents.length > 0 && (
        <div className="mb-4">
          <p className="text-xs mb-2" style={{ color: '#666' }}>In this team</p>
          <div className="flex flex-col gap-1">
            {teamAgents.map(a => (
              <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#1c1c1e' }}>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: '#1e1e1e', color: '#FF9780' }}>
                    {a.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm" style={{ color: '#ccc' }}>{a.name}</span>
                </div>
                <button onClick={() => onUnassign(a.id)}
                  className="text-xs transition-colors" style={{ color: '#666' }}
                  onMouseEnter={e => e.target.style.color = '#ef4444'}
                  onMouseLeave={e => e.target.style.color = '#666'}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs mb-2" style={{ color: '#666' }}>Add agents</p>
        <input placeholder="Search agents…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-xs mb-2 g-input" style={{ color: '#ccc' }} />
        {unassigned.length === 0
          ? <p className="text-xs text-center py-2" style={{ color: '#555' }}>No agents available to add</p>
          : (
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {unassigned.map(a => (
                <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: '#1c1c1e' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: '#1e1e1e', color: '#777' }}>
                      {a.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm" style={{ color: '#ccc' }}>{a.name}</span>
                    {a.team_id && <span className="text-xs" style={{ color: '#555' }}>· currently in another team</span>}
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

const BORDER     = '1px solid rgba(255,255,255,0.08)'
const BORDER_DIM = '1px solid rgba(255,255,255,0.08)'

function TeamCard({ team, agents, allAgents, scores, prevScores, onEdit, onDelete, canEdit, getAgentScores, avgScore, onAssign, onUnassign }) {
  const [editing,       setEditing]       = useState(false)
  const [name,          setName]          = useState(team.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [managing,      setManaging]      = useState(false)

  const pass     = scores.filter(s => s.effectiveVerdict === 'PASS').length
  const review   = scores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
  const fail     = scores.filter(s => s.effectiveVerdict === 'FAIL').length
  const avg      = scores.length     ? +(scores.reduce((s, x)     => s + x.effectiveScore, 0) / scores.length).toFixed(1)     : null
  const prevAvg  = prevScores.length ? +(prevScores.reduce((s, x) => s + x.effectiveScore, 0) / prevScores.length).toFixed(1) : null
  const passRate = scores.length ? Math.round((pass / scores.length) * 100) : null
  const pending  = scores.filter(s => !s.acknowledged).length

  const agentStats = agents
    .map(a => { const s = getAgentScores(a.id); return { agent: a, avg: avgScore(s), count: s.length } })
    .filter(x => x.count > 0)
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
  const top    = agentStats[0] ?? null
  const bottom = agentStats.length > 1 ? agentStats[agentStats.length - 1] : null

  const save = () => { if (name.trim()) onEdit(team.id, name.trim()); setEditing(false) }

  const cellStyle = { padding: '14px 20px', borderRight: BORDER_DIM }

  const btn = {
    fontSize: 12, padding: '4px 12px', background: 'transparent',
    border: BORDER, borderRadius: 8, color: '#999', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'color 150ms, border-color 150ms',
  }

  return (
    <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", background: 'linear-gradient(180deg, #1e1e1e 0%, #161616 100%)', border: BORDER, borderRadius: 16, overflow: 'hidden', color: '#f2f2f2', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: BORDER_DIM }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 28, background: '#FF9780', borderRadius: 2, flexShrink: 0 }} />
          <div>
            {editing ? (
              <input autoFocus value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                onBlur={save}
                style={{ background: '#1a1a1a', border: '1px solid #FF9780', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 15, fontWeight: 500, outline: 'none', fontFamily: 'inherit' }}
              />
            ) : (
              <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{team.name}</p>
            )}
            <p style={{ fontSize: 12, margin: '2px 0 0', color: '#888' }}>
              {agents.length} agent{agents.length !== 1 ? 's' : ''} · {scores.length} tickets scored
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {canEdit && !confirmDelete && (
            <>
              <button style={btn}
                onClick={() => { setManaging(v => !v); setExpanded(false) }}
                onMouseEnter={e => { e.currentTarget.style.color = '#FF9780'; e.currentTarget.style.borderColor = 'rgba(255,151,128,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = managing ? '#FF9780' : '#999'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                Manage
              </button>
              <button style={btn}
                onClick={() => setEditing(true)}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                Edit
              </button>
              <button style={btn}
                onClick={() => setConfirmDelete(true)}
                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
                Delete
              </button>
            </>
          )}
          {confirmDelete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#ef4444' }}>Delete team?</span>
              <button style={{ ...btn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => onDelete(team.id)}>Yes</button>
              <button style={btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Metric strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: BORDER_DIM, background: 'rgba(0,0,0,0.15)' }}>
        {[
          { label: 'Score',     value: avg !== null ? `${avg}` : '—',          sub: '/100',  color: '#FF9780' },
          { label: 'Pass rate', value: passRate !== null ? `${passRate}%` : '—', color: '#10b981' },
          { label: 'Passed',    value: pass,   color: null },
          { label: 'In review', value: review, color: null },
          { label: 'Failed',    value: fail,   color: '#ef4444', last: true },
        ].map(({ label, value, sub, color, last }) => (
          <div key={label} style={{ ...cellStyle, ...(last ? { borderRight: 'none' } : {}) }}>
            <p style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#666', margin: 0 }}>{label}</p>
            <p style={{ fontSize: 20, fontWeight: 500, margin: '4px 0 0', color: color || '#e0e0e0' }}>
              {value}
              {sub && <span style={{ fontSize: 12, color: '#666' }}>{sub}</span>}
              {label === 'Score' && avg !== null && prevAvg !== null && <TrendBadge current={avg} prev={prevAvg} />}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {top && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
              <span style={{ color: '#10b981' }}>★</span>
              {top.agent.name} · {top.avg}/100
            </span>
          )}
          {bottom && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
              <span style={{ color: '#888' }}>↘</span>
              {bottom.agent.name} · {bottom.avg}/100
            </span>
          )}
          {!top && !bottom && (
            <span style={{ fontSize: 12, color: '#555' }}>No agents scored yet</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pending > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 10px', borderRadius: 8, background: 'rgba(255,151,128,0.08)', color: '#FF9780', border: '0.5px solid rgba(255,151,128,0.2)' }}>
              {pending} pending
            </span>
          )}
          {agents.length > 0 && !managing && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ ...btn, fontSize: 11, padding: '3px 10px', color: '#666' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
              {expanded ? 'Hide agents ▲' : 'Show agents ▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded agent list */}
      {expanded && !managing && agents.length > 0 && (
        <div style={{ borderTop: BORDER_DIM }}>
          {agents.map((agent, idx) => {
            const aScores  = getAgentScores(agent.id)
            const aAvg     = avgScore(aScores)
            const aPass    = aScores.filter(s => s.effectiveVerdict === 'PASS').length
            const aPassPct = aScores.length ? Math.round((aPass / aScores.length) * 100) : null
            const isTop    = top?.agent.id === agent.id && agentStats.length > 1
            const isLow    = bottom?.agent.id === agent.id && agentStats.length > 1
            return (
              <div key={agent.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: idx > 0 ? BORDER : 'none', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1e1e1e', color: '#FF9780', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {agent.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span style={{ fontSize: 13, color: '#ccc' }}>{agent.name}</span>
                  {isTop && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Top</span>}
                  {isLow && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>Needs attention</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                  {aScores.length > 0 ? (
                    <>
                      <span style={{ color: '#666' }}>{aScores.length} tickets</span>
                      <span style={{ color: scoreColor(aAvg), fontWeight: 500 }}>{aAvg}/100</span>
                      {aPassPct !== null && <span style={{ color: '#10b981' }}>{aPassPct}% pass</span>}
                    </>
                  ) : (
                    <span style={{ color: '#555' }}>No scores yet</span>
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
          teamAgents={agents}
          allAgents={allAgents}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
      )}
    </div>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(teams, agents, getTeamScores, period) {
  const header = ['Team', 'Agents', 'Tickets', 'Avg Score', 'Pass Rate %', 'Pass', 'Needs Review', 'Fail']
  const rows = teams.map(t => {
    const scores     = filterByPeriod(getTeamScores(t.id), period)
    const pass       = scores.filter(s => s.effectiveVerdict === 'PASS').length
    const review     = scores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
    const fail       = scores.filter(s => s.effectiveVerdict === 'FAIL').length
    const avg        = scores.length ? (scores.reduce((s, x) => s + x.effectiveScore, 0) / scores.length).toFixed(1) : ''
    const passRate   = scores.length ? Math.round((pass / scores.length) * 100) : ''
    const agentCount = agents.filter(a => a.team_id === t.id).length
    return [t.name, agentCount, scores.length, avg, passRate, pass, review, fail]
  })
  const csv  = [header, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `teams-${period}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const { teams, agents, addTeam, updateTeam, deleteTeam, getTeamScores, getAgentScores, avgScore, updateAgent } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()

  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)
  const [sort,    setSort]    = useState('avg')
  const [period,  setPeriod]  = useState('all')
  const [view,    setView]    = useState('cards')

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

  const ms = windowMs(period)

  const getFiltered = (teamId) => filterByPeriod(getTeamScores(teamId), period)
  const getPrev     = (teamId) => {
    if (!ms) return []
    const now = Date.now()
    return getTeamScores(teamId).filter(s => s.scoredAt >= now - 2 * ms && s.scoredAt < now - ms)
  }

  const sortedTeams = [...teams].sort((a, b) => {
    if (sort === 'name')   return a.name.localeCompare(b.name)
    if (sort === 'agents') return agents.filter(x => x.team_id === b.id).length - agents.filter(x => x.team_id === a.id).length
    return (avgScore(getFiltered(b.id)) ?? -1) - (avgScore(getFiltered(a.id)) ?? -1)
  })

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-sm mt-0.5" style={{ color: '#888' }}>Group agents and track collective performance</p>
        </div>
        {isAdmin && <button onClick={() => setAdding(true)} className="g-btn-primary text-sm px-4 py-2 rounded-xl shrink-0">+ Add Team</button>}
      </div>

      {/* Toolbar */}
      {teams.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Period */}
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#171719', border: '1px solid rgba(255,255,255,0.07)' }}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.id} onClick={() => setPeriod(o.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={period === o.id ? { background: '#1e1e1e', color: '#fff' } : { color: '#aaa' }}
                onMouseEnter={e => { if (period !== o.id) e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { if (period !== o.id) e.currentTarget.style.color = '#aaa' }}>
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
                  style={view === v ? { background: '#1e1e1e', color: '#fff' } : { color: '#aaa' }}
                  onMouseEnter={e => { if (view !== v) e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { if (view !== v) e.currentTarget.style.color = '#aaa' }}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Sort by (cards only) */}
          {view === 'cards' && teams.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#666' }}>Sort by</span>
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#171719', border: '1px solid rgba(255,255,255,0.07)' }}>
                {SORT_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => setSort(o.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={sort === o.id ? { background: '#1e1e1e', color: '#fff' } : { color: '#aaa' }}
                    onMouseEnter={e => { if (sort !== o.id) e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { if (sort !== o.id) e.currentTarget.style.color = '#aaa' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export CSV — pushed to right */}
          <div className="ml-auto">
            <button onClick={() => exportCSV(teams, agents, getTeamScores, period)}
              className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
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
        <div className="text-center py-20" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">No teams yet. Add one to start grouping agents.</p>
        </div>
      ) : view === 'compare' ? (
        <ComparisonView
          teams={sortedTeams} agents={agents}
          getTeamScores={getTeamScores} avgScore={avgScore} period={period}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sortedTeams.map(team => (
            <TeamCard key={team.id} team={team}
              agents={agents.filter(a => a.team_id === team.id)}
              allAgents={agents}
              scores={getFiltered(team.id)}
              prevScores={getPrev(team.id)}
              onEdit={updateTeam}
              onDelete={handleDelete}
              canEdit={isAdmin}
              getAgentScores={getAgentScores}
              avgScore={avgScore}
              onAssign={id => handleAssign(id, team.id)}
              onUnassign={handleUnassign}
            />
          ))}
        </div>
      )}
    </div>
  )
}
