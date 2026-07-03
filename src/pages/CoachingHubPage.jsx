import { useMemo, useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from '../context/NavigationContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { gradeColor } from '../lib/verdict'
import SessionView from '../components/coaching/SessionView'

/**
 * Coaching hub — reviewer-facing "opportunities feed" (concept 1a, adapted).
 *
 * Opportunities are derived client-side from scoreHistory: for each agent and
 * rubric criterion we average the AI/reviewer scores across their scored
 * tickets. Low averages over multiple tickets become issues; high ones become
 * strengths — each with the real tickets as evidence. No backend needed.
 *
 * Session actions (start/plan/log) have no data model yet — stubbed with
 * toasts until coaching sessions land.
 */

const ink = '#1A1E23'
const aiGradient = 'linear-gradient(135deg,#9747FF,#CB55EF)'

// ── Icons (lucide-style, hand-rolled — no dependency) ──
const icon = (children, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const SparklesIcon = ({ size = 17 }) => icon(<>
  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  <path d="M20 3v4" /><path d="M22 5h-4" />
</>, size)
const PlusIcon = () => icon(<><path d="M5 12h14" /><path d="M12 5v14" /></>)
const HistoryIcon = () => icon(<>
  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
  <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
</>)
const SessionIcon = ({ size = 15 }) => icon(<>
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  <path d="M14.8 7.5a1.84 1.84 0 0 0-2.6 0l-.2.3-.3-.3a1.84 1.84 0 1 0-2.4 2.8L12 13l2.7-2.7c.9-.9.8-2.1.1-2.8" />
</>, size)
const MegaphoneIcon = ({ size = 15 }) => icon(<>
  <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
</>, size)

const S = {
  card: {
    background: '#fff',
    border: '1px solid #EEEEEE',
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)',
  },
  chip: (active) => ({
    font: "500 12px/1 'Roboto'",
    color: active ? '#fff' : 'rgba(26,30,35,.65)',
    background: active ? ink : '#fff',
    border: active ? '1px solid #1A1E23' : '1px solid #EEEEEE',
    padding: '8px 14px',
    borderRadius: 9999,
    cursor: 'pointer',
  }),
  metaPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    font: "500 11px/1 'Roboto'",
    color: 'rgba(26,30,35,.7)',
    background: '#FBF7F3',
    border: '1px solid #F0ECE9',
    padding: '6px 10px',
    borderRadius: 9999,
  },
  ticketPill: {
    font: "500 11px/1 'Roboto'",
    color: '#B84A2E',
    background: '#fff',
    border: '1px solid #F4DDD7',
    padding: '6px 10px',
    borderRadius: 9999,
    cursor: 'pointer',
  },
  aiAvatar: (size) => ({
    width: size,
    height: size,
    flex: 'none',
    borderRadius: 9999,
    background: aiGradient,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px',
    background: '#FF9780', border: 'none', borderRadius: 8,
    font: "500 14px/1 'Roboto'", color: ink, cursor: 'pointer',
  },
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px',
    background: 'transparent', border: `1px solid ${ink}`, borderRadius: 8,
    font: "500 14px/1 'Roboto'", color: ink, cursor: 'pointer',
  },
}

const AVATAR_BGS = ['#FFD2C9', '#F3D48A', '#D9C9F2', '#BFE3CD', '#E8E3E1', '#C9E2F2']

function Avatar({ initial, bg, size = 34 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 9999, background: bg, color: ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      font: `600 ${Math.round(size * 0.38)}px/1 'Inter Tight'`, flex: 'none',
    }}>{initial}</div>
  )
}

function relFound(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return 'Found today'
  if (days === 1) return 'Found yesterday'
  return `Found ${days} days ago`
}

// Dismissals survive reloads; the underlying pattern re-appears only if new
// tickets change the criterion's ticket set.
const DISMISS_KEY = 'gorgias_qa_coaching_dismissed'
const loadDismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || [] } catch { return [] } }

