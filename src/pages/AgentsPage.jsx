import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { useToast } from '../components/Toast'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { scoreExplanation, ScoreInfoPopover } from '../components/ScoreInfo'
import { TrendChart } from '../components/TrendChart'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL } from '../lib/verdict'

const SORT_OPTIONS = [
  { id: 'avg',     label: 'Avg score' },
  { id: 'name',    label: 'Name' },
  { id: 'unack',   label: 'Unacknowledged' },
  { id: 'tickets', label: 'Tickets scored' },
]

const avgToColor = avg => avg == null ? '#888' : avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444'

const AGENT_PAGE_SIZE = 12  // rows/cards shown before "Show more"
const LIST_THRESHOLD  = 20  // auto-switch to compact list above this many agents

// Shared grid template for the compact list header + every row, so columns line up
const agentRowCols = (canEdit) => canEdit
  ? 'minmax(0,1fr) 120px 56px 64px 64px 132px'
  : 'minmax(0,1fr) 120px 56px 64px 64px'
const agentColLabel = { fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8c8c8' }

function GoalProgress({ avg, goal }) {
  if (!goal || avg == null) return null
  const pct     = Math.min(Math.round((avg / goal) * 100), 100)
  const reached = avg >= goal
  const close   = !reached && avg >= goal - 8
  const color   = reached ? '#10b981' : close ? '#f59e0b' : '#ef4444'
  // Desaturated fill — quiet by default, full-strength text carries the signal
  const fill    = reached ? 'rgba(16,185,129,0.55)' : close ? 'rgba(245,158,11,0.55)' : 'rgba(239,68,68,0.5)'

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: '#c8c8c8' }}>Score goal</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {avg.toFixed(1)} <span style={{ color: '#888' }}>/ {goal}</span>
          {reached && <span className="ml-1.5">✓</span>}
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: fill, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

