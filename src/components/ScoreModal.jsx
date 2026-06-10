import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { authFetch } from '../lib/api'
import { gorgiasTicketUrl } from '../lib/gorgias'

function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const to = target ?? 0
    const start = performance.now()
    cancelAnimationFrame(raf.current)
    const tick = now => {
      const t = Math.min((now - start) / duration, 1)
      setVal(Math.round(to * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else setVal(to)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target])
  return val
}

const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
  </svg>
)

const VERDICT = {
  PASS:         { label: 'PASS',        icon: '✓', text: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)',  wash: 'rgba(16,185,129,0.06)'  },
  NEEDS_REVIEW: { label: 'NEEDS REVIEW', icon: '~', text: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  wash: 'rgba(245,158,11,0.06)'  },
  FAIL:         { label: 'FAIL',         icon: '✗', text: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   wash: 'rgba(239,68,68,0.06)'   },
}

const VERDICTS = ['PASS', 'NEEDS_REVIEW', 'FAIL']

const scoreColor = n => n >= 4 ? '#10b981' : n >= 3 ? '#f59e0b' : '#ef4444'

// ── 5-dot score indicator ─────────────────────────────────────────────────────
function ScoreDots({ score }) {
  const color = scoreColor(score)
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="rounded-full transition-all"
          style={{
            width: 8, height: 8,
            background: i <= score ? color : '#222',
            boxShadow: i <= score ? `0 0 4px ${color}88` : 'none',
          }} />
      ))}
    </div>
  )
}

