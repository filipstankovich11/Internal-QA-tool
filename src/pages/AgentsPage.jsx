import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { useToast } from '../components/Toast'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetch } from '../lib/api'
import { supabase } from '../lib/supabase'

const VERDICT_DOT   = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const VERDICT_COLOR = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG    = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }

// Build daily-averaged data points from scores over the last N days
function buildTrendData(scores, days = 30) {
  const now = Date.now()
  const cutoff = now - days * 86400000
  const recent = scores.filter(s => s.scoredAt >= cutoff)
  if (!recent.length) return []

  const buckets = {}
  recent.forEach(s => {
    const dayIdx = Math.floor((s.scoredAt - cutoff) / 86400000)
    if (!buckets[dayIdx]) buckets[dayIdx] = []
    buckets[dayIdx].push(s.effectiveScore ?? s.weightedScore)
  })

  return Object.entries(buckets)
    .map(([day, vals]) => ({ day: parseInt(day), avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.day - b.day)
}

function TrendLine({ scores, W = 100, H = 28 }) {
  const pts = buildTrendData(scores, 30)
  if (pts.length < 2) return null

  const pad = 2
  const avgValues = pts.map(p => p.avg)
  const minV = Math.min(...avgValues), maxV = Math.max(...avgValues)
  const range = maxV - minV || 10

  const x = (day) => pad + (day / 29) * (W - pad * 2)
  const y = (v)   => H - pad - ((v - minV) / range) * (H - pad * 2)

  const d = pts.map(({ day, avg }, i) => `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(avg).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const first = pts[0]
  const color = last.avg > first.avg + 3 ? '#10b981' : last.avg < first.avg - 3 ? '#ef4444' : '#888'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
        pathLength="1" strokeDasharray="1" strokeDashoffset="1"
        style={{ animation: 'drawLine 0.7s cubic-bezier(0.16,1,0.3,1) forwards' }} />
      <circle cx={x(last.day).toFixed(1)} cy={y(last.avg).toFixed(1)} r="2.5" fill={color} />
    </svg>
  )
}

function TrendChart({ scores }) {
  const pts = buildTrendData(scores, 30)
  if (pts.length < 2) return (
    <p className="text-xs text-center py-6" style={{ color: '#555' }}>Not enough data for a trend (need scores across 2+ days)</p>
  )

  const W = 400, H = 80, padX = 8, padY = 6
  const avgValues = pts.map(p => p.avg)
  const minV = Math.max(0,  Math.min(...avgValues) - 5)
  const maxV = Math.min(100, Math.max(...avgValues) + 5)
  const range = maxV - minV || 10

  const x = (day) => padX + (day / 29) * (W - padX * 2)
  const y = (v)   => H - padY - ((v - minV) / range) * (H - padY * 2)

  const linePath = pts.map(({ day, avg }, i) => `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(avg).toFixed(1)}`).join(' ')

  // Area fill
  const first = pts[0], last = pts[pts.length - 1]
  const areaPath = `${linePath} L${x(last.day).toFixed(1)},${H} L${x(first.day).toFixed(1)},${H} Z`
  const color = last.avg > first.avg + 3 ? '#10b981' : last.avg < first.avg - 3 ? '#ef4444' : '#888'

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 200 }}>
        <path d={areaPath} fill={color} opacity="0.04" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        {pts.map(({ day, avg }) => (
          <circle key={day} cx={x(day).toFixed(1)} cy={y(avg).toFixed(1)} r="2.5" fill={color} opacity="0.9" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-2">
        <span className="text-xs" style={{ color: '#555' }}>30 days ago</span>
        <span className="text-xs" style={{ color: '#555' }}>Today</span>
      </div>
    </div>
  )
}

function GoalProgress({ avg, goal }) {
  if (!goal || avg == null) return null
  const pct     = Math.min(Math.round((avg / goal) * 100), 100)
  const reached = avg >= goal
  const close   = !reached && avg >= goal - 8
  const color   = reached ? '#10b981' : close ? '#f59e0b' : '#ef4444'

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: '#777' }}>Score goal</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {avg.toFixed(1)} <span style={{ color: '#666' }}>/ {goal}</span>
          {reached && <span className="ml-1.5">✓</span>}
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#1e1e1e' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  )
}

function VerdictBar({ scores }) {
  const total = scores.length
  if (!total) return null
  const pass = scores.filter(s => s.effectiveVerdict === 'PASS').length
  const rev  = scores.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW').length
  const fail = scores.filter(s => s.effectiveVerdict === 'FAIL').length
  return (
    <div className="flex rounded-full overflow-hidden h-1.5 w-full" style={{ background: '#1e1e1e' }}>
      {pass > 0 && <div style={{ width: `${(pass/total)*100}%`, background: '#10b981' }} />}
      {rev  > 0 && <div style={{ width: `${(rev/total)*100}%`,  background: '#f59e0b' }} />}
      {fail > 0 && <div style={{ width: `${(fail/total)*100}%`, background: '#ef4444' }} />}
    </div>
  )
}

function AgentHistoryModal({ agent, scores, onViewScore, onClose }) {
  const sorted = [...scores].sort((a, b) => b.scoredAt - a.scoredAt)
  const avg = scores.length ? (scores.reduce((s, x) => s + (x.effectiveScore ?? x.weightedScore), 0) / scores.length) : null
  const avgColor = avg != null ? (avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444') : '#888'

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
              <p className="text-xs" style={{ color: '#777' }}>{scores.length} ticket{scores.length !== 1 ? 's' : ''} scored</p>
              {avg != null && <span className="text-xs font-bold" style={{ color: avgColor }}>{avg.toFixed(1)} avg</span>}
              {agent.goal_score && avg != null && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: avg >= agent.goal_score ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.07)', color: avg >= agent.goal_score ? '#10b981' : '#555' }}>
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
            <p className="text-xs mb-3" style={{ color: '#666' }}>30-day score trend</p>
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
              <span className="text-xs flex-1 truncate" style={{ color: '#ccc' }}>{s.fullScore?.ticket_subject || '—'}</span>
              <span className="text-xs tabular-nums shrink-0" style={{ color: '#888' }}>{s.effectiveScore?.toFixed(0)}/100</span>
              <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: VERDICT_COLOR[s.effectiveVerdict], background: VERDICT_BG[s.effectiveVerdict] }}>
                {VERDICT_LABEL[s.effectiveVerdict] || s.effectiveVerdict}
              </span>
              <span className="text-xs shrink-0 hidden sm:block" style={{ color: '#666' }}>
                {new Date(s.scoredAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent, team, scores, profiles = [], onEdit, onDelete, onViewScore, onViewAll, canEdit }) {
  const [editing,       setEditing]       = useState(false)
  const [form,          setForm]          = useState({ name: agent.name, email: agent.email || '', gorgiasUserId: agent.gorgias_user_id ? String(agent.gorgias_user_id) : '', goalScore: agent.goal_score ? String(agent.goal_score) : '', userId: agent.user_id || '' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const openEdit = () => {
    setForm({ name: agent.name, email: agent.email || '', gorgiasUserId: agent.gorgias_user_id ? String(agent.gorgias_user_id) : '', goalScore: agent.goal_score ? String(agent.goal_score) : '', userId: agent.user_id || '' })
    setEditing(true)
  }

  const avg = scores.length ? (scores.reduce((s,x) => s + (x.effectiveScore ?? x.weightedScore), 0) / scores.length) : null
  const avgColor = avg != null ? (avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444') : null
  const unacknowledged = scores.filter(s => !s.acknowledged).length

  const save = () => {
    if (form.name.trim()) onEdit(agent.id, {
      name: form.name.trim(),
      email: form.email.trim(),
      gorgias_user_id: form.gorgiasUserId ? parseInt(form.gorgiasUserId) : null,
      goal_score: form.goalScore ? parseInt(form.goalScore) : null,
      user_id: form.userId || null,
    })
    setEditing(false)
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      {editing ? (
        <div className="flex flex-col gap-2.5 mb-4">
          <input autoFocus placeholder="Agent name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="rounded-xl px-3 py-2 text-white text-sm g-input" style={{ border: '1px solid #FF9780' }} />
          <input placeholder="Email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="rounded-xl px-3 py-2 text-sm g-input" />
          <input placeholder="Gorgias user ID" value={form.gorgiasUserId}
            onChange={e => setForm(f => ({ ...f, gorgiasUserId: e.target.value.replace(/\D/,'') }))}
            className="rounded-xl px-3 py-2 text-sm g-input" />
          <input placeholder="Score goal (e.g. 85)" value={form.goalScore}
            onChange={e => setForm(f => ({ ...f, goalScore: e.target.value.replace(/\D/,'') }))}
            className="rounded-xl px-3 py-2 text-sm g-input" />
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: '#666' }}>Linked account</label>
            <select value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.1)', color: form.userId ? '#ccc' : '#555', outline: 'none' }}>
              <option value="">— Not linked —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.id} — {p.role}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="g-btn-primary text-xs px-3 py-1.5 rounded-lg">Save</button>
            <button onClick={() => setEditing(false)} className="g-btn-ghost text-xs px-3 py-1.5">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between mb-4">
          <div>
            <button onClick={onViewAll}
              className="text-left transition-colors"
              onMouseEnter={e=>e.currentTarget.querySelector('h3').style.color='#FF9780'}
              onMouseLeave={e=>e.currentTarget.querySelector('h3').style.color='#fff'}>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold transition-colors">{agent.name}</h3>
                {unacknowledged > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', lineHeight: 1 }}>
                    {unacknowledged}
                  </span>
                )}
              </div>
            </button>
            {agent.email && <p className="text-xs mt-0.5" style={{ color: '#777' }}>{agent.email}</p>}
            {agent.gorgias_user_id && <p className="text-xs mt-0.5" style={{ color: '#666' }}>Gorgias ID: {agent.gorgias_user_id}</p>}
            <p className="text-xs mt-0.5" style={{ color: agent.user_id ? '#10b981' : '#ef4444' }}>
              {agent.user_id ? '● Account linked' : '● No account linked'}
            </p>
            {team && <span className="text-xs px-2 py-0.5 rounded-full mt-1.5 inline-block" style={{ color: '#FF9780', background: 'rgba(255,151,128,0.1)' }}>{team.name}</span>}
          </div>
          <div className="flex items-center gap-3">
            <TrendLine scores={scores} />
            {avg != null && <span className="text-sm font-bold" style={{ color: avgColor }}>{avg.toFixed(1)}/100</span>}
            {canEdit && !confirmDelete && <button onClick={openEdit} className="g-btn-ghost text-xs">Edit</button>}
            {canEdit && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} className="text-xs" style={{ color: '#777' }}
                onMouseEnter={e=>e.target.style.color='#ef4444'} onMouseLeave={e=>e.target.style.color='#555'}>Delete</button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#ef4444' }}>Delete agent?</span>
                <button onClick={() => onDelete(agent.id)} className="text-xs font-medium px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {scores.length > 0 ? (
        <>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span style={{ color: '#777' }}>{scores.length} tickets scored</span>
              <div className="flex gap-3">
                <span style={{ color: '#10b981' }}>{scores.filter(s=>s.verdict==='PASS').length} pass</span>
                <span style={{ color: '#f59e0b' }}>{scores.filter(s=>s.verdict==='NEEDS_REVIEW').length} review</span>
                <span style={{ color: '#ef4444' }}>{scores.filter(s=>s.verdict==='FAIL').length} fail</span>
              </div>
            </div>
            <VerdictBar scores={scores} />
          </div>
          <GoalProgress avg={avg} goal={agent.goal_score} />
          <div className="flex flex-col gap-0.5 mt-2">
            {scores.slice(0,5).map(s => (
              <button key={s.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg text-left transition-colors"
                onClick={() => onViewScore({ ...s.fullScore, scoreId: s.id, reviewerNote: s.notes, overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt })}
                onMouseEnter={e=>e.currentTarget.style.background='#161616'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs font-mono transition-colors"
                  style={{ color: '#FF9780' }}
                  onMouseEnter={e => e.target.style.textDecoration='underline'}
                  onMouseLeave={e => e.target.style.textDecoration='none'}>
                  #{s.ticketId}
                </a>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#888' }}>{s.weightedScore?.toFixed(0)}/100</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: VERDICT_DOT[s.verdict] || '#555' }} />
                </div>
              </button>
            ))}
          </div>
          <button onClick={onViewAll} className="mt-2 text-xs w-full text-center py-1.5 rounded-lg transition-colors"
            style={{ color: '#FF9780' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,151,128,0.06)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            View all {scores.length} ticket{scores.length !== 1 ? 's' : ''} →
          </button>
        </>
      ) : <p className="text-xs" style={{ color: '#666' }}>No tickets scored yet</p>}
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
            <p className="text-xs mt-0.5" style={{ color: '#777' }}>Set or change each agent's team</p>
          </div>
          <button onClick={onClose} className="text-xs g-btn-ghost px-3 py-1.5">Cancel</button>
        </div>

        {/* Agent list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-1">
          {agents.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: '#777' }}>No agents yet.</p>
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
                {a.email && <p className="text-xs truncate" style={{ color: '#666' }}>{a.email}</p>}
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
          <p className="text-xs" style={{ color: '#666' }}>
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
            <p className="text-xs mt-0.5" style={{ color: '#777' }}>Select agents to add — already-imported users are hidden</p>
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
              style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}
              autoFocus
            />
            {agentSearch && (
              <button onClick={() => setAgentSearch('')} className="absolute right-7 top-1/2 -translate-y-1/2 text-lg leading-none" style={{ color: '#555' }}
                onMouseEnter={e => e.currentTarget.style.color='#ccc'} onMouseLeave={e => e.currentTarget.style.color='#555'}>
                ×
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading && <p className="text-sm text-center py-8" style={{ color: '#777' }}>Loading Gorgias users…</p>}
          {error   && <p className="text-sm text-center py-8" style={{ color: '#ef4444' }}>{error}</p>}
          {!loading && !error && gorgiasUsers.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: '#777' }}>All Gorgias agents are already imported.</p>
          )}
          {!loading && !error && gorgiasUsers.length > 0 && (() => {
            const q = agentSearch.trim().toLowerCase()
            const visible = q
              ? gorgiasUsers.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
              : gorgiasUsers
            if (q && visible.length === 0) {
              return <p className="text-sm text-center py-8" style={{ color: '#777' }}>No agents match "{agentSearch}"</p>
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
                    <p className="text-xs truncate" style={{ color: '#777' }}>{u.email}</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: '#555' }}>ID: {u.gorgias_user_id}</span>
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

export default function AgentsPage() {
  const { agents, teams, addAgent, updateAgent, deleteAgent, getAgentScores } = useApp()
  const { canEdit } = useAuth()
  const toast = useToast()
  const [teamFilter,        setTeamFilter]        = useState('all')
  const [showAddModal,      setShowAddModal]      = useState(false)
  const [showImportModal,   setShowImportModal]   = useState(false)
  const [showAssignModal,   setShowAssignModal]   = useState(false)
  const [activeScore,       setActiveScore]       = useState(null)
  const [historyAgent,      setHistoryAgent]      = useState(null)
  const [profiles,          setProfiles]          = useState([])

  useEffect(() => {
    supabase.from('profiles').select('id, name, role').order('name')
      .then(({ data }) => setProfiles(data || []))
  }, [])

  const handleAddAgent    = async (...args) => { await addAgent(...args); toast.success('Agent added') }
  const handleDeleteAgent = async (id)      => { await deleteAgent(id);   toast.success('Agent deleted') }
  const handleImport      = async (...args) => { await addAgent(...args) }
  const handleAssign      = async (...args) => { await updateAgent(...args) }

  const filtered = teamFilter === 'all' ? agents : agents.filter(a => a.team_id === teamFilter)

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-sm mt-0.5" style={{ color: '#888' }}>Track individual agent performance</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            {/* Utility actions — low visual weight */}
            <button onClick={() => setShowImportModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: '#999' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#999'}>
              Import from Gorgias
            </button>
            <button onClick={() => setShowAssignModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: '#999' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#999'}>
              Assign Teams
            </button>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />

            <button onClick={() => setShowAddModal(true)} className="g-btn-primary text-sm px-4 py-2 rounded-xl whitespace-nowrap">
              + Add Agent
            </button>
          </div>
        )}
      </div>

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
                  : { borderColor: 'rgba(255,255,255,0.07)', color: '#777' }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color='#ccc' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color='#555' }}
              >
                {id === 'all' ? 'All' : t?.name}
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">🧑‍💻</p>
          <p className="text-sm">No agents yet. Add one to start tracking performance.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((agent, i) => (
            <div key={agent.id} className="stagger-item" style={{ '--i': i }}>
            <AgentCard agent={agent}
              team={teams.find(t => t.id === agent.team_id)}
              scores={getAgentScores(agent.id)}
              profiles={profiles}
              onEdit={updateAgent} onDelete={handleDeleteAgent} onViewScore={setActiveScore}
              onViewAll={() => setHistoryAgent(agent)} canEdit={canEdit} />
            </div>
          ))}
        </div>
      )}

      {showAddModal    && <AddAgentModal teams={teams} onSave={handleAddAgent} onClose={() => setShowAddModal(false)} />}
      {showImportModal && <ImportGorgiasModal agents={agents} teams={teams} onSave={handleImport} onClose={() => { setShowImportModal(false); toast.success('Agents imported') }} />}
      {showAssignModal && <AssignTeamsModal agents={agents} teams={teams} onSave={handleAssign} onClose={() => { setShowAssignModal(false); toast.success('Teams updated') }} />}
      {historyAgent && (
        <AgentHistoryModal
          agent={historyAgent}
          scores={getAgentScores(historyAgent.id)}
          onViewScore={score => { setActiveScore(score) }}
          onClose={() => setHistoryAgent(null)} />
      )}
      {activeScore  && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
