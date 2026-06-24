import { useState, useEffect, useMemo } from 'react'
import { authFetch } from '../../lib/api'
import { gorgiasTicketUrl } from '../../lib/gorgias'
import { TrendChart } from '../TrendChart'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL, gradeColor } from '../../lib/verdict'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

// Shared edit form — used inline in the card and inside the list-view edit modal
export function AgentEditForm({ agent, profiles = [], onSave, onCancel }) {
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

export function AgentHistoryModal({ agent, scores, avg, thresholds, onViewScore, onClose }) {
  const sorted = useMemo(() => [...scores].sort((a, b) => b.scoredAt - a.scoredAt), [scores])
  const avgColor = gradeColor(avg, thresholds)

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

export function AddAgentModal({ teams, onSave, onClose }) {
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

export function AssignTeamsModal({ agents, teams, onSave, onClose }) {
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

export function ImportGorgiasModal({ agents, teams, onSave, onClose }) {
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

export function EditAgentModal({ agent, profiles, onSave, onClose }) {
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