// ── Dimension summary strip ───────────────────────────────────────────────────
function DimensionStrip({ dimensions }) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {dimensions.map(({ name, weight, average }) => {
        const avg   = typeof average === 'number' ? average : Number(average) || 0
        const color = scoreColor(avg)
        const pct   = (avg / 5) * 100
        return (
          <div key={name} className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tabular-nums" style={{ color }}>{avg.toFixed(1)}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: '#777', background: '#161616' }}>{weight}</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: '#1e1e1e' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
            <p className="text-xs leading-tight" style={{ color: '#888' }}>{name}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Criteria row with dots ────────────────────────────────────────────────────
function SubScoreRow({ label, data }) {
  const [open, setOpen] = useState(false)
  const { score, notes } = data
  const color = scoreColor(score)

  return (
    <div className="py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 text-left">
        <span className="shrink-0 transition-transform" style={{ color: '#666', display:'inline-block', fontSize: '1rem', width: '1rem', transform: open ? 'rotate(90deg)':'rotate(0deg)' }}>▶</span>
        <span className="text-sm flex-1" style={{ color: '#ccc' }}>{label}</span>
        <ScoreDots score={score} />
        <span className="text-xs font-semibold w-6 text-right shrink-0 tabular-nums" style={{ color }}>{score}/5</span>
      </button>
      {open && <p className="text-xs mt-2 ml-6 leading-relaxed" style={{ color: '#888' }}>{notes}</p>}
    </div>
  )
}

function DimensionCard({ name, weight, average, rows }) {
  const avg = typeof average === 'number' ? average : Number(average) || 0
  const color = scoreColor(avg)
  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#777' }}>{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums" style={{ color }}>{avg.toFixed(1)}/5</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#777', background: '#161616' }}>{weight}</span>
        </div>
      </div>
      <div>{rows.map(r => <SubScoreRow key={r.label} label={r.label} data={r.data} />)}</div>
    </div>
  )
}

function NotesSection({ scoreId, initialNote }) {
  const { updateScoreNote } = useApp()
  const { canScore } = useAuth()
  const toast = useToast()
  const [note,    setNote]    = useState(initialNote || '')
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (editing && textareaRef.current) textareaRef.current.focus()
  }, [editing])

  const save = async () => {
    if (!scoreId) return
    setSaving(true)
    await updateScoreNote(scoreId, note.trim())
    setSaving(false)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    toast.success('Note saved')
  }

  const cancel = () => { setNote(initialNote || ''); setEditing(false) }

  return (
    <div className="rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#888' }}>Reviewer Note</p>
        {saved && <span className="text-xs" style={{ color: '#10b981' }}>Saved</span>}
        {!editing && canScore && scoreId && (
          <button onClick={() => setEditing(true)}
            className="text-xs font-medium transition-colors" style={{ color: '#aaa' }}
            onMouseEnter={e => e.target.style.color='#FF9780'} onMouseLeave={e => e.target.style.color='#aaa'}>
            {note ? 'Edit' : '+ Add note'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea ref={textareaRef} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a reviewer note — observations, coaching points, context…"
            rows={3} className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-none outline-none"
            style={{ background: '#161616', border: '1px solid rgba(255,151,128,0.4)', color: '#ccc' }}
            onKeyDown={e => { if (e.key === 'Escape') cancel() }} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="g-btn-primary text-xs px-3 py-1.5 rounded-lg"
              style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={cancel} className="g-btn-ghost text-xs px-3 py-1.5">Cancel</button>
          </div>
        </div>
      ) : note ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#aaa' }}>{note}</p>
      ) : (
        <p className="text-sm" style={{ color: '#888' }}>
          {canScore && scoreId ? 'No note yet — click "Add note" to leave feedback.' : 'No reviewer note.'}
        </p>
      )}
    </div>
  )
}

function OverrideSection({ scoreId, currentVerdict, currentScore, overrideVerdict, overrideScore, overrideNote, overrideAt }) {
  const { overrideScore: saveOverride } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [open,    setOpen]    = useState(false)
  const [verdict, setVerdict] = useState(overrideVerdict || currentVerdict || 'PASS')
  const [score,   setScore]   = useState(overrideScore   ?? currentScore ?? 80)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  if (!scoreId) return null
  if (!isAdmin && !overrideVerdict) return null

  const hasOverride = !!overrideVerdict

  const save = async () => {
    if (!note.trim()) return
    setSaving(true)
    await saveOverride(scoreId, { verdict, score: parseFloat(score), note: note.trim() })
    setSaving(false)
    setOpen(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    toast.success('Override saved')
  }

  const vc = VERDICT[overrideVerdict || verdict] || VERDICT.PASS

  return (
    <div className="rounded-xl p-4" style={{ background: hasOverride ? 'rgba(99,102,241,0.05)' : '#0f0f0f', border: `1px solid ${hasOverride ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
      {hasOverride ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#818cf8' }}>
              ⊘ Human Override
            </p>
            {saved && <span className="text-xs" style={{ color: '#10b981' }}>Saved</span>}
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: vc.text, background: vc.bg, border: `1px solid ${vc.border}` }}>
              {vc.icon} {vc.label} · {overrideScore?.toFixed(0)}/100
            </span>
          </div>
          {isAdmin && (
            <button onClick={() => setOpen(v => !v)}
              className="text-xs font-medium transition-colors" style={{ color: '#aaa' }}
              onMouseEnter={e => e.target.style.color='#818cf8'} onMouseLeave={e => e.target.style.color='#aaa'}>
              {open ? 'Cancel' : 'Edit override'}
            </button>
          )}
        </div>
      ) : isAdmin ? (
        <button onClick={() => setOpen(v => !v)}
          className="w-[85%] mx-auto block text-sm font-semibold py-2 rounded-lg transition-all"
          style={{ color: '#f97316', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(249,115,22,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(249,115,22,0.08)' }}>
          {open ? 'Cancel' : 'Override Score'}
        </button>
      ) : null}

      {hasOverride && !open && overrideNote && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: '#888' }}>{overrideNote}</p>
      )}
      {hasOverride && overrideAt && !open && (
        <p className="text-xs mt-1" style={{ color: '#555' }}>
          Overridden {new Date(overrideAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Verdict picker */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: '#777' }}>New verdict</p>
            <div className="flex gap-2">
              {VERDICTS.map(v => {
                const vc2 = VERDICT[v]
                const active = verdict === v
                return (
                  <button key={v} onClick={() => setVerdict(v)}
                    className="flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all"
                    style={active
                      ? { color: vc2.text, background: vc2.bg, borderColor: vc2.border }
                      : { color: '#777', borderColor: 'rgba(255,255,255,0.07)' }}>
                    {vc2.icon} {vc2.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Score slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs" style={{ color: '#777' }}>Adjusted score</p>
              <span className="text-sm font-bold tabular-nums"
                style={{ color: score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444' }}>
                {parseFloat(score).toFixed(0)}/100
              </span>
            </div>
            <input type="range" min="0" max="100" step="1"
              value={score} onChange={e => setScore(e.target.value)}
              className="w-full" style={{ accentColor: '#FF9780' }} />
          </div>

          {/* Reason (required) */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: '#777' }}>Reason <span style={{ color: '#ef4444' }}>*</span></p>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Required — explain why you're overriding the AI score…"
              rows={2} className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
              style={{ background: '#161616', border: '1px solid rgba(129,140,248,0.3)', color: '#ccc' }} />
          </div>

          <button onClick={save} disabled={!note.trim() || saving}
            className="g-btn-primary text-sm py-2 rounded-xl"
            style={{ opacity: !note.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save Override'}
          </button>
        </div>
      )}
    </div>
  )
}

function WhatWentWell({ scores }) {
  // Collect all criteria across dimensions, sort by score desc, take top 2
  const all = Object.values(scores).flatMap(dim =>
    Object.entries(dim)
      .filter(([k, v]) => k !== 'dimension_average' && v?.score != null)
      .map(([, v]) => v)
  )
  const top = [...all].sort((a, b) => b.score - a.score).slice(0, 2).filter(c => c.score >= 4)
  if (!top.length) return null

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#10b981' }}>What went well</p>
      <div className="flex flex-col gap-2">
        {top.map((c, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: '#10b981' }}>✓</span>
            <p className="text-sm leading-relaxed" style={{ color: '#aaa' }}>{c.notes}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DisputeSection({ scoreId, disputed, disputeNote, disputeAt }) {
  const { flagScore, clearDispute } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [open,    setOpen]    = useState(false)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)

  if (!scoreId) return null

  const submit = async () => {
    if (!note.trim()) return
    setSaving(true)
    const ok = await flagScore(scoreId, note.trim())
    setSaving(false)
    if (ok) { toast.info('Score flagged for dispute'); setOpen(false) }
    else toast.error('Failed to flag score')
  }

  const clear = async () => {
    setSaving(true)
    const ok = await clearDispute(scoreId)
    setSaving(false)
    if (ok) toast.success('Dispute cleared')
    else toast.error('Failed to clear dispute')
  }

  return (
    <div className="rounded-xl p-4"
      style={{ background: disputed ? 'rgba(245,158,11,0.05)' : '#0f0f0f', border: `1px solid ${disputed ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
      {disputed ? (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f59e0b' }}>
            ⚑ Disputed
          </p>
          {isAdmin && (
            <button onClick={clear} disabled={saving}
              className="text-xs font-medium transition-colors" style={{ color: '#aaa' }}
              onMouseEnter={e => e.target.style.color='#10b981'}
              onMouseLeave={e => e.target.style.color='#aaa'}>
              Clear dispute
            </button>
          )}
        </div>
      ) : (
        <button onClick={() => setOpen(v => !v)}
          className="w-[85%] mx-auto block text-sm font-semibold py-2 rounded-lg transition-all"
          style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.08)' }}>
          {open ? 'Cancel' : 'Flag for dispute'}
        </button>
      )}

      {disputed && disputeNote && !open && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: '#888' }}>{disputeNote}</p>
      )}
      {disputed && disputeAt && (
        <p className="text-xs mt-1" style={{ color: '#666' }}>
          Flagged {new Date(disputeAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Describe why this score is incorrect or unfair…"
            rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
            style={{ background: '#161616', border: '1px solid rgba(245,158,11,0.3)', color: '#ccc' }} />
          <button onClick={submit} disabled={!note.trim() || saving}
            className="text-sm py-2 rounded-xl font-medium transition-all"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', opacity: !note.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Submitting…' : 'Submit Dispute'}
          </button>
        </div>
      )}
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

export default function ScoreModal({ score, onClose }) {
  const { agents, addScore, deleteScore, acknowledgeScore, rubric } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [confirmDelete,   setConfirmDelete]   = useState(false)
  const [rescoring,       setRescoring]       = useState(false)
  const [liveScore,       setLiveScore]       = useState(null)
  const [acknowledging,   setAcknowledging]   = useState(false)
  const [notifying,       setNotifying]       = useState(false)
  const [showNotifyPreview, setShowNotifyPreview] = useState(false)

  // Use liveScore after a re-score, fall back to the original prop
  const s = liveScore ?? score

  const displayVerdict  = s.overrideVerdict || s.verdict
  const displayScore    = s.overrideScore   ?? s.weighted_score
  const animatedScore   = useCountUp(Math.round(displayScore))
  const vc = VERDICT[displayVerdict] || VERDICT.FAIL
  const { inquiry_resolution, internal_processes, customer_perception } = s.scores ?? {}

  const matchedAgents = (s.agent_senders || [])
    .map(a => agents.find(ag =>
      (a.gorgias_user_id && ag.gorgias_user_id === a.gorgias_user_id) ||
      (a.email && ag.email?.toLowerCase() === a.email?.toLowerCase())
    ))
    .filter(Boolean)

  const agentNames = matchedAgents.map(a => a.name).filter(Boolean)
    .concat(
      (s.agent_senders || [])
        .filter(a => !agents.find(ag =>
          (a.gorgias_user_id && ag.gorgias_user_id === a.gorgias_user_id) ||
          (a.email && ag.email?.toLowerCase() === a.email?.toLowerCase())
        ))
        .map(a => a.name)
        .filter(Boolean)
    )

  const openNotifyPreview = () => {
    const agentsWithEmail = matchedAgents.filter(a => a.email)
    if (!agentsWithEmail.length) {
      toast.error('No email address found for this agent')
      return
    }
    setShowNotifyPreview(true)
  }

  const sendNotification = async () => {
    const agentsWithEmail = matchedAgents.filter(a => a.email)
    setNotifying(true)
    try {
      const results = await Promise.all(agentsWithEmail.map(agent =>
        authFetch(`${API_BASE}/api/notify-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_email: agent.email,
            score: s,
            reviewer_note: s.reviewerNote || '',
          }),
        }).then(r => r.json().then(d => ({ ok: r.ok, ...d })))
      ))
      const failed = results.filter(r => !r.ok)
      setShowNotifyPreview(false)
      if (failed.length === 0) toast.success('Slack DM sent to agent')
      else if (failed.length < results.length) toast.success(`Sent to ${results.length - failed.length} agent(s) — ${failed.length} failed`)
      else toast.error(failed[0]?.error || 'Failed to send Slack DM')
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setNotifying(false)
    }
  }

  const rescore = async () => {
    setRescoring(true)
    try {
      const res  = await authFetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: String(s.ticket_id), rubric }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Re-score failed'); return }
      const entry = await addScore(data)
      setLiveScore({ ...data, scoreId: entry?.id, reviewerNote: '', overrideVerdict: null, overrideScore: null, overrideNote: null, overrideAt: null })
      toast.success('Ticket re-scored')
    } catch { toast.error('Could not reach the server') }
    finally { setRescoring(false) }
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-[38.4rem] max-h-[90vh] overflow-y-auto shadow-2xl modal-enter"
        style={{ background: '#070707', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header — colour-washed by verdict */}
        <div className="sticky top-0 z-10 px-6 pt-5 pb-5 rounded-t-2xl"
          style={{ background: `rgba(7,7,7,0.96)`, borderBottom: `1px solid ${vc.border}`, backdropFilter: 'blur(8px)', boxShadow: `inset 0 -1px 0 ${vc.wash}` }}>

          {/* Row 1: Ticket ID (left) + Actions (right) */}
          <div className="flex items-center justify-between mb-4">
            <a href={gorgiasTicketUrl(s.ticket_id)} target="_blank" rel="noreferrer"
              className="text-xs transition-colors"
              style={{ color: '#777' }}
              onMouseEnter={e => e.currentTarget.style.color='#FF9780'}
              onMouseLeave={e => e.currentTarget.style.color='#777'}>
              Ticket #{s.ticket_id}
            </a>
            <div className="flex items-center gap-4 shrink-0 pl-8">
              {isAdmin && s.scoreId && !confirmDelete && (
                <button onClick={openNotifyPreview} disabled={notifying}
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: notifying ? '#555' : '#666' }}
                  onMouseEnter={e => { if (!notifying) e.currentTarget.style.color = '#ccc' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#666' }}
                  title="Send score summary to agent via Slack DM">
                  {notifying
                    ? <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24"><path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/><path fill="#2EB67D" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/><path fill="#ECB22E" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/><path fill="#36C5F0" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                  }
                  {notifying ? 'Sending…' : 'Notify'}
                </button>
              )}
              {s.scoreId && !confirmDelete && (
                <button onClick={rescore} disabled={rescoring}
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: rescoring ? '#333' : '#555' }}
                  onMouseEnter={e => { if (!rescoring) e.currentTarget.style.color='#FF9780' }}
                  onMouseLeave={e => { if (!rescoring) e.currentTarget.style.color='#555' }}
                  title="Re-run AI scoring on this ticket">
                  {rescoring
                    ? <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    : <RefreshIcon />}
                  {rescoring ? 'Rescoring…' : 'Re-score'}
                </button>
              )}
              {isAdmin && s.scoreId && !confirmDelete && (
                <button onClick={() => setConfirmDelete(true)}
                  className="text-xs transition-colors" style={{ color: '#555' }}
                  onMouseEnter={e => e.target.style.color='#ef4444'}
                  onMouseLeave={e => e.target.style.color='#555'}>
                  Delete
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#ef4444' }}>Delete score?</span>
                  <button onClick={async () => {
                    const ok = await deleteScore(s.scoreId)
                    if (ok) { toast.success('Score deleted'); onClose() }
                    else { toast.error('Failed to delete'); setConfirmDelete(false) }
                  }} className="text-xs font-medium px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs g-btn-ghost">Cancel</button>
                </div>
              )}
              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)' }} />
              <button onClick={onClose} className="text-2xl leading-none transition-colors" style={{ color: '#555' }}
                onMouseEnter={e => e.target.style.color='#fff'} onMouseLeave={e => e.target.style.color='#555'}>×</button>
            </div>
          </div>

          {/* Row 2: Agent names — max 3 columns, capped at 75% width */}
          {agentNames.length > 0 && (
            <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'start', maxWidth: '75%' }}>
              {agentNames.map((name, i) => (
                <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full text-center"
                  style={{ color: '#FF9780', background: 'rgba(255,151,128,0.08)' }}>
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Row 3: Verdict badge + score */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border"
              style={{ color: vc.text, background: vc.bg, borderColor: vc.border, letterSpacing: '0.04em', boxShadow: `0 0 12px ${vc.text}44` }}>
              {vc.icon} {vc.label}
            </span>
            <span className="text-2xl font-bold tabular-nums" style={{ color: vc.text }}>
              {animatedScore}<span className="text-sm font-normal ml-0.5" style={{ color: '#666' }}>/100</span>
            </span>
            {s.overrideVerdict && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                Human reviewed
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-6 space-y-4">
          {/* Auto-fail */}
          {s.auto_fail?.triggered && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#ef4444' }}>⚠ Auto-Fail Triggered</p>
              <ul className="space-y-1">{s.auto_fail.reasons.map((r, i) => <li key={i} className="text-sm" style={{ color: '#fca5a5' }}>• {r}</li>)}</ul>
            </div>
          )}

          {/* Dimension summary strip */}
          <DimensionStrip dimensions={[
            { name: 'Inquiry Resolution',  weight: '50%', average: inquiry_resolution.dimension_average },
            { name: 'Internal Processes',  weight: '25%', average: internal_processes.dimension_average },
            { name: 'Customer Perception', weight: '25%', average: customer_perception.dimension_average },
          ]} />

          {/* Criteria detail */}
          <div>
            <DimensionCard name="Inquiry Resolution" weight="50%" average={inquiry_resolution.dimension_average}
              rows={[
                { label: 'Core Resolution',    data: inquiry_resolution.core_inquiry_resolved },
                { label: 'Troubleshooting',    data: inquiry_resolution.troubleshooting_procedure },
                { label: 'Forward Resolution', data: inquiry_resolution.forward_resolution },
              ]} />
            <DimensionCard name="Internal Processes" weight="25%" average={internal_processes.dimension_average}
              rows={[{ label: 'Ticket Handling', data: internal_processes.ticket_handling_procedure }]} />
            <DimensionCard name="Customer Perception" weight="25%" average={customer_perception.dimension_average}
              rows={[
                { label: 'Tone & Professionalism', data: customer_perception.tone_professionalism },
                { label: 'Communication Clarity',  data: customer_perception.communication_clarity },
              ]} />
          </div>

          {/* Summary */}
          <div className="rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#777' }}>Summary</p>
            <p className="text-sm leading-relaxed" style={{ color: '#ccc' }}>{s.summary}</p>
          </div>

          {/* What went well */}
          <WhatWentWell scores={s.scores} />

          {/* Coaching cards */}
          {s.key_improvements?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#777' }}>Key Improvements</p>
              <div className="flex flex-col gap-2">
                {s.key_improvements.map((imp, i) => (
                  <div key={i} className="rounded-xl p-3.5 flex gap-3"
                    style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: 'rgba(255,151,128,0.12)', color: '#FF9780' }}>
                      {i + 1}
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>{imp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviewer note — key forces remount on re-score so note state resets */}
          <NotesSection key={s.scoreId} scoreId={s.scoreId} initialNote={s.reviewerNote} />

          {/* Acknowledgment */}
          {s.scoreId && (
            <div className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ background: s.acknowledged ? 'rgba(16,185,129,0.05)' : '#0f0f0f', border: `1px solid ${s.acknowledged ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'}` }}>
              {s.acknowledged ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#10b981' }}>✓ Acknowledged</span>
                  {s.acknowledgedAt && (
                    <span className="text-xs" style={{ color: '#555' }}>
                      {new Date(s.acknowledgedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: '#777' }}>Agent hasn't acknowledged this score yet</p>
                  <button
                    onClick={async () => {
                      setAcknowledging(true)
                      const ok = await acknowledgeScore(s.scoreId)
                      setAcknowledging(false)
                      if (ok) {
                        setLiveScore(prev => ({ ...(prev ?? s), acknowledged: true, acknowledgedAt: Date.now() }))
                        toast.success('Score marked as seen')
                      } else {
                        toast.error('Failed to acknowledge')
                      }
                    }}
                    disabled={acknowledging}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    style={{ color: '#888', border: '1px solid rgba(255,255,255,0.1)', opacity: acknowledging ? 0.5 : 1 }}
                    onMouseEnter={e => { if (!acknowledging) e.currentTarget.style.color = '#10b981' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#888' }}>
                    {acknowledging ? 'Saving…' : 'Mark as seen'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Dispute */}
          <DisputeSection
            key={`dsp-${s.scoreId}`}
            scoreId={s.scoreId}
            disputed={s.disputed}
            disputeNote={s.disputeNote}
            disputeAt={s.disputeAt}
          />

          {/* Override */}
          <OverrideSection
            key={`ovr-${s.scoreId}`}
            scoreId={s.scoreId}
            currentVerdict={s.verdict}
            currentScore={s.weighted_score}
            overrideVerdict={s.overrideVerdict}
            overrideScore={s.overrideScore}
            overrideNote={s.overrideNote}
            overrideAt={s.overrideAt}
          />
        </div>
      </div>
    </div>

    {/* Slack notify preview */}
    {showNotifyPreview && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        onClick={() => !notifying && setShowNotifyPreview(false)}>
        <div className="rounded-2xl w-full max-w-md modal-enter"
          style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/><path fill="#2EB67D" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/><path fill="#ECB22E" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/><path fill="#36C5F0" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
              <h3 className="text-white font-semibold text-sm">Send Slack DM</h3>
            </div>
            <button onClick={() => setShowNotifyPreview(false)} className="text-xl leading-none transition-colors" style={{ color: '#555' }}
              onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = '#555'}>×</button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Recipients */}
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#666' }}>Sending to</p>
              <div className="flex flex-col gap-1.5">
                {matchedAgents.filter(a => a.email).map(a => (
                  <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: '#161616' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'rgba(255,151,128,0.15)', color: '#FF9780' }}>
                      {a.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{a.name}</p>
                      <p className="text-xs" style={{ color: '#777' }}>{a.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Message preview */}
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#666' }}>Message preview</p>
              <div className="rounded-xl px-4 py-3 flex flex-col gap-2.5" style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{{'PASS':'✅','NEEDS_REVIEW':'⚠️','FAIL':'❌'}[s.verdict] || '❓'}</span>
                  <a href={gorgiasTicketUrl(s.ticket_id)} target="_blank" rel="noreferrer"
                    className="text-sm font-semibold transition-colors"
                    style={{ color: '#fff' }}
                    onMouseEnter={e => e.currentTarget.style.color='#FF9780'}
                    onMouseLeave={e => e.currentTarget.style.color='#fff'}>
                    Ticket #{s.ticket_id}
                  </a>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: VERDICT[displayVerdict]?.text, background: VERDICT[displayVerdict]?.bg }}>
                    {displayVerdict?.replace('_', ' ')}
                  </span>
                  <span className="text-sm font-bold ml-auto" style={{ color: VERDICT[displayVerdict]?.text }}>
                    {Math.round(displayScore)}/100
                  </span>
                </div>
                {s.summary && (
                  <p className="text-xs leading-relaxed" style={{ color: '#aaa' }}>{s.summary}</p>
                )}
                {s.key_improvements?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: '#777' }}>Key Improvements</p>
                    {s.key_improvements.slice(0, 3).map((imp, i) => (
                      <p key={i} className="text-xs leading-relaxed" style={{ color: '#888' }}>{i + 1}. {imp}</p>
                    ))}
                  </div>
                )}
                {s.reviewerNote && (
                  <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: '#777' }}>Reviewer Note</p>
                    <p className="text-xs leading-relaxed italic" style={{ color: '#888' }}>{s.reviewerNote}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t flex gap-2 justify-end" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <button onClick={() => setShowNotifyPreview(false)} disabled={notifying}
              className="text-sm px-4 py-2 rounded-xl g-btn-ghost">
              Cancel
            </button>
            <button onClick={sendNotification} disabled={notifying}
              className="g-btn-primary text-sm px-5 py-2 rounded-xl flex items-center gap-2"
              style={{ opacity: notifying ? 0.6 : 1 }}>
              {notifying
                ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sending…</>
                : 'Send DM'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
