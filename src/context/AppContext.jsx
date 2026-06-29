import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { startPrefetch } from '../lib/prefetch'

const AppContext = createContext(null)

// Map DB row → local score shape
// NOTE: dispute fields require this migration in Supabase:
//   ALTER TABLE scores ADD COLUMN IF NOT EXISTS disputed boolean DEFAULT false;
//   ALTER TABLE scores ADD COLUMN IF NOT EXISTS dispute_note text;
//   ALTER TABLE scores ADD COLUMN IF NOT EXISTS dispute_at timestamptz;
function dbToScore(row) {
  const overrideScore   = row.override_score   ?? null
  const overrideVerdict = row.override_verdict ?? null
  return {
    id:              row.id,
    ticketId:        row.ticket_id,
    verdict:         row.verdict,
    weightedScore:   row.weighted_score,
    // Effective values: use override when present, fall back to AI result
    effectiveScore:   overrideScore   ?? row.weighted_score,
    effectiveVerdict: overrideVerdict ?? row.verdict,
    agentIds:        row.agent_ids || [],
    scoredAt:        new Date(row.scored_at).getTime(),
    fullScore:       row.full_score,
    notes:           row.notes || '',
    overrideVerdict,
    overrideScore,
    overrideNote:    row.override_note  || '',
    overrideAt:      row.override_at    ? new Date(row.override_at).getTime() : null,
    disputed:        row.disputed       || false,
    disputeNote:     row.dispute_note   || '',
    disputeAt:       row.dispute_at     ? new Date(row.dispute_at).getTime() : null,
    acknowledged:    row.acknowledged   || false,
    acknowledgedAt:  row.acknowledged_at ? new Date(row.acknowledged_at).getTime() : null,
    claimedBy:       row.claimed_by      || null,
    claimedAt:       row.claimed_at      ? new Date(row.claimed_at).getTime() : null,
    reviewedBy:      row.reviewed_by     || null,
    reviewedAt:      row.reviewed_at     ? new Date(row.reviewed_at).getTime() : null,
  }
}