function OpportunityCard({ opp, onStart, onStub, onOpenTicket }) {
  const isStrength = opp.kind === 'strength'
  return (
    <div style={{ ...S.card, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <span style={S.aiAvatar(38)}><SparklesIcon /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ font: "600 15px/1.3 'Inter Tight'", color: ink }}>{opp.title}</span>
            <span style={{ font: "500 10px/1 'Roboto'", color: opp.tag.color, background: opp.tag.bg, padding: '4px 8px', borderRadius: 9999 }}>
              {opp.tag.label}
            </span>
          </div>
          <div style={{ font: "400 13px/1.55 'Roboto'", color: 'rgba(26,30,35,.65)', marginTop: 7 }}>
            {opp.summary}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={S.metaPill}>
              <Avatar initial={opp.agentInitial} bg={opp.agentBg} size={18} />
              {opp.agentName}
            </span>
            <span style={{ ...S.metaPill, gap: 0 }}>{opp.dimension}</span>
            {opp.tickets.map((t) => (
              <span key={t.scoreId} style={S.ticketPill} onClick={() => onOpenTicket(t.scoreId)} title="Open the scored ticket">
                #{t.ticketId}
              </span>
            ))}
            {opp.moreTickets > 0 && (
              <span style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.45)' }}>+{opp.moreTickets} more</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid #F4F0ED' }}>
        {isStrength ? (
          <button style={{ ...S.btnSecondary, height: 36, padding: '0 15px', font: "500 13px/1 'Roboto'" }} onClick={onStub}>
            <MegaphoneIcon />
            Share with team
          </button>
        ) : (
          <>
            <button style={{ ...S.btnPrimary, height: 36, padding: '0 15px', font: "500 13px/1 'Roboto'" }} onClick={onStart}>
              <SessionIcon />
              Start session
            </button>
            <button
              style={{ height: 36, padding: '0 15px', background: 'transparent', border: '1px solid #E7DED6', borderRadius: 8, font: "500 13px/1 'Roboto'", color: 'rgba(26,30,35,.7)', cursor: 'pointer' }}
              onClick={onStub}>
              Add to plan
            </button>
          </>
        )}
        <button
          style={{ height: 36, padding: '0 15px', background: 'transparent', border: 'none', font: "500 13px/1 'Roboto'", color: 'rgba(26,30,35,.45)', cursor: 'pointer' }}
          onClick={opp.onDismiss}>
          Dismiss
        </button>
        <span style={{ marginLeft: 'auto', font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.4)' }}>
          {opp.foundAt}
        </span>
      </div>
    </div>
  )
}

