import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { useToast } from '../components/Toast'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { supabase } from '../lib/supabase'
import { scoreExplanation, ScoreInfoPopover } from '../components/ScoreInfo'
import { VERDICT_COLOR, GRADE, gradeColor, VERDICT_DESC } from '../lib/verdict'
import { AgentEditForm, AgentHistoryModal, AddAgentModal, AssignTeamsModal, ImportGorgiasModal, EditAgentModal } from '../components/agents/modals'
import Segmented from '../components/Segmented'
import Dropdown from '../components/Dropdown'

const SORT_OPTIONS = [
  { id: 'avg',     label: 'Avg score' },
  { id: 'name',    label: 'Name' },
  { id: 'unack',   label: 'Unacknowledged' },
  { id: 'tickets', label: 'Tickets scored' },
]

// Pass rate (a percentage) keeps its own fixed 80/60 traffic-light — it's a rate,
// not a QA score, so it isn't tied to the rubric's verdict thresholds.
const RATE_THRESHOLDS = { pass: 80, needs_review: 60 }

const AGENT_PAGE_SIZE = 12  // rows/cards shown before "Show more"
const LIST_THRESHOLD  = 20  // auto-switch to compact list above this many agents

// Shared grid template for the compact list header + every row, so columns line up
const agentRowCols = (canEdit) => canEdit
  ? 'minmax(0,1fr) 120px 56px 64px 64px 132px'
  : 'minmax(0,1fr) 120px 56px 64px 64px'