// Default rubric — mirrors rubric.py DEFAULT_RUBRIC, kept in sync
export const DEFAULT_RUBRIC = {
  dimensions: [
    {
      id: 'inquiry_resolution', name: 'Inquiry Resolution', weight: 50,
      criteria: [
        { id: 'core_inquiry_resolved',     name: 'Core Inquiry Resolution',   description: 'Does the agent fully address all customer questions, the root cause, and offer workarounds where applicable?\n- 5: All questions answered, root cause identified, limitations explained with workarounds offered, no roundabout answers\n- 4: Main inquiry resolved, minor gaps (e.g., one sub-question lightly addressed)\n- 3: Partially resolved — some questions unanswered or root cause not addressed\n- 2: Mostly missed the inquiry or provided incorrect/misleading info\n- 1: Failed to address the inquiry at all' },
        { id: 'troubleshooting_procedure', name: 'Troubleshooting Procedure', description: 'Did the agent follow proper troubleshooting steps and keep the client informed?\n- 5: Proper TS steps followed, client kept informed throughout, solution verified, all available tools used (KB, HC, Vitally, Loom, etc.)\n- 4: Good procedure with minor gaps (e.g., didn\'t share test ticket URL)\n- 3: Some steps followed but inconsistent or client left waiting without updates\n- 2: Poor procedure — jumped to conclusions, didn\'t verify solution, client uninformed\n- 1: No discernible troubleshooting procedure' },
        { id: 'forward_resolution',        name: 'Forward Resolution',        description: 'Did the agent empower the client to resolve future issues independently?\n- 5: Direct links to relevant HC articles/product pages, visual aids (screenshots/Loom), educational resources shared proactively\n- 4: Some resources shared but not fully tailored to the issue\n- 3: Minimal forward resolution — generic link or no link at all\n- 2: No educational value provided\n- 1: Agent left customer with no path forward' },
      ],
    },
    {
      id: 'internal_processes', name: 'Internal Processes', weight: 25,
      criteria: [
        { id: 'ticket_handling_procedure', name: 'Ticket Handling Procedure', description: 'Did the agent follow internal ticket handling guidelines?\n- 5: Proper escalation when needed, correct tagging/fields used, macros leveraged, documentation referenced, feedback passed on\n- 4: Mostly followed with minor gaps\n- 3: Some procedures followed but notable omissions\n- 2: Multiple procedural gaps — wrong escalation path, missing tags/fields\n- 1: Procedures not followed at all\n\nNote: If you cannot assess internal process adherence from the ticket content alone, score 3 (neutral) and note the limitation.' },
      ],
    },
    {
      id: 'customer_perception', name: 'Customer Perception', weight: 25,
      criteria: [
        { id: 'tone_professionalism',  name: 'Tone & Professionalism', description: 'How warm, empathetic, and professional was the agent throughout the interaction?\n- 5: Warm, empathetic, professional throughout — treats every interaction as an opportunity\n- 4: Generally professional with minor lapses\n- 3: Neutral — neither positive nor negative\n- 2: Somewhat cold, dismissive, or unprofessional\n- 1: Rude, disrespectful, or condescending' },
        { id: 'communication_clarity', name: 'Communication Clarity',  description: 'How clear, structured, and easy to follow were the agent\'s communications?\n- 5: Crystal clear, well-structured, easy to follow — instructions match the customer\'s level\n- 4: Generally clear with minor confusion\n- 3: Somewhat clear but could be significantly improved\n- 2: Confusing, poorly structured, or hard to follow\n- 1: Very unclear — customer would struggle to follow instructions' },
      ],
    },
  ],
  auto_fail_conditions: [
    { id: 'negative_account_billing_impact', name: 'Negative Account/Billing Impact', description: 'Changes/suggestions causing data loss, downtime, billing overages without warning (e.g., suggesting an auto-reply rule without warning about billing impact)' },
    { id: 'compliance_security_breach',      name: 'Compliance/Security Breach',      description: 'Sharing API keys, passwords, sensitive account info with unauthorized parties; not verifying customer identity before sharing account data; violating screen-recording protocols' },
    { id: 'harmful_incorrect_info',          name: 'Harmful/Incorrect Information',    description: 'Providing incorrect information that causes significant customer harm, financial loss, or public negative feedback (churn, public reviews)' },
    { id: 'communication_misconduct',        name: 'Communication Misconduct',         description: 'Profanity, discriminatory or offensive language, disclosing internal frustrations, blaming colleagues/the product to the customer' },
  ],
  verdict_thresholds: { pass: 80, needs_review: 60 },
  scoring_guidance: '',
}