function AgentHistoryModal({ agent, scores, avg, onViewScore, onClose }) {
  const sorted = useMemo(() => [...scores].sort((a, b) => b.scoredAt - a.scoredAt), [scores])
  const avgColor = avgToColor(avg)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col modal-enter" onClick={e=>e.stopPropagation()}
        style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          <div>
            <h2 className="text-white font-semibold">{agent.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs" style={{ color: '#c8c8c8' }}>{scores.length} ticket{scores.length !== 1 ? 's' : ''} scored</p>
              {avg != null && <span className="text-xs font-bold" style={{ color: avgColor }}>{avg.toFixed(1)} avg</span>}
              {agent.goal_score && avg != null && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: avg >= agent.goal_score ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.07)', color: avg >= agent.goal_score ? '#10b981' : '#888' }}>
                  Goal: {agent.goal_score}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-xs g-btn-ghost px-3 py-1.5">Close</button>
        </div>

        {/* 30-day trend */}
        {scores.length >= 2 && (
          <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-3" style={{ color: '#c8c8c8' }}>30-day score trend</p>
            <TrendChart scores={scores} />
          </div>
        )}
        {/* List */}
        <div className="overflow-y-auto flex-1 px-3 py-3 flex flex-col gap-1">
          {sorted.map(s => (
            <button key={s.id} onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all"
              style={{ border: '1px solid transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background='#161616'; e.currentTarget.style.borderColor='rgba(255,255,255,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='transparent' }}>
              <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="font-mono text-xs w-20 shrink-0 transition-colors"
                style={{ color: '#FF9780' }}
                onMouseEnter={e => e.target.style.textDecoration='underline'}
                onMouseLeave={e => e.target.style.textDecoration='none'}>
                #{s.ticketId}
              </a>
              <span className="text-xs flex-1 truncate" style={{ color: '#e8e8e8' }}>{s.fullScore?.ticket_subject || '—'}</span>
              <span className="text-xs tabular-nums shrink-0" style={{ color: '#c8c8c8' }}>{s.effectiveScore?.toFixed(0)}/100</span>
              <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: VERDICT_COLOR[s.effectiveVerdict], background: VERDICT_BG[s.effectiveVerdict] }}>
                {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
              </span>
              <span className="text-xs shrink-0 hidden sm:block" style={{ color: '#888' }}>
                {new Date(s.scoredAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Shared edit form — used inline in the card and inside the list-view edit modal
function AgentEditForm({ agent, profiles = [], onSave, onCancel }) {
  const [form, setForm] = useState({ name: agent.name, email: agent.email || '', gorgiasUserId: agent.gorgias_user_id ? String(agent.gorgias_user_id) : '', goalScore: agent.goal_score ? String(agent.goal_score) : '', userId: agent.user_id || '' })

  const save = () => {
    if (!form.name.trim()) return
    onSave(agent.id, {
      name: form.name.trim(),
      email: form.email.trim(),
      gorgias_user_id: form.gorgiasUserId ? parseInt(form.gorgiasUserId) : null,
      goal_score: form.goalScore ? parseInt(form.goalScore) : null,
      user_id: form.userId || null,
    })
    onCancel()
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input autoFocus placeholder="Agent name" value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        className="rounded-xl px-3 py-2 text-white text-sm g-input" style={{ border: '1px solid #FF9780' }} />
      <input placeholder="Email" value={form.email}
        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        className="rounded-xl px-3 py-2 text-sm g-input" />
      <div className="flex flex-col gap-1">
        <label className="text-xs" style={{ color: '#c8c8c8' }}>Gorgias ID <span style={{ color: '#888' }}>(read-only — set via import)</span></label>
        <input readOnly value={form.gorgiasUserId || '—'}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#888', cursor: 'default', outline: 'none' }} />
      </div>
      <input placeholder="Score goal (e.g. 85)" value={form.goalScore}
        onChange={e => setForm(f => ({ ...f, goalScore: e.target.value.replace(/\D/,'') }))}
        className="rounded-xl px-3 py-2 text-sm g-input" />
      <div className="flex flex-col gap-1">
        <label className="text-xs" style={{ color: '#c8c8c8' }}>Linked account</label>
        <select value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.1)', color: form.userId ? '#ccc' : '#888', outline: 'none' }}>
          <option value="">— Not linked —</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name || p.id} — {p.role}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="g-btn-primary text-xs px-3 py-1.5 rounded-lg">Save</button>
        <button onClick={onCancel} className="g-btn-ghost text-xs px-3 py-1.5">Cancel</button>
      </div>
    </div>
  )
}

function AgentCard({ stat, team, profiles = [], onEdit, onDelete, onViewScore, onViewAll, canEdit, scoreHelp }) {
  const { agent, scores, n, avg, pass, rev, fail, unack } = stat
  const [editing,       setEditing]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const avgColor = avgToColor(avg)
  const passRate = n ? Math.round((pass / n) * 100) : 0
  const passColor = passRate >= 80 ? '#10b981' : passRate >= 60 ? '#f59e0b' : '#ef4444'
  const recent = useMemo(() => scores.slice(0, 3), [scores])
  const recentCols = '92px 1fr 54px 56px' // Ticket · Subject · Score · Verdict

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      {editing ? (
        <div className="mb-4">
          <AgentEditForm agent={agent} profiles={profiles} onSave={onEdit} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: 'rgba(255,151,128,0.12)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.2)' }}>
              {agent.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <button onClick={onViewAll}
                className="text-left transition-colors"
                onMouseEnter={e=>e.currentTarget.querySelector('h3').style.color='#FF9780'}
                onMouseLeave={e=>e.currentTarget.querySelector('h3').style.color='#fff'}>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold transition-colors truncate">{agent.name}</h3>
                  {unack > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', lineHeight: 1 }}
                      title={`${unack} score${unack !== 1 ? 's' : ''} the agent hasn't acknowledged yet`}>
                      {unack}
                    </span>
                  )}
                </div>
              </button>
              {agent.email && <p className="text-xs mt-0.5 truncate" style={{ color: '#c8c8c8' }}>{agent.email}</p>}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {team && <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#FF9780', background: 'rgba(255,151,128,0.1)' }}>{team.name}</span>}
                <span className="text-xs inline-flex items-center gap-1" style={{ color: agent.user_id ? '#10b981' : '#888' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: agent.user_id ? '#10b981' : '#666' }} />
                  {agent.user_id ? 'Linked' : 'No account'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {avg != null
              ? <div className="flex items-baseline gap-1" title={`Agent's average across all scored tickets. ${scoreHelp}`}>
                  <span className="text-sm font-bold tabular-nums" style={{ color: avgColor }}>{avg.toFixed(1)}</span>
                  <span className="text-xs" style={{ color: '#888' }}>avg</span>
                </div>
              : <span className="text-xs" style={{ color: '#888' }}>No avg yet</span>}
            {canEdit && !confirmDelete && (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(true)} className="g-btn-ghost text-xs">Edit</button>
                <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: '#888' }}
                  onMouseEnter={e=>e.target.style.color='#ef4444'} onMouseLeave={e=>e.target.style.color='#888'}>Delete</button>
              </div>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#ef4444' }}>Delete?</span>
                <button onClick={() => onDelete(agent.id)} className="text-xs font-medium px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">No</button>
              </div>
            )}
          </div>
        </div>
      )}

      {!editing && (n > 0 ? (
        <>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: '#e8e8e8' }}>
              {n} scored
              <span className="ml-2 font-semibold tabular-nums" style={{ color: passColor }}>{passRate}% pass</span>
            </span>
            <span style={{ color: '#888' }}>{pass} pass · {rev} review · {fail} fail</span>
          </div>
          <GoalProgress avg={avg} goal={agent.goal_score} />
          <div className="mt-3">
            {/* Column headers — explain each field */}
            <div className="grid items-center gap-2 px-2 mb-1" style={{ gridTemplateColumns: recentCols }}>
              <span style={agentColLabel} title="Gorgias ticket ID — opens in Gorgias">Ticket</span>
              <span style={agentColLabel} title="Ticket subject">Subject</span>
              <span style={agentColLabel} className="text-right" title="QA score for this ticket (0–100)">Score</span>
              <span style={agentColLabel} className="text-center" title="Verdict — green = pass, amber = needs review, red = fail">Verdict</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {recent.map(s => (
                <button key={s.id}
                  className="grid items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-colors"
                  style={{ gridTemplateColumns: recentCols }}
                  onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                  onMouseEnter={e=>e.currentTarget.style.background='#161616'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-mono transition-colors truncate"
                    style={{ color: '#FF9780' }}
                    onMouseEnter={e => e.target.style.textDecoration='underline'}
                    onMouseLeave={e => e.target.style.textDecoration='none'}>
                    #{s.ticketId}
                  </a>
                  <span className="text-xs truncate" style={{ color: '#aaa' }}>{s.fullScore?.ticket_subject || '—'}</span>
                  <span className="text-xs tabular-nums text-right" style={{ color: '#c8c8c8' }} title="QA score for this ticket (0–100)">{s.effectiveScore?.toFixed(0)}/100</span>
                  <div className="justify-self-center w-2 h-2 rounded-full" style={{ background: VERDICT_COLOR[s.effectiveVerdict] || '#555' }}
                    title={VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict} />
                </button>
              ))}
            </div>
          </div>
          <button onClick={onViewAll} className="mt-2 text-xs w-full text-center py-1.5 rounded-lg transition-colors"
            style={{ color: '#FF9780' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,151,128,0.06)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            View all {n} ticket{n !== 1 ? 's' : ''} →
          </button>
        </>
      ) : <p className="text-xs" style={{ color: '#888' }}>No tickets scored yet</p>)}
    </div>
  )
}

function AddAgentModal({ teams, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', teamId: '', gorgiasUserId: '' })
  const save = () => { if (form.name.trim()) { onSave(form.name.trim(), form.email.trim(), form.teamId || null, form.gorgiasUserId ? parseInt(form.gorgiasUserId) : null); onClose() } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-sm modal-enter" onClick={e=>e.stopPropagation()}
        style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="text-white font-semibold mb-5">Add Agent</h2>
        <div className="flex flex-col gap-3">
          <input autoFocus placeholder="Full name *" value={form.name}
            onChange={e => setForm(f=>({...f, name:e.target.value}))}
            className="rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#444] g-input" />
          <input placeholder="Email" value={form.email}
            onChange={e => setForm(f=>({...f, email:e.target.value}))}
            className="rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#444] g-input" />
          <input placeholder="Gorgias user ID (number — for reliable matching)" value={form.gorgiasUserId}
            onChange={e => setForm(f=>({...f, gorgiasUserId:e.target.value.replace(/\D/,'')}))}
            className="rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#444] g-input" />
          <select value={form.teamId} onChange={e => setForm(f=>({...f, teamId:e.target.value}))}
            className="rounded-xl px-4 py-2.5 text-sm text-white g-input">
            <option value="">No team</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex gap-2 mt-2">
            <button onClick={save} className="flex-1 g-btn-primary text-sm font-medium py-2.5 rounded-xl">Add Agent</button>
            <button onClick={onClose} className="px-4 g-btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

function AssignTeamsModal({ agents, teams, onSave, onClose }) {
  // Local map of agentId → teamId (pre-filled from current assignments)
  const [assignments, setAssignments] = useState(() => {
    const map = {}
    agents.forEach(a => { map[a.id] = a.team_id || '' })
    return map
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const changed = agents.filter(a => (a.team_id || '') !== assignments[a.id])
    for (const a of changed) {
      await onSave(a.id, { teamId: assignments[a.id] || null })
    }
    setSaving(false)
    onClose()
  }

  const unassigned = agents.filter(a => !assignments[a.id])
  const assigned   = agents.filter(a =>  assignments[a.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md max-h-[82vh] flex flex-col modal-enter" onClick={e => e.stopPropagation()}
        style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          <div>
            <h2 className="text-white font-semibold">Assign Teams</h2>
            <p className="text-xs mt-0.5" style={{ color: '#c8c8c8' }}>Set or change each agent's team</p>
          </div>
          <button onClick={onClose} className="text-xs g-btn-ghost px-3 py-1.5">Cancel</button>
        </div>

        {/* Agent list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-1">
          {agents.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: '#c8c8c8' }}>No agents yet.</p>
          )}
          {agents.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2 px-3 rounded-xl"
              style={{ background: '#1c1c1e' }}>
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'rgba(255,151,128,0.12)', color: '#FF9780' }}>
                {a.name?.[0]?.toUpperCase() || '?'}
              </div>
              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.name}</p>
                {a.email && <p className="text-xs truncate" style={{ color: '#888' }}>{a.email}</p>}
              </div>
              {/* Team picker */}
              <select
                value={assignments[a.id] || ''}
                onChange={e => setAssignments(prev => ({ ...prev, [a.id]: e.target.value }))}
                className="text-xs rounded-lg px-2 py-1.5 g-input shrink-0"
                style={{ minWidth: 120, maxWidth: 160 }}>
                <option value="">No team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-between gap-4" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          <p className="text-xs" style={{ color: '#888' }}>
            {assigned.length}/{agents.length} assigned · {unassigned.length} unassigned
          </p>
          <button onClick={handleSave} disabled={saving}
            className="g-btn-primary text-sm px-5 py-2 rounded-xl"
            style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportGorgiasModal({ agents, teams, onSave, onClose }) {
  const [gorgiasUsers, setGorgiasUsers] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [selected,     setSelected]     = useState(new Set())
  const [teamId,       setTeamId]       = useState('')
  const [importing,    setImporting]    = useState(false)
  const [agentSearch,  setAgentSearch]  = useState('')

  useEffect(() => {
    authFetch(`${API_BASE}/api/gorgias-users`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        // Filter out already-imported users (by gorgias_user_id)
        const existingIds = new Set(agents.map(a => a.gorgias_user_id).filter(Boolean))
        setGorgiasUsers((data.users || []).filter(u => !existingIds.has(u.gorgias_user_id)))
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleImport = async () => {
    setImporting(true)
    for (const u of gorgiasUsers.filter(u => selected.has(u.gorgias_user_id))) {
      await onSave(u.name, u.email, teamId || null, u.gorgias_user_id)
    }
    setImporting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col modal-enter" onClick={e=>e.stopPropagation()}
        style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          <div>
            <h2 className="text-white font-semibold">Import from Gorgias</h2>
            <p className="text-xs mt-0.5" style={{ color: '#c8c8c8' }}>Select agents to add — already-imported users are hidden</p>
          </div>
          <button onClick={onClose} className="text-xs g-btn-ghost px-3 py-1.5">Cancel</button>
        </div>

        {/* Search */}
        {!loading && !error && gorgiasUsers.length > 0 && (
          <div className="px-4 pt-3 pb-1 relative">
            <svg className="absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#555' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={agentSearch}
              onChange={e => setAgentSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-xl pl-8 pr-8 py-2 text-sm outline-none"
              style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
              autoFocus
            />
            {agentSearch && (
              <button onClick={() => setAgentSearch('')} className="absolute right-7 top-1/2 -translate-y-1/2 text-lg leading-none" style={{ color: '#888' }}
                onMouseEnter={e => e.currentTarget.style.color='#fff'} onMouseLeave={e => e.currentTarget.style.color='#888'}>
                ×
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading && <p className="text-sm text-center py-8" style={{ color: '#c8c8c8' }}>Loading Gorgias users…</p>}
          {error   && <p className="text-sm text-center py-8" style={{ color: '#ef4444' }}>{error}</p>}
          {!loading && !error && gorgiasUsers.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: '#c8c8c8' }}>All Gorgias agents are already imported.</p>
          )}
          {!loading && !error && gorgiasUsers.length > 0 && (() => {
            const q = agentSearch.trim().toLowerCase()
            const visible = q
              ? gorgiasUsers.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
              : gorgiasUsers
            if (q && visible.length === 0) {
              return <p className="text-sm text-center py-8" style={{ color: '#c8c8c8' }}>No agents match "{agentSearch}"</p>
            }
            return visible.map(u => {
              const checked = selected.has(u.gorgias_user_id)
              return (
                <button key={u.gorgias_user_id} onClick={() => toggle(u.gorgias_user_id)}
                  className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all mb-0.5"
                  style={{ background: checked ? 'rgba(255,151,128,0.06)' : 'transparent', border: `1px solid ${checked ? 'rgba(255,151,128,0.2)' : 'transparent'}` }}>
                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                    style={{ border: `1.5px solid ${checked ? '#FF9780' : '#333'}`, background: checked ? '#FF9780' : 'transparent' }}>
                    {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.name}</p>
                    <p className="text-xs truncate" style={{ color: '#c8c8c8' }}>{u.email}</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: '#888' }}>ID: {u.gorgias_user_id}</span>
                </button>
              )
            })
          })()}
        </div>

        {/* Footer */}
        {!loading && !error && gorgiasUsers.length > 0 && (
          <div className="px-4 py-4 border-t flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <select value={teamId} onChange={e => setTeamId(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm text-white g-input">
              <option value="">No team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={handleImport} disabled={selected.size === 0 || importing}
              className="g-btn-primary text-sm px-4 py-2 rounded-xl shrink-0"
              style={{ opacity: selected.size === 0 ? 0.4 : 1 }}>
              {importing ? 'Importing…' : `Import ${selected.size > 0 ? selected.size : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Roster summary tile ───────────────────────────────────────────────────────
function SummaryTile({ label, value, color }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      <p className="text-xl font-bold tabular-nums" style={{ color: color || '#fff' }}>{value}</p>
      <p className="mt-0.5 text-xs" style={{ color: '#c8c8c8' }}>{label}</p>
    </div>
  )
}

// ── Compact list row — for scanning large rosters ────────────────────────────
function AgentRow({ stat, onOpen, onEditAgent, onDelete, canEdit }) {
  const { agent, team, n, avg, pass, unack } = stat
  const [confirmDelete, setConfirmDelete] = useState(false)
  const avgColor = avgToColor(avg)
  const passRate = n ? Math.round((pass / n) * 100) : 0
  const passColor = passRate >= 80 ? '#10b981' : passRate >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div className="grid items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
      style={{ gridTemplateColumns: agentRowCols(canEdit), background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}
      onClick={() => onOpen(agent)}
      onMouseEnter={e => e.currentTarget.style.background = '#161616'}
      onMouseLeave={e => e.currentTarget.style.background = '#1e1e20'}>
      {/* Agent */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: 'rgba(255,151,128,0.12)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.2)' }}>
          {agent.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{agent.name}</span>
            {unack > 0 && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', lineHeight: 1 }} title={`${unack} score${unack !== 1 ? 's' : ''} the agent hasn't acknowledged yet`}>{unack}</span>}
          </div>
          {agent.email && <span className="text-xs truncate block" style={{ color: '#888' }}>{agent.email}</span>}
        </div>
      </div>
      {/* Team */}
      <div className="min-w-0">
        {team
          ? <span className="text-xs px-2 py-0.5 rounded-full truncate inline-block max-w-full" style={{ color: '#FF9780', background: 'rgba(255,151,128,0.1)' }}>{team.name}</span>
          : <span className="text-xs" style={{ color: '#666' }}>—</span>}
      </div>
      {/* Avg */}
      <span className="text-sm font-bold tabular-nums text-right" style={{ color: avgColor }}>{avg != null ? avg.toFixed(1) : '—'}</span>
      {/* Pass rate */}
      <span className="text-xs tabular-nums text-right font-semibold" style={{ color: n ? passColor : '#666' }}>{n ? `${passRate}%` : '—'}</span>
      {/* Tickets */}
      <span className="text-xs tabular-nums text-right" style={{ color: '#c8c8c8' }}>{n}</span>
      {/* Actions */}
      {canEdit && (
        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
          {!confirmDelete ? (
            <>
              <button onClick={() => onEditAgent(agent)} className="g-btn-ghost text-xs">Edit</button>
              <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: '#888' }}
                onMouseEnter={e=>e.target.style.color='#ef4444'} onMouseLeave={e=>e.target.style.color='#888'}>Delete</button>
            </>
          ) : (
            <>
              <button onClick={() => onDelete(agent.id)} className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">No</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function EditAgentModal({ agent, profiles, onSave, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-sm modal-enter" onClick={e=>e.stopPropagation()}
        style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="text-white font-semibold mb-5">Edit {agent.name}</h2>
        <AgentEditForm agent={agent} profiles={profiles} onSave={onSave} onCancel={onClose} />
      </div>
    </div>
  )
}

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
  const openPanel  = (score) => { setPanelScore(score); setActiveOverlay('score') }
  const closePanel = () => { setPanelScore(null); setActiveOverlay(o => o === 'score' ? null : o) }
  useEffect(() => { if (activeOverlay !== 'score') setPanelScore(null) }, [activeOverlay])

  // View a single score from the per-agent drill-down: close the modal first so
  // the slide-in panel (z-40) isn't hidden behind it (z-50).
  const viewScoreFromHistory = (score) => { setHistoryAgent(null); openPanel(score) }

  useEffect(() => {
    supabase.from('profiles').select('id, name, role').order('name')
      .then(({ data }) => setProfiles(data || []))
  }, [])

  const handleAddAgent    = async (...args) => { await addAgent(...args); toast.success('Agent added') }
  const handleDeleteAgent = async (id)      => { await deleteAgent(id);   toast.success('Agent deleted') }
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
  const vt = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }

  // Layout: explicit override wins, else auto-switch to the compact list for big rosters
  const layout = layoutOverride ?? (agents.length > LIST_THRESHOLD ? 'list' : 'cards')
  const paged  = view.slice(0, visibleCount)

  // Reset the progressive reveal whenever the result set or layout changes
  useEffect(() => { setVisibleCount(AGENT_PAGE_SIZE) }, [search, sortKey, belowGoalOnly, teamFilter, layout])

  const selectStyle = { background: '#1e1e20', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', outline: 'none' }

  return (
    <div className={`panel-push ${panelScore ? 'is-open' : ''}`}>
    <div className="max-w-5xl mx-auto px-4 pt-10 pb-16">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-sm mt-0.5" style={{ color: '#c8c8c8' }}>Track individual agent performance</p>
          <p className="text-xs mt-1 max-w-xl" style={{ color: '#888' }}>
            Scores are a weighted <span style={{ color: '#aaa' }}>QA score (0–100)</span> across the rubric —
            higher is better. <span style={{ color: '#10b981' }}>≥{vt.pass} pass</span> · <span style={{ color: '#f59e0b' }}>{vt.needs_review}–{vt.pass - 1} review</span> · <span style={{ color: '#ef4444' }}>&lt;{vt.needs_review} fail</span>.
            <ScoreInfoPopover rubric={rubric} />
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            {/* Utility actions — low visual weight */}
            <button onClick={() => setShowImportModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: '#c8c8c8' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#c8c8c8'}>
              Import from Gorgias
            </button>
            <button onClick={() => setShowAssignModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: '#c8c8c8' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#c8c8c8'}>
              Assign Teams
            </button>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />

            <button onClick={() => setShowAddModal(true)} className="g-btn-primary text-sm px-4 py-2 rounded-xl whitespace-nowrap">
              + Add Agent
            </button>
          </div>
        )}
      </div>

      {/* Roster summary */}
      {agents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryTile label={teamFilter === 'all' ? 'Agents' : 'In team'} value={summary.count} />
          <SummaryTile label="Avg score" value={summary.avg != null ? summary.avg.toFixed(1) : '—'} color={avgToColor(summary.avg)} />
          <SummaryTile label="Below goal" value={summary.below} color={summary.below > 0 ? '#ef4444' : '#10b981'} />
          <SummaryTile label="Unacknowledged" value={summary.unack} color={summary.unack > 0 ? '#f59e0b' : '#fff'} />
        </div>
      )}

      {/* Controls: search · sort · below-goal */}
      {agents.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: search ? '#FF9780' : '#555' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search agents by name or email…"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
              style={{ background: '#1c1c1e', border: `1px solid ${search ? 'rgba(255,151,128,0.4)' : 'rgba(255,255,255,0.07)'}`, color: '#fff' }} />
          </div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm" style={selectStyle}>
            {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>Sort: {o.label}</option>)}
          </select>
          <button onClick={() => setBelowGoalOnly(v => !v)}
            className="text-xs px-3 py-2 rounded-xl border transition-all font-medium whitespace-nowrap"
            style={belowGoalOnly
              ? { color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.4)' }
              : { color: '#fff', borderColor: 'rgba(255,255,255,0.07)' }}>
            Below goal
          </button>
          {/* Layout toggle — Cards vs compact List */}
          <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            {[['cards', 'Cards'], ['list', 'List']].map(([id, label]) => (
              <button key={id} onClick={() => setLayoutOverride(id)}
                className="text-xs px-3 py-2 transition-colors font-medium"
                style={layout === id ? { background: 'rgba(255,151,128,0.12)', color: '#FF9780' } : { color: '#c8c8c8', background: 'transparent' }}>
                {label}
              </button>
            ))}
          </div>
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
                  ? { background: 'rgba(255,151,128,0.1)', borderColor: 'rgba(255,151,128,0.3)', color: '#FF9780' }
                  : { borderColor: 'rgba(255,255,255,0.07)', color: '#c8c8c8' }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color='#fff' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color='#c8c8c8' }}
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
            <div key={i} className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
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
        <div className="text-center py-20" style={{ color: '#888' }}>
          <p className="text-4xl mb-3">🧑‍💻</p>
          <p className="text-sm">No agents yet. Add one to start tracking performance.</p>
        </div>
      ) : view.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#888' }}>
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
                    onOpen={() => setHistoryAgent(stat.agent)}
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
                  onEdit={updateAgent} onDelete={handleDeleteAgent} onViewScore={openPanel}
                  onViewAll={() => setHistoryAgent(stat.agent)} canEdit={canEdit} scoreHelp={scoreHelp} />
                </div>
              ))}
            </div>
          )}

          {visibleCount < view.length && (
            <div className="flex justify-center mt-4">
              <button onClick={() => setVisibleCount(c => c + AGENT_PAGE_SIZE)}
                className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.10)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
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