const agentColLabel = { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(26,30,35,.5)' }

function GoalProgress({ avg, goal }) {
  if (!goal || avg == null) return null
  const pct     = Math.min(Math.round((avg / goal) * 100), 100)
  const reached = avg >= goal
  const close   = !reached && avg >= goal - 8
  const color   = reached ? GRADE.good : close ? GRADE.ok : GRADE.bad
  // Desaturated fill — quiet by default, full-strength text carries the signal
  const fill    = reached ? 'rgba(16,185,129,0.55)' : close ? 'rgba(245,158,11,0.55)' : 'rgba(239,68,68,0.5)'

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0ECE9' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Score goal</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {avg.toFixed(1)} <span style={{ color: 'rgba(26,30,35,.5)' }}>/ {goal}</span>
          {reached && <span className="ml-1.5">✓</span>}
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: '#F1ECE8' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: fill, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

const AgentCard = memo(function AgentCard({ stat, team, profiles = [], thresholds, onEdit, onDelete, onViewScore, onViewAll, canEdit, scoreHelp }) {
  const { agent, scores, n, avg, pass, rev, fail, unack } = stat
  const [editing,       setEditing]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const avgColor = gradeColor(avg, thresholds)
  const passRate = n ? Math.round((pass / n) * 100) : 0
  const passColor = gradeColor(passRate, RATE_THRESHOLDS)
  const recent = useMemo(() => scores.slice(0, 3), [scores])
  const recentCols = '92px 1fr 54px 56px' // Ticket · Subject · Score · Verdict
  // Verdict bands for the per-ticket status tooltips — track the live rubric
  const t = thresholds || { pass: 80, needs_review: 60 }
  const verdictRange = { PASS: `≥${t.pass}`, NEEDS_REVIEW: `${t.needs_review}–${t.pass - 1}`, FAIL: `<${t.needs_review}` }

  return (
    <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
      {editing ? (
        <div className="mb-4">
          <AgentEditForm agent={agent} profiles={profiles} onSave={onEdit} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: '#FFD2C9', color: '#B84A2E' }}>
              {agent.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <button onClick={() => onViewAll(agent)}
                className="text-left transition-colors"
                onMouseEnter={e=>e.currentTarget.querySelector('h3').style.color='#B84A2E'}
                onMouseLeave={e=>e.currentTarget.querySelector('h3').style.color='#1A1E23'}>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold transition-colors truncate" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>{agent.name}</h3>
                  {unack > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: '#FFEAE6', color: '#B84A2E', lineHeight: 1 }}
                      title={`${unack} score${unack !== 1 ? 's' : ''} the agent hasn't acknowledged yet`}>
                      {unack}
                    </span>
                  )}
                </div>
              </button>
              {agent.email && <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(26,30,35,.5)' }}>{agent.email}</p>}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {team && <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#B84A2E', background: '#FFEAE6' }}>{team.name}</span>}
                <span className="text-xs inline-flex items-center gap-1" style={{ color: agent.user_id ? '#2F8F5B' : 'rgba(26,30,35,.5)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: agent.user_id ? '#2F8F5B' : 'rgba(26,30,35,.45)' }} />
                  {agent.user_id ? 'Linked' : 'No account'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {avg != null
              ? <div className="flex items-baseline gap-1" title={`Agent's average across all scored tickets. ${scoreHelp}`}>
                  <span className="text-sm font-bold tabular-nums" style={{ color: avgColor }}>{avg.toFixed(1)}</span>
                  <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>avg</span>
                </div>
              : <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>No avg yet</span>}
            {canEdit && !confirmDelete && (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(true)} className="g-btn-ghost text-xs">Edit</button>
                <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}
                  onMouseEnter={e=>e.target.style.color='#D14B3D'} onMouseLeave={e=>e.target.style.color='rgba(26,30,35,.5)'}>Delete</button>
              </div>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#D14B3D' }}>Delete?</span>
                <button onClick={() => onDelete(agent.id)} className="text-xs font-medium px-2 py-0.5 rounded-md"
                  style={{ background: '#FEF6F4', color: '#D14B3D', border: '1px solid #F4DDD7' }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">No</button>
              </div>
            )}
          </div>
        </div>
      )}

      {!editing && (n > 0 ? (
        <>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'rgba(26,30,35,.72)' }}>
              {n} scored
              <span className="ml-2 font-semibold tabular-nums" style={{ color: passColor }}>{passRate}% pass</span>
            </span>
            <span style={{ color: 'rgba(26,30,35,.5)' }}>{pass} pass · {rev} review · {fail} fail</span>
          </div>
          <GoalProgress avg={avg} goal={agent.goal_score} />
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(26,30,35,.5)', letterSpacing: '0.08em', fontSize: '11px' }}>Recent tickets</p>
            {/* Column labels — visible explanation of each cell */}
            <div className="grid items-center gap-2 px-2 mb-1" style={{ gridTemplateColumns: recentCols }}>
              <span style={agentColLabel} title="Gorgias ticket ID — opens in Gorgias">Ticket</span>
              <span style={agentColLabel} title="Ticket subject">Subject</span>
              <span style={agentColLabel} className="text-right" title="Weighted QA score (0–100)">Grade</span>
              <span style={agentColLabel} className="text-center" title="Pass / review / fail verdict">Status</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {recent.map(s => (
                <button key={s.id}
                  className="grid items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-colors"
                  style={{ gridTemplateColumns: recentCols }}
                  onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                  onMouseEnter={e=>e.currentTarget.style.background='#F6F2EF'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-mono transition-colors truncate"
                    style={{ color: '#B84A2E' }}
                    onMouseEnter={e => e.target.style.textDecoration='underline'}
                    onMouseLeave={e => e.target.style.textDecoration='none'}>
                    #{s.ticketId}
                  </a>
                  <span className="text-xs truncate" style={{ color: 'rgba(26,30,35,.72)' }}
                    title={s.fullScore?.ticket_subject ? `Subject — ${s.fullScore.ticket_subject}` : 'Ticket subject'}>
                    {s.fullScore?.ticket_subject || '—'}
                  </span>
                  <span className="text-xs tabular-nums text-right" style={{ color: gradeColor(s.effectiveScore, thresholds) }}
                    title="Grade — weighted QA score (0–100) for this ticket">{s.effectiveScore?.toFixed(0)}/100</span>
                  <div className="justify-self-center w-2 h-2 rounded-full" style={{ background: VERDICT_COLOR[s.effectiveVerdict] || 'rgba(26,30,35,.45)' }}
                    title={`Status — ${VERDICT_DESC[s.effectiveVerdict] || ''} · grade ${verdictRange[s.effectiveVerdict] || ''}`} />
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => onViewAll(agent)} className="mt-2 text-xs w-full text-center py-1.5 rounded-lg transition-colors"
            style={{ color: '#B84A2E' }}
            onMouseEnter={e=>e.currentTarget.style.background='#FFEAE6'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            View all {n} ticket{n !== 1 ? 's' : ''} →
          </button>
        </>
      ) : <p className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>No tickets scored yet</p>)}
    </div>
  )
})