export default function CoachingHubPage() {
  const { agents, scoreHistory, rubric, openScore, notifyAgents } = useApp()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [agentFilter, setAgentFilter] = useState(null)
  const [dismissed, setDismissed] = useState(loadDismissed)

  const dismiss = (id) => {
    setDismissed(d => {
      const next = [...d, id]
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // ── Sessions (coaching_sessions table) ──
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)  // row-shaped draft/loaded session
  const [logOpen, setLogOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('coaching_sessions').select('*')
      .order('created_at', { ascending: false }).limit(100)
    if (error) { console.error('coaching sessions fetch failed:', error); return }
    setSessions(data || [])
  }, [])
  useEffect(() => { fetchSessions() }, [fetchSessions])

  const openTicket = (scoreId) => {
    const s = scoreHistory.find(x => x.id === scoreId)
    if (!s) return
    openScore({
      ...s.fullScore,
      scoreId: s.id, reviewerNote: s.notes,
      overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore,
      overrideNote: s.overrideNote, overrideAt: s.overrideAt,
      disputed: s.disputed, disputeNote: s.disputeNote, disputeAt: s.disputeAt,
      acknowledged: s.acknowledged, acknowledgedAt: s.acknowledgedAt,
    })
  }

  // ── Derive opportunities: per agent × criterion averages across scored tickets ──
  const { opportunities, railAgents, weeklyInsight } = useMemo(() => {
    const dims = rubric?.dimensions || []
    const opps = []
    const agentMeta = {}

    agents.forEach((a, ai) => {
      const initial = (a.name || '?')[0].toUpperCase()
      const bg = AVATAR_BGS[ai % AVATAR_BGS.length]
      const theirScores = scoreHistory.filter(s => s.agentIds?.includes(a.id))
      const avgOverall = theirScores.length
        ? theirScores.reduce((sum, s) => sum + (Number(s.effectiveScore) || 0), 0) / theirScores.length
        : null
      agentMeta[a.id] = { agent: a, initial, bg, avgOverall, ticketCount: theirScores.length, openIssues: 0, strengths: 0 }
      if (!theirScores.length) return
      const firstName = (a.name || 'This agent').split(' ')[0]

      for (const d of dims) {
        for (const c of d.criteria || []) {
          const rows = theirScores
            .map(s => ({ s, v: Number(s.fullScore?.scores?.[d.id]?.[c.id]?.score) }))
            .filter(x => Number.isFinite(x.v))
          // A re-scored ticket has multiple score rows — count each ticket once,
          // using its latest score, so superseded grades don't skew the average
          const byTicket = new Map()
          for (const x of rows) {
            const prev = byTicket.get(x.s.ticketId)
            if (!prev || x.s.scoredAt > prev.s.scoredAt) byTicket.set(x.s.ticketId, x)
          }
          const cells = [...byTicket.values()]
          if (cells.length < 2) continue
          const avg = cells.reduce((sum, x) => sum + x.v, 0) / cells.length
          const latest = Math.max(...cells.map(x => x.s.scoredAt))
          const sorted = [...cells].sort((x, y) => x.v - y.v || y.s.scoredAt - x.s.scoredAt)
          const sortedBest = [...cells].sort((x, y) => y.v - x.v || y.s.scoredAt - x.s.scoredAt)
          const base = {
            agentId: a.id, agentName: a.name, agentInitial: initial, agentBg: bg,
            dimension: d.name, foundAt: relFound(latest),
          }
          if (avg <= 2.6) {
            const id = `${a.id}:${c.id}:issue`
            opps.push({
              ...base, id, kind: 'issue',
              title: `${c.name} needs attention`,
              tag: avg <= 1.9
                ? { label: 'High impact', color: '#B84A2E', bg: '#FFEAE6' }
                : { label: 'Recurring', color: '#C8841E', bg: '#FBEBD3' },
              summary: `${firstName} averages ${avg.toFixed(1)}/5 on ${c.name} across ${sorted.length} scored ticket${sorted.length !== 1 ? 's' : ''} (${d.name}, ${d.weight}% of the grade). The lowest-scoring tickets are linked below.`,
              tickets: sorted.slice(0, 3).map(x => ({ scoreId: x.s.id, ticketId: x.s.ticketId })),
              moreTickets: Math.max(0, sorted.length - 3),
              severity: avg, latest,
            })
          } else if (avg >= 4.6) {
            const id = `${a.id}:${c.id}:strength`
            opps.push({
              ...base, id, kind: 'strength',
              title: `Strong ${c.name.toLowerCase()} from ${firstName}`,
              tag: { label: 'Strength', color: '#2F8F5B', bg: '#E6F4EC' },
              summary: `${firstName} averages ${avg.toFixed(1)}/5 on ${c.name} across ${sortedBest.length} ticket${sortedBest.length !== 1 ? 's' : ''} — good material to share at the next team huddle.`,
              tickets: sortedBest.slice(0, 2).map(x => ({ scoreId: x.s.id, ticketId: x.s.ticketId })),
              moreTickets: Math.max(0, sortedBest.length - 2),
              severity: 10 - avg, latest,
            })
          }
        }
      }
    })

    // Issues first (worst average first), then strengths; count per agent for the rail
    opps.sort((a, b) => (a.kind === b.kind ? a.severity - b.severity : a.kind === 'issue' ? -1 : 1))
    for (const o of opps) {
      if (o.kind === 'issue') agentMeta[o.agentId].openIssues++
      else agentMeta[o.agentId].strengths++
    }

    const rail = Object.values(agentMeta)
      .filter(m => m.ticketCount > 0)
      .sort((x, y) => (x.avgOverall ?? 101) - (y.avgOverall ?? 101))
      .slice(0, 6)

    // Weakest dimension across the whole team
    let insight = 'Not enough scored tickets yet — insights appear as reviews accumulate.'
    const dimAvgs = dims.map(d => {
      const vals = scoreHistory.map(s => Number(s.fullScore?.scores?.[d.id]?.dimension_average)).filter(Number.isFinite)
      return { d, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length }
    }).filter(x => x.avg != null)
    if (dimAvgs.length && scoreHistory.length >= 3) {
      const weakest = dimAvgs.reduce((a, b) => (a.avg <= b.avg ? a : b))
      insight = `${weakest.d.name} is the weakest dimension across the team — averaging ${weakest.avg.toFixed(1)}/5 over ${weakest.n} scored tickets at ${weakest.d.weight}% of the grade. Worth a team-wide topic before individual sessions.`
    }

    return { opportunities: opps, railAgents: rail, weeklyInsight: insight }
  }, [agents, scoreHistory, rubric])

  const visible = opportunities.filter(o => !dismissed.includes(o.id) && (!agentFilter || o.agentId === agentFilter))
  const chipAgents = agents.filter(a => opportunities.some(o => o.agentId === a.id && !dismissed.includes(o.id)))

  // ── Session drafting (client-side "AI draft" from real score data) ──
  const agentStatsFor = (agentId) => {
    const agent = agents.find(a => a.id === agentId)
    const cutoff = Date.now() - 30 * 86400000
    const theirs = scoreHistory.filter(s => s.agentIds?.includes(agentId) && s.scoredAt >= cutoff)
    if (!theirs.length) return null
    const avg = theirs.reduce((sum, s) => sum + (Number(s.effectiveScore) || 0), 0) / theirs.length
    const passPct = Math.round(theirs.filter(s => s.effectiveVerdict === 'PASS').length / theirs.length * 100)
    const dimensions = (rubric?.dimensions || []).map(d => {
      const vals = theirs.map(s => Number(s.fullScore?.scores?.[d.id]?.dimension_average)).filter(Number.isFinite)
      if (!vals.length) return null
      const score = vals.reduce((a, b) => a + b, 0) / vals.length
      return { name: d.name, score, pct: Math.round(score / 5 * 100), color: gradeColor(score * 20, rubric?.verdict_thresholds) }
    }).filter(Boolean)
    return {
      label: `${(agent?.name || 'Agent').split(' ')[0]} · last 30 days`,
      avgScore: Math.round(avg),
      avgScoreColor: gradeColor(avg, rubric?.verdict_thresholds),
      sub: `avg score · ${passPct}% pass`,
      dimensions,
    }
  }

  const trendSummary = (agentId) => {
    const theirs = scoreHistory.filter(s => s.agentIds?.includes(agentId)).sort((a, b) => a.scoredAt - b.scoredAt)
    if (theirs.length < 2) return null
    const half = Math.floor(theirs.length / 2)
    const avgOf = (arr) => Math.round(arr.reduce((sum, s) => sum + (Number(s.effectiveScore) || 0), 0) / arr.length)
    const before = avgOf(theirs.slice(0, half)), after = avgOf(theirs.slice(half))
    const stats = agentStatsFor(agentId)
    const weakest = stats?.dimensions?.length ? stats.dimensions.reduce((a, b) => (a.score <= b.score ? a : b)) : null
    const trendWord = after < before ? 'slipped' : after > before ? 'climbed' : 'held at'
    return `Score ${trendWord} ${before} → ${after} across ${theirs.length} scored tickets.`
      + (weakest ? ` Most point loss traces to **${weakest.name.toLowerCase()}** (${weakest.score.toFixed(1)}/5 over the last 30 days).` : '')
  }

  const draftFromOpportunity = (opp) => {
    const firstName = opp.agentName.split(' ')[0]
    const agenda = opp.kind === 'strength'
      ? [
          { id: crypto.randomUUID(), kind: 'strength', title: `Recognize what's working: ${opp.dimension.toLowerCase()}`, detail: opp.summary, tickets: opp.tickets },
          { id: crypto.randomUUID(), kind: 'strength', title: 'How to share this with the team', detail: `Pick one ticket to walk through at the next huddle — let ${firstName} present it.`, tickets: [] },
        ]
      : [
          { id: crypto.randomUUID(), kind: 'issue', title: `Walk through the low-scoring tickets together`, detail: `Open each linked ticket at the graded reply and talk through what the rubric expected.`, tickets: opp.tickets },
          { id: crypto.randomUUID(), kind: 'issue', title: `Agree on the habit going forward`, detail: `One concrete check ${firstName} will do before sending — write it as an action item below.`, tickets: [] },
        ]
    const strength = opportunities.find(o => o.agentId === opp.agentId && o.kind === 'strength' && o.id !== opp.id)
    if (opp.kind !== 'strength' && strength) {
      agenda.push({ id: crypto.randomUUID(), kind: 'strength', title: `Recognize what's working: ${strength.dimension.toLowerCase()}`, detail: strength.summary, tickets: strength.tickets.slice(0, 1) })
    }
    return agenda
  }

  const evidenceFor = (tickets) => tickets.map(t => {
    const s = scoreHistory.find(x => x.id === t.scoreId)
    if (!s) return null
    return {
      scoreId: s.id, ticketId: s.ticketId,
      score: Math.round(Number(s.effectiveScore) || 0),
      status: s.effectiveVerdict === 'FAIL' ? 'fail' : s.effectiveVerdict === 'PASS' ? 'pass' : 'review',
      subject: s.fullScore?.ticket_subject || '',
    }
  }).filter(Boolean)

  const startSession = (opp) => {
    setActiveSession({
      id: null,
      agent_id: opp.agentId,
      status: 'draft',
      origin: `Ad-hoc · from opportunity “${opp.title}”`,
      opportunity_key: opp.id,
      ai_summary: trendSummary(opp.agentId),
      agenda: draftFromOpportunity(opp),
      agenda_source: `drafted from ${opp.tickets.length + opp.moreTickets} scored tickets`,
      notes: '',
      action_items: [],
      evidence: evidenceFor(opp.tickets),
      visible_to_agent: true,
    })
  }

  const startBlankSession = (agent) => {
    setPickerOpen(false)
    setActiveSession({
      id: null, agent_id: agent.id, status: 'draft', origin: 'Ad-hoc session',
      opportunity_key: null, ai_summary: trendSummary(agent.id),
      agenda: [], agenda_source: null, notes: '', action_items: [], evidence: [],
      visible_to_agent: true,
    })
  }

  // silent: persist without toasts/state churn — used to save edits right
  // before navigation unmounts the session view. Returns the saved row or null.
  const persistSession = async (patch, complete, silent = false) => {
    const merged = { ...activeSession, ...patch }
    setSaving(true)
    const row = {
      agent_id: merged.agent_id, status: complete ? 'completed' : 'draft',
      origin: merged.origin, opportunity_key: merged.opportunity_key,
      ai_summary: merged.ai_summary, agenda: merged.agenda, notes: merged.notes,
      action_items: merged.action_items, evidence: merged.evidence,
      visible_to_agent: merged.visible_to_agent,
      updated_at: new Date().toISOString(),
      // Creator is stamped once — later editors shouldn't take over the row
      ...(merged.id ? {} : { created_by: user?.id, created_by_name: profile?.name || null }),
      ...(complete ? { completed_at: new Date().toISOString() } : {}),
    }
    const q = merged.id
      ? supabase.from('coaching_sessions').update(row).eq('id', merged.id).select().single()
      : supabase.from('coaching_sessions').insert(row).select().single()
    const { data, error } = await q
    setSaving(false)
    if (error) {
      console.error('coaching session save failed:', error)
      toast.error('Failed to save session — has the coaching_sessions migration been run?')
      return null
    }
    fetchSessions()
    if (complete) {
      if (merged.visible_to_agent) {
        notifyAgents([merged.agent_id], 'coaching_session',
          `${profile?.name || 'Your lead'} shared a coaching session with you`)
      }
      if (merged.opportunity_key) dismiss(merged.opportunity_key)
      toast.success('Session completed')
      setActiveSession(null)
    } else if (!silent) {
      toast.success('Draft saved')
      setActiveSession({ ...merged, id: data.id, status: data.status })
    }
    return data
  }

  // Opening a score swaps the whole routed page for the score view (see
  // MainContent in App.jsx), unmounting this page and the session editor. So
  // before navigating: save the draft, stash its id, and restore it on remount.
  const RESUME_KEY = 'gorgias_qa_coaching_resume'
  const openTicketFromSession = async (t, patch) => {
    if (!t.scoreId || !scoreHistory.some(x => x.id === t.scoreId)) return
    let id = activeSession.id
    if (activeSession.status !== 'completed') {
      const saved = await persistSession(patch, false, true)
      if (!saved) return  // save failed — keep the editor on screen
      id = saved.id
    }
    try { sessionStorage.setItem(RESUME_KEY, id) } catch { /* ignore */ }
    openTicket(t.scoreId)
  }
  const openScorecardFromSession = async (patch) => {
    if (activeSession.status !== 'completed') {
      const saved = await persistSession(patch, false)
      if (!saved) return
    }
    navigate('agents')
  }
  useEffect(() => {
    if (activeSession || !sessions.length) return
    let id = null
    try { id = sessionStorage.getItem(RESUME_KEY) } catch { /* ignore */ }
    if (!id) return
    try { sessionStorage.removeItem(RESUME_KEY) } catch { /* ignore */ }
    const row = sessions.find(s => s.id === id)
    if (row) setActiveSession(row)
  }, [sessions]) // eslint-disable-line react-hooks/exhaustive-deps

  const openSessionRow = (row) => { setLogOpen(false); setActiveSession(row) }

  // Latest completed session per agent — the rail's "coached X ago"
  const lastCoached = useMemo(() => {
    const m = {}
    for (const s of sessions) {
      if (s.status !== 'completed') continue
      const ts = new Date(s.completed_at || s.created_at).getTime()
      if (!m[s.agent_id] || ts > m[s.agent_id]) m[s.agent_id] = ts
    }
    return m
  }, [sessions])
  const coachedLabel = (agentId) => {
    const ts = lastCoached[agentId]
    if (!ts) return 'never coached'
    const days = Math.floor((Date.now() - ts) / 86400000)
    if (days <= 0) return 'coached today'
    if (days < 7) return `coached ${days}d ago`
    return `coached ${Math.floor(days / 7)}w ago`
  }

  // ── Session view takes over the page when active ──
  if (activeSession) {
    const agent = agents.find(a => a.id === activeSession.agent_id)
    const ai = agents.findIndex(a => a.id === activeSession.agent_id)
    const originOpp = activeSession.opportunity_key
      ? opportunities.find(o => o.id === activeSession.opportunity_key)
      : null
    return (
      <div className="max-w-6xl mx-auto px-8 pt-8 pb-14 panel-push">
        <SessionView
          session={activeSession}
          agentName={agent?.name || 'Agent'}
          agentInitial={(agent?.name || '?')[0].toUpperCase()}
          agentBg={AVATAR_BGS[Math.max(0, ai) % AVATAR_BGS.length]}
          agentStats={agentStatsFor(activeSession.agent_id)}
          readOnly={activeSession.status === 'completed'}
          saving={saving}
          onBack={() => setActiveSession(null)}
          onSaveDraft={(patch) => persistSession(patch, false)}
          onComplete={(patch) => persistSession(patch, true)}
          onRedraft={originOpp ? (() => draftFromOpportunity(originOpp)) : null}
          onOpenTicket={openTicketFromSession}
          onOpenScorecard={openScorecardFromSession}
        />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-8 pt-8 pb-14 panel-push">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <h1 style={{ font: "600 30px/1.1 'Inter Tight', sans-serif", letterSpacing: '-0.02em', color: ink, margin: 0 }}>Coaching</h1>
          <p style={{ font: "400 14px/1.5 'Roboto'", color: 'rgba(26,30,35,.6)', margin: '6px 0 0' }}>
            {visible.length} open {visible.length === 1 ? 'opportunity' : 'opportunities'} · found across {scoreHistory.length} scored tickets
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
          <button style={S.btnSecondary} onClick={() => setLogOpen(true)}>
            <HistoryIcon />
            Coaching log{sessions.length > 0 ? ` (${sessions.length})` : ''}
          </button>
          <button style={S.btnPrimary} onClick={() => setPickerOpen(o => !o)}>
            <PlusIcon />
            New session
          </button>
          {pickerOpen && (
            <div style={{ position: 'absolute', top: 46, right: 0, zIndex: 30, minWidth: 220, maxHeight: 280, overflowY: 'auto', ...S.card, padding: 6 }}>
              <p style={{ font: "600 10px/1 'Roboto'", letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(26,30,35,.45)', padding: '8px 10px 6px', margin: 0 }}>Session with…</p>
              {agents.map(a => (
                <button key={a.id} onClick={() => startBlankSession(a)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', font: "400 13px/1.2 'Roboto'", color: ink, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coaching log overlay */}
      {logOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
          style={{ background: 'rgba(26,30,35,0.35)', backdropFilter: 'blur(8px)' }} onClick={() => setLogOpen(false)}>
          <div className="rounded-2xl w-full max-w-lg max-h-[75vh] flex flex-col modal-enter" onClick={e => e.stopPropagation()}
            style={{ background: '#FFFFFF', border: '1px solid #EEEEEE' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EEEEEE' }}>
              <span style={{ font: "600 15px/1 'Inter Tight'", color: ink }}>Coaching log</span>
              <button onClick={() => setLogOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, color: 'rgba(26,30,35,.45)', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '10px 12px' }}>
              {sessions.length === 0 && (
                <p style={{ font: "400 13px/1.5 'Roboto'", color: 'rgba(26,30,35,.5)', textAlign: 'center', padding: '28px 0' }}>
                  No sessions yet — start one from an opportunity.
                </p>
              )}
              {sessions.map(s => {
                const a = agents.find(x => x.id === s.agent_id)
                const done = s.status === 'completed'
                return (
                  <button key={s.id} onClick={() => openSessionRow(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ font: "500 11px/1 'Roboto'", color: done ? '#2F8F5B' : '#B84A2E', background: done ? '#E6F4EC' : '#FFEAE6', padding: '5px 8px', borderRadius: 9999, flex: 'none', textTransform: 'capitalize' }}>
                      {s.status}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', font: "500 13px/1.3 'Roboto'", color: ink }}>{a?.name || 'Unknown agent'}</span>
                      <span style={{ display: 'block', font: "400 11px/1.3 'Roboto'", color: 'rgba(26,30,35,.5)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.origin || 'Ad-hoc session'}
                      </span>
                    </span>
                    <span style={{ font: "400 11px/1 'Roboto'", color: 'rgba(26,30,35,.45)', flex: 'none' }}>
                      {new Date(s.completed_at || s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Agent filter chips */}
      {chipAgents.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={S.chip(agentFilter === null)} onClick={() => setAgentFilter(null)}>All agents</span>
          {chipAgents.map(a => (
            <span key={a.id} style={S.chip(agentFilter === a.id)} onClick={() => setAgentFilter(a.id)}>{a.name}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(opp => (
            <OpportunityCard key={opp.id} opp={{ ...opp, onDismiss: () => dismiss(opp.id) }}
              onStart={() => startSession(opp)}
              onStub={() => toast.info('Plans and team sharing are coming soon')}
              onOpenTicket={openTicket} />
          ))}
          {visible.length === 0 && (
            <div style={{ ...S.card, padding: '40px 22px', textAlign: 'center', font: "400 13px/1.5 'Roboto'", color: 'rgba(26,30,35,.5)' }}>
              No open opportunities — new ones appear as tickets get scored.
            </div>
          )}
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...S.card, padding: 20 }}>
            <div style={{ font: "600 12px/1 'Roboto'", letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(26,30,35,.5)', marginBottom: 14 }}>
              Needs coaching first
            </div>
            {railAgents.map((m, i) => (
              <div key={m.agent.id}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: i === railAgents.length - 1 ? '10px 0 2px' : '10px 0', borderBottom: i === railAgents.length - 1 ? 'none' : '1px solid #F4F0ED' }}>
                <Avatar initial={m.initial} bg={m.bg} />
                <div style={{ flex: 1 }}>
                  <div style={{ font: "500 13px/1 'Roboto'", color: ink }}>{m.agent.name}</div>
                  <div style={{ font: "400 11px/1 'Roboto'", marginTop: 4, color: m.openIssues > 0 ? '#B84A2E' : m.strengths > 0 ? '#2F8F5B' : 'rgba(26,30,35,.5)' }}>
                    {m.openIssues > 0 ? `${m.openIssues} open · ${coachedLabel(m.agent.id)}`
                      : m.strengths > 0 ? `${m.strengths} strength${m.strengths > 1 ? 's' : ''} · ${coachedLabel(m.agent.id)}`
                      : `Nothing flagged · ${coachedLabel(m.agent.id)}`}
                  </div>
                </div>
                <span style={{ font: "600 14px/1 'Inter Tight'", color: gradeColor(m.avgOverall ?? 0, rubric?.verdict_thresholds) }}>
                  {m.avgOverall != null ? Math.round(m.avgOverall) : '—'}
                </span>
              </div>
            ))}
            {railAgents.length === 0 && (
              <p style={{ font: "400 12px/1.5 'Roboto'", color: 'rgba(26,30,35,.5)' }}>No scored agents yet.</p>
            )}
          </div>

          {/* AI weekly insight */}
          <div style={{ background: ink, borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={S.aiAvatar(26)}><SparklesIcon size={13} /></span>
              <span style={{ font: "600 13px/1 'Inter Tight'", color: '#fff' }}>This week in reviews</span>
            </div>
            <div style={{ font: "400 12.5px/1.6 'Roboto'", color: 'rgba(255,255,255,.75)' }}>
              {weeklyInsight}
            </div>
            <button
              style={{ marginTop: 14, height: 34, padding: '0 14px', background: 'transparent', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, font: "500 12px/1 'Roboto'", color: '#fff', cursor: 'pointer' }}
              onClick={() => toast.info('Team topics are coming soon')}>
              Turn into team topic
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