export function AppProvider({ children }) {
  const { role, user } = useAuth()

  const [teams,        setTeams]        = useState([])
  const [agents,       setAgents]       = useState([])
  const [scoreHistory, setScoreHistory] = useState([])
  const [rubric,       setRubric]       = useState(DEFAULT_RUBRIC)
  const [dataLoading,  setDataLoading]  = useState(true)

  // ── Active overlay surface ───────────────────────────────────────────────────
  // Only one slide-in/modal surface should be open at a time across the app
  // (notification panel, settings modal, score detail panel). Each surface sets
  // this when it opens; the others watch it and close themselves.
  // Values: 'notifications' | 'settings' | 'score' | null
  const [activeOverlay, setActiveOverlay] = useState(null)

  // ── Score detail surface ─────────────────────────────────────────────────────
  // The single way to open a graded ticket. Everywhere except the review queue
  // renders this full-page (App swaps the routed content); the review queue uses
  // its own modal so reviewers stay in the queue. `opts.actions` enables the
  // work actions (mark reviewed / notify / re-score…) that My Queue needs.
  const [viewingScore, setViewingScore] = useState(null)   // { score, actions }
  const openScore  = useCallback((score, opts = {}) => {
    setViewingScore({ score, actions: !!opts.actions })
    setActiveOverlay('score')
  }, [])
  const closeScore = useCallback(() => {
    setViewingScore(null)
    setActiveOverlay(o => o === 'score' ? null : o)
  }, [])

  // ── Resolve the current user's agent record (agents only) ───────────────────
  const myAgentId = useMemo(
    () => role === 'agent' ? (agents.find(a => a.user_id === user?.id)?.id ?? null) : null,
    [role, agents, user]
  )

  // ── Agents only ever see their own scores; unknown agent → empty ────────────
  const visibleScoreHistory = useMemo(() => {
    if (role !== 'agent') return scoreHistory
    if (!myAgentId) return []
    return scoreHistory.filter(s => s.agentIds?.includes(myAgentId))
  }, [scoreHistory, role, myAgentId])

  // ── Initial load ────────────────────────────────────────────────────────────
  // Consume the queries kicked off at auth time (lib/prefetch) so they run in
  // parallel with the profile fetch rather than only after AppProvider mounts.
  // startPrefetch() is idempotent — if auth already fired it, we get the same
  // in-flight promises; otherwise it starts them now.
  useEffect(() => {
    const q = startPrefetch()
    Promise.all([
      q.teams.then(({ data }) => setTeams(data || [])),
      q.agents.then(({ data }) => setAgents(data || [])),
      q.scores.then(({ data }) => setScoreHistory((data || []).map(dbToScore))),
      q.rubric.then(({ data }) => { if (data?.config) setRubric(data.config) }),
    ]).finally(() => setDataLoading(false))
  }, [])

  // ── Live cross-reviewer sync ─────────────────────────────────────────────────
  // Merge score changes from other reviewers as they happen — claims/unclaims,
  // overrides, disputes, acknowledgements, and newly scored tickets. The local
  // optimistic update echoes back here too (idempotent replace by id).
  useEffect(() => {
    const channel = supabase.channel('scores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setScoreHistory(prev => prev.filter(s => s.id !== payload.old.id))
          return
        }
        const mapped = dbToScore(payload.new)
        setScoreHistory(prev => {
          const idx = prev.findIndex(s => s.id === mapped.id)
          if (idx === -1) return [mapped, ...prev]          // new score → newest first
          // Realtime can truncate/omit the large full_score jsonb — merge over the
          // existing row so an echo never wipes data we already hold (esp. fullScore).
          const existing = prev[idx]
          const merged = { ...existing, ...mapped, fullScore: mapped.fullScore ?? existing.fullScore }
          const next = [...prev]; next[idx] = merged; return next
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // ── Teams ──────────────────────────────────────────────────────────────────
  const addTeam = async (name) => {
    const { data, error } = await supabase
      .from('teams').insert({ name }).select().single()
    if (!error) setTeams(prev => [...prev, data])
    return data
  }

  const updateTeam = async (id, patch) => {
    const { data, error } = await supabase
      .from('teams').update(patch).eq('id', id).select().single()
    if (!error) setTeams(prev => prev.map(t => t.id === id ? data : t))
  }

  const deleteTeam = async (id) => {
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (!error) {
      setTeams(prev => prev.filter(t => t.id !== id))
      setAgents(prev => prev.map(a => a.team_id === id ? { ...a, team_id: null } : a))
    }
  }

  // ── Agents ─────────────────────────────────────────────────────────────────
  const addAgent = async (name, email, teamId, gorgiasUserId = null) => {
    const { data, error } = await supabase
      .from('agents')
      .insert({ name, email: email || null, team_id: teamId || null, gorgias_user_id: gorgiasUserId || null })
      .select().single()
    if (!error) setAgents(prev => [...prev, data])
    return data
  }

  const updateAgent = async (id, patch) => {
    const dbPatch = {}
    if (patch.name             !== undefined) dbPatch.name             = patch.name
    if (patch.email            !== undefined) dbPatch.email            = patch.email
    if (patch.teamId           !== undefined) dbPatch.team_id          = patch.teamId
    if (patch.gorgias_user_id  !== undefined) dbPatch.gorgias_user_id  = patch.gorgias_user_id
    // NOTE: goal_score requires: ALTER TABLE agents ADD COLUMN IF NOT EXISTS goal_score integer;
    if (patch.goal_score       !== undefined) dbPatch.goal_score       = patch.goal_score
    if (patch.notify_slack     !== undefined) dbPatch.notify_slack     = patch.notify_slack
    if (patch.user_id          !== undefined) dbPatch.user_id          = patch.user_id || null
    const { data, error } = await supabase
      .from('agents').update(dbPatch).eq('id', id).select().single()
    if (!error) setAgents(prev => prev.map(a => a.id === id ? data : a))
  }

  const deleteAgent = async (id) => {
    const { error } = await supabase.from('agents').delete().eq('id', id)
    if (!error) setAgents(prev => prev.filter(a => a.id !== id))
  }

  // ── Scores ─────────────────────────────────────────────────────────────────
  const addScore = async (scoreResult) => {
    const agentIds = []
    for (const sender of scoreResult.agent_senders || []) {
      const match = agents.find(a =>
        (sender.gorgias_user_id && a.gorgias_user_id && a.gorgias_user_id === sender.gorgias_user_id) ||
        (sender.email && a.email && a.email.toLowerCase() === sender.email.toLowerCase()) ||
        (sender.name  && a.name  && a.name.toLowerCase()  === sender.name.toLowerCase())
      )
      if (match && !agentIds.includes(match.id)) agentIds.push(match.id)
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('scores')
      .insert({
        ticket_id:      scoreResult.ticket_id,
        ticket_subject: scoreResult.ticket_subject || '',
        verdict:        scoreResult.verdict,
        weighted_score: scoreResult.weighted_score,
        agent_ids:      agentIds,
        full_score:     scoreResult,
        scored_by:      user?.id,
      })
      .select().single()

    if (error) {
      // Surface the failure — a swallowed insert error means a ticket looks
      // "scored" in the UI but never reaches the DB or the review queue.
      console.error('addScore: failed to persist score', error)
      return { error }
    }
    const entry = dbToScore(data)
    setScoreHistory(prev => {
      const filtered = prev.filter(s => s.ticketId !== scoreResult.ticket_id)
      return [entry, ...filtered].slice(0, 500)
    })
    return entry
  }

  const deleteScore = async (id) => {
    const { error } = await supabase.from('scores').delete().eq('id', id)
    if (!error) setScoreHistory(prev => prev.filter(s => s.id !== id))
    return !error
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  const notifyAgents = async (agentIds, type, message, scoreId = null) => {
    if (!agentIds?.length) return
    await supabase.from('notifications').insert(
      agentIds.map(agent_id => ({ agent_id, type, message, ...(scoreId ? { score_id: scoreId } : {}) }))
    )
  }

  const notifyAdmins = async (type, message, scoreId = null) => {
    const { data: admins } = await supabase
      .from('profiles').select('id').in('role', ['admin', 'lead'])
    if (!admins?.length) return
    await supabase.from('notifications').insert(
      admins.map(a => ({ user_id: a.id, type, message, ...(scoreId ? { score_id: scoreId } : {}) }))
    )
  }

  const updateScoreNote = async (id, note) => {
    const { error } = await supabase
      .from('scores').update({ notes: note }).eq('id', id)
    if (!error) {
      setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, notes: note } : s))
      const score = scoreHistory.find(s => s.id === id)
      if (score?.agentIds?.length) {
        notifyAgents(score.agentIds, 'reviewer_note',
          `A reviewer left a note on your score for ticket #${score.ticketId}`, id)
      }
    }
  }

  const flagScore = async (id, note) => {
    const { error } = await supabase.from('scores').update({
      disputed: true, dispute_note: note, dispute_at: new Date().toISOString(),
    }).eq('id', id)
    if (!error) {
      setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, disputed: true, disputeNote: note, disputeAt: Date.now() } : s))
      const score = scoreHistory.find(s => s.id === id)
      notifyAdmins('dispute_submitted',
        `An agent disputed a score for ticket #${score?.ticketId || id}`, id)
    }
    return !error
  }

  // ── Reviewer claims (My Queue) ───────────────────────────────────────────────
  const claimScore = async (id) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('scores').update({ claimed_by: user?.id, claimed_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error('claimScore failed:', error); return error }
    setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, claimedBy: user?.id, claimedAt: Date.now() } : s))
    return null
  }

  const unclaimScore = async (id) => {
    const { error } = await supabase.from('scores').update({ claimed_by: null, claimed_at: null }).eq('id', id)
    if (!error) setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, claimedBy: null, claimedAt: null } : s))
    return !error
  }

  // Mark a ticket reviewed (the reviewer finished with it) — also releases the
  // claim, since the work is done. Removes it from the review queue.
  const markReviewed = async (id) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('scores').update({
      reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
      claimed_by: null, claimed_at: null,
    }).eq('id', id)
    if (error) { console.error('markReviewed failed:', error); return error }
    setScoreHistory(prev => prev.map(s => s.id === id
      ? { ...s, reviewedBy: user?.id, reviewedAt: Date.now(), claimedBy: null, claimedAt: null } : s))
    return null
  }

  const reopenReview = async (id) => {
    const { error } = await supabase.from('scores').update({ reviewed_by: null, reviewed_at: null }).eq('id', id)
    if (!error) setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, reviewedBy: null, reviewedAt: null } : s))
    return !error
  }

  const acknowledgeScore = async (id) => {
    const { error } = await supabase.from('scores').update({
      acknowledged: true, acknowledged_at: new Date().toISOString(),
    }).eq('id', id)
    if (!error) setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, acknowledged: true, acknowledgedAt: Date.now() } : s))
    return !error
  }

  const clearDispute = async (id) => {
    const { error } = await supabase.from('scores').update({ disputed: false, dispute_note: null, dispute_at: null }).eq('id', id)
    if (!error) {
      setScoreHistory(prev => prev.map(s => s.id === id ? { ...s, disputed: false, disputeNote: '', disputeAt: null } : s))
      const score = scoreHistory.find(s => s.id === id)
      if (score?.agentIds?.length) {
        notifyAgents(score.agentIds, 'dispute_cleared',
          `Your dispute for ticket #${score.ticketId} has been reviewed and cleared`, id)
      }
    }
    return !error
  }

  const overrideScore = async (id, { verdict, score, note }) => {
    const { data: { user } } = await supabase.auth.getUser()
    const patch = {
      override_verdict: verdict,
      override_score:   score,
      override_note:    note,
      override_by:      user?.id,
      override_at:      new Date().toISOString(),
    }
    const { error } = await supabase.from('scores').update(patch).eq('id', id)
    if (!error) {
      setScoreHistory(prev => prev.map(s => s.id === id ? {
        ...s,
        overrideVerdict:  verdict,
        overrideScore:    score,
        overrideNote:     note,
        overrideAt:       Date.now(),
        effectiveVerdict: verdict,
        effectiveScore:   score,
      } : s))
      const s = scoreHistory.find(s => s.id === id)
      if (s?.agentIds?.length) {
        notifyAgents(s.agentIds, 'score_overridden',
          `Your score for ticket #${s.ticketId} was reviewed and overridden`, id)
      }
    }
  }

  // ── Rubric ─────────────────────────────────────────────────────────────────
  const updateRubric = async (config) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('rubric').upsert({
      id: 1, config, updated_by: user?.id, updated_at: new Date().toISOString(),
    })
    if (!error) setRubric(config)
    return !error
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  const getAgentScores = (agentId) =>
    scoreHistory.filter(s => s.agentIds?.includes(agentId))

  const getTeamScores = (teamId) => {
    const teamAgentIds = new Set(agents.filter(a => a.team_id === teamId).map(a => a.id))
    return scoreHistory.filter(s => s.agentIds?.some(id => teamAgentIds.has(id)))
  }

  const avgScore = (scores) =>
    scores.length ? +(scores.reduce((s, x) => s + x.effectiveScore, 0) / scores.length).toFixed(1) : null

  return (
    <AppContext.Provider value={{
      teams, agents, scoreHistory: visibleScoreHistory, rubric, dataLoading, myAgentId,
      activeOverlay, setActiveOverlay,
      viewingScore, openScore, closeScore,
      addTeam, updateTeam, deleteTeam,
      addAgent, updateAgent, deleteAgent,
      addScore, deleteScore, updateScoreNote, overrideScore, flagScore, clearDispute, acknowledgeScore,
      claimScore, unclaimScore, markReviewed, reopenReview,
      updateRubric,
      getAgentScores, getTeamScores, avgScore,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