// ── Roster summary tile ───────────────────────────────────────────────────────
function SummaryTile({ label, value, color }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
      <p className="text-xl font-bold tabular-nums" style={{ color: color || '#1A1E23', fontFamily: "'Inter Tight'" }}>{value}</p>
      <p className="mt-0.5 text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>{label}</p>
    </div>
  )
}

// ── Compact list row — for scanning large rosters ────────────────────────────
const AgentRow = memo(function AgentRow({ stat, thresholds, onOpen, onEditAgent, onDelete, canEdit }) {
  const { agent, team, n, avg, pass, unack } = stat
  const [confirmDelete, setConfirmDelete] = useState(false)
  const avgColor = gradeColor(avg, thresholds)
  const passRate = n ? Math.round((pass / n) * 100) : 0
  const passColor = gradeColor(passRate, RATE_THRESHOLDS)

  return (
    <div className="grid items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
      style={{ gridTemplateColumns: agentRowCols(canEdit), background: '#FFFFFF', border: '1px solid #EEEEEE' }}
      onClick={() => onOpen(agent)}
      onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
      onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}>
      {/* Agent */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: '#FFD2C9', color: '#B84A2E' }}>
          {agent.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate" style={{ color: '#1A1E23' }}>{agent.name}</span>
            {unack > 0 && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#FFEAE6', color: '#B84A2E', lineHeight: 1 }} title={`${unack} score${unack !== 1 ? 's' : ''} the agent hasn't acknowledged yet`}>{unack}</span>}
          </div>
          {agent.email && <span className="text-xs truncate block" style={{ color: 'rgba(26,30,35,.5)' }}>{agent.email}</span>}
        </div>
      </div>
      {/* Team */}
      <div className="min-w-0">
        {team
          ? <span className="text-xs px-2 py-0.5 rounded-full truncate inline-block max-w-full" style={{ color: '#B84A2E', background: '#FFEAE6' }}>{team.name}</span>
          : <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}
      </div>
      {/* Avg */}
      <span className="text-sm font-bold tabular-nums text-right" style={{ color: avgColor }}>{avg != null ? avg.toFixed(1) : '—'}</span>
      {/* Pass rate */}
      <span className="text-xs tabular-nums text-right font-semibold" style={{ color: n ? passColor : 'rgba(26,30,35,.45)' }}>{n ? `${passRate}%` : '—'}</span>
      {/* Tickets */}
      <span className="text-xs tabular-nums text-right" style={{ color: 'rgba(26,30,35,.72)' }}>{n}</span>
      {/* Actions */}
      {canEdit && (
        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
          {!confirmDelete ? (
            <>
              <button onClick={() => onEditAgent(agent)} className="g-btn-ghost text-xs">Edit</button>
              <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}
                onMouseEnter={e=>e.target.style.color='#D14B3D'} onMouseLeave={e=>e.target.style.color='rgba(26,30,35,.5)'}>Delete</button>
            </>
          ) : (
            <>
              <button onClick={() => onDelete(agent.id)} className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: '#FEF6F4', color: '#D14B3D', border: '1px solid #F4DDD7' }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">No</button>
            </>
          )}
        </div>
      )}
    </div>
  )
})

export default function AgentsPage() {
  const { agents, teams, scoreHistory, rubric, dataLoading, addAgent, updateAgent, deleteAgent, activeOverlay, setActiveOverlay } = useApp()
  const { canEdit } = useAuth()
  const toast = useToast()
  const [teamFilter,        setTeamFilter]        = useState('all')
  const [search,            setSearch]            = useState('')
  const [sortKey,           setSortKey]           = useState('avg')
  const [belowGoalOnly,     setBelowGoalOnly]     = useState(false)
  const [showAddModal,      setShowAddModal]      = useState(false)
  const [showImportModal,   setShowImportModal]   = useState(false)
  const [showAssignModal,   setShowAssignModal]   = useState(false)
  const [historyAgent,      setHistoryAgent]      = useState(null)
  const [editAgent,         setEditAgent]         = useState(null)
  const [profiles,          setProfiles]          = useState([])
  const [layoutOverride,    setLayoutOverride]    = useState(null) // null = auto by roster size
  const [visibleCount,      setVisibleCount]      = useState(AGENT_PAGE_SIZE)

  // Side-panel score detail — mirrors Dashboard/Score/Review Queue
  const [panelScore, setPanelScore] = useState(null)
  const [modalScore, setModalScore] = useState(null)
  // Stable callbacks — keep AgentCard/AgentRow (both memo'd) from re-rendering on
  // every keystroke in the search box.
  const openPanel  = useCallback((score) => { setPanelScore(score); setActiveOverlay('score') }, [setActiveOverlay])
  const closePanel = useCallback(() => { setPanelScore(null); setActiveOverlay(o => o === 'score' ? null : o) }, [setActiveOverlay])
  useEffect(() => { if (activeOverlay !== 'score') setPanelScore(null) }, [activeOverlay])

  // View a single score from the per-agent drill-down: close the modal first so
  // the slide-in panel (z-40) isn't hidden behind it (z-50).
  const viewScoreFromHistory = useCallback((score) => { setHistoryAgent(null); openPanel(score) }, [openPanel])
  const openHistory = useCallback((agent) => setHistoryAgent(agent), [])

  useEffect(() => {
    supabase.from('profiles').select('id, name, role').order('name')
      .then(({ data }) => setProfiles(data || []))
  }, [])

  const handleAddAgent    = async (...args) => { await addAgent(...args); toast.success('Agent added') }
  const handleDeleteAgent = useCallback(async (id) => { await deleteAgent(id); toast.success('Agent deleted') }, [deleteAgent, toast])
  const handleEditAgent   = useCallback((id, patch) => updateAgent(id, patch), [updateAgent])
  const handleImport      = async (...args) => { await addAgent(...args) }
  const handleAssign      = async (...args) => { await updateAgent(...args) }

  // ── Single-pass stats: one walk over scoreHistory builds every agent's bucket,
  // then each agent's aggregates are computed once (not re-filtered per render). ──
  const agentStats = useMemo(() => {
    const buckets = new Map(agents.map(a => [a.id, []]))
    for (const s of scoreHistory) {
      if (!s.agentIds) continue
      for (const id of s.agentIds) {
        const arr = buckets.get(id)
        if (arr) arr.push(s)
      }
    }
    return agents.map(a => {
      const scores = buckets.get(a.id) || []
      let sum = 0, pass = 0, rev = 0, fail = 0, unack = 0
      for (const s of scores) {
        sum += (s.effectiveScore ?? s.weightedScore)
        const v = s.effectiveVerdict
        if (v === 'PASS') pass++
        else if (v === 'NEEDS_REVIEW') rev++
        else if (v === 'FAIL') fail++
        if (!s.acknowledged) unack++
      }
      const n = scores.length
      const avg = n ? sum / n : null
      const belowGoal = a.goal_score != null && avg != null && avg < a.goal_score
      return { agent: a, team: teams.find(t => t.id === a.team_id), scores, n, avg, pass, rev, fail, unack, belowGoal }
    })
  }, [agents, scoreHistory, teams])

  // Roster cohort = team filter only (so search/below-goal don't skew the headline stats)
  const cohort = useMemo(
    () => teamFilter === 'all' ? agentStats : agentStats.filter(x => x.agent.team_id === teamFilter),
    [agentStats, teamFilter],
  )

  const summary = useMemo(() => {
    let sum = 0, scored = 0, below = 0, unack = 0
    for (const x of cohort) {
      if (x.avg != null) { sum += x.avg; scored++ }
      if (x.belowGoal) below++
      unack += x.unack
    }
    return { count: cohort.length, avg: scored ? sum / scored : null, below, unack }
  }, [cohort])

  const view = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = cohort
    if (belowGoalOnly) list = list.filter(x => x.belowGoal)
    if (q) list = list.filter(x => x.agent.name?.toLowerCase().includes(q) || x.agent.email?.toLowerCase().includes(q))
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':    return (a.agent.name || '').localeCompare(b.agent.name || '')
        case 'unack':   return b.unack - a.unack
        case 'tickets': return b.n - a.n
        case 'avg':
        default:        return (b.avg ?? -1) - (a.avg ?? -1) // unscored agents sink to the bottom
      }
    })
    return sorted
  }, [cohort, search, belowGoalOnly, sortKey])

  const scoreHelp = scoreExplanation(rubric)
  const vt = useMemo(() => rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }, [rubric])

  // Layout: explicit override wins, else auto-switch to the compact list for big rosters
  const layout = layoutOverride ?? (agents.length > LIST_THRESHOLD ? 'list' : 'cards')
  const paged  = view.slice(0, visibleCount)

  // Reset the progressive reveal whenever the result set or layout changes
  useEffect(() => { setVisibleCount(AGENT_PAGE_SIZE) }, [search, sortKey, belowGoalOnly, teamFilter, layout])

  const selectStyle = { background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23', outline: 'none' }

  return (
    <div className={`panel-push ${panelScore ? 'is-open' : ''}`}>
    <div className="max-w-5xl mx-auto px-4 pt-10 pb-16">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>Agents</h1>
          <p className="text-sm mt-0.5 flex items-center" style={{ color: 'rgba(26,30,35,.6)' }}>
            Track individual agent performance<ScoreInfoPopover rubric={rubric} />
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {/* Balanced toolbar — Import/Assign are visible outlined peers; Add Agent
                stays the filled primary but at the same compact size. */}
            <button onClick={() => setShowImportModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF' }}>
              Import from Gorgias
            </button>
            <button onClick={() => setShowAssignModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF' }}>
              Assign Teams
            </button>
            <button onClick={() => setShowAddModal(true)} className="g-btn-primary text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
              + Add Agent
            </button>
          </div>
        )}
      </div>

      {/* Roster summary */}
      {agents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryTile label={teamFilter === 'all' ? 'Agents' : 'In team'} value={summary.count} />
          <SummaryTile label="Avg score" value={summary.avg != null ? summary.avg.toFixed(1) : '—'} color={gradeColor(summary.avg, vt)} />
          <SummaryTile label="Below goal" value={summary.below} color={summary.below > 0 ? '#D14B3D' : '#2F8F5B'} />
          <SummaryTile label="Unacknowledged" value={summary.unack} color={summary.unack > 0 ? '#C8841E' : '#1A1E23'} />
        </div>
      )}

      {/* Controls: search · sort · below-goal */}
      {agents.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: search ? '#FF9780' : 'rgba(26,30,35,.45)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search agents by name or email…"
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none g-input"
              style={{ border: `1px solid ${search ? '#FF9780' : '#E1DCD7'}` }} />
          </div>
          <Dropdown value={sortKey} onChange={setSortKey} width={170}
            options={SORT_OPTIONS.map(o => ({ value: o.id, label: `Sort: ${o.label}` }))} />
          <button onClick={() => setBelowGoalOnly(v => !v)}
            className="text-xs px-3 py-2 rounded-lg border transition-all font-medium whitespace-nowrap"
            style={belowGoalOnly
              ? { color: '#D14B3D', background: '#FEF6F4', borderColor: '#F4DDD7' }
              : { color: 'rgba(26,30,35,.72)', background: '#FFFFFF', borderColor: '#E7E3DF' }}>
            Below goal
          </button>
          {/* Layout toggle — Cards vs compact List */}
          <Segmented options={[{ id: 'cards', label: 'Cards' }, { id: 'list', label: 'List' }]}
            value={layout} onChange={setLayoutOverride} segWidth={60} fontPx={12} padY={6} />
        </div>
      )}

      {teams.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {['all', ...teams.map(t => t.id)].map(id => {
            const t = teams.find(x => x.id === id)
            const active = teamFilter === id
            return (
              <button key={id} onClick={() => setTeamFilter(id)}
                className="text-xs px-3 py-1.5 rounded-full border transition-all"
                style={active
                  ? { background: '#FFEAE6', borderColor: '#FFEAE6', color: '#B84A2E' }
                  : { background: '#FFFFFF', borderColor: '#E7E3DF', color: 'rgba(26,30,35,.72)' }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background='#F6F2EF' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background='#FFFFFF' }}
              >
                {id === 'all' ? 'All' : t?.name}
              </button>
            )
          })}
        </div>
      )}

      {dataLoading && agents.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="skeleton-bar" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div className="flex-1 flex flex-col gap-2">
                  <span className="skeleton-bar" style={{ width: '50%' }} />
                  <span className="skeleton-bar" style={{ width: '70%' }} />
                </div>
              </div>
              <span className="skeleton-bar mb-3" style={{ width: '100%' }} />
              <span className="skeleton-bar" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'rgba(26,30,35,.5)' }}>
          <p className="text-4xl mb-3">🧑‍💻</p>
          <p className="text-sm">No agents yet. Add one to start tracking performance.</p>
        </div>
      ) : view.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'rgba(26,30,35,.5)' }}>
          <p className="text-sm">No agents match {belowGoalOnly ? 'the “below goal” filter' : 'your search'}.</p>
        </div>
      ) : (
        <>
          {layout === 'list' ? (
            <div className="flex flex-col gap-2">
              {/* Column headers */}
              <div className="grid items-center gap-3 px-3 mb-1" style={{ gridTemplateColumns: agentRowCols(canEdit) }}>
                <span style={agentColLabel}>Agent</span>
                <span style={agentColLabel}>Team</span>
                <span style={agentColLabel} className="text-right" title={`Agent's average across all scored tickets. ${scoreHelp}`}>Avg</span>
                <span style={agentColLabel} className="text-right" title="Share of scored tickets that passed">Pass</span>
                <span style={agentColLabel} className="text-right" title="Number of tickets scored">Tickets</span>
                {canEdit && <span />}
              </div>
              {paged.map((stat, i) => (
                <div key={stat.agent.id} className="stagger-item" style={{ '--i': i }}>
                  <AgentRow stat={stat}
                    thresholds={vt}
                    onOpen={openHistory}
                    onEditAgent={setEditAgent}
                    onDelete={handleDeleteAgent}
                    canEdit={canEdit} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {paged.map((stat, i) => (
                <div key={stat.agent.id} className="stagger-item" style={{ '--i': i }}>
                <AgentCard stat={stat}
                  team={stat.team}
                  profiles={profiles}
                  thresholds={vt}
                  onEdit={handleEditAgent} onDelete={handleDeleteAgent} onViewScore={openPanel}
                  onViewAll={openHistory} canEdit={canEdit} scoreHelp={scoreHelp} />
                </div>
              ))}
            </div>
          )}

          {visibleCount < view.length && (
            <div className="flex justify-center mt-4">
              <button onClick={() => setVisibleCount(c => c + AGENT_PAGE_SIZE)}
                className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF' }}>
                Show more · {Math.min(AGENT_PAGE_SIZE, view.length - visibleCount)} of {view.length - visibleCount} remaining
              </button>
            </div>
          )}
        </>
      )}

      {showAddModal    && <AddAgentModal teams={teams} onSave={handleAddAgent} onClose={() => setShowAddModal(false)} />}
      {showImportModal && <ImportGorgiasModal agents={agents} teams={teams} onSave={handleImport} onClose={() => { setShowImportModal(false); toast.success('Agents imported') }} />}
      {showAssignModal && <AssignTeamsModal agents={agents} teams={teams} onSave={handleAssign} onClose={() => { setShowAssignModal(false); toast.success('Teams updated') }} />}
      {editAgent && <EditAgentModal agent={editAgent} profiles={profiles} onSave={updateAgent} onClose={() => setEditAgent(null)} />}
      {historyAgent && (() => {
        const stat = agentStats.find(x => x.agent.id === historyAgent.id)
        return (
          <AgentHistoryModal
            agent={historyAgent}
            scores={stat?.scores || []}
            avg={stat?.avg ?? null}
            thresholds={vt}
            onViewScore={viewScoreFromHistory}
            onClose={() => setHistoryAgent(null)} />
        )
      })()}
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
  )
}
