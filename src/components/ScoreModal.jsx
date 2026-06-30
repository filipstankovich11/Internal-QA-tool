import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from '../context/NavigationContext'
import { useToast } from './Toast'
import { authFetch, buildFewShotExamples } from '../lib/api'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_BORDER, VERDICT_WASH, VERDICTS } from '../lib/verdict'
import TicketTranscript from './TicketTranscript'

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

// Rich verdict styling — colors come from the shared tokens (lib/verdict)
const VERDICT = {
  PASS:         { label: 'PASS',         icon: '✓', text: VERDICT_COLOR.PASS,         bg: VERDICT_BG.PASS,         border: VERDICT_BORDER.PASS,         wash: VERDICT_WASH.PASS         },
  NEEDS_REVIEW: { label: 'NEEDS REVIEW', icon: '~', text: VERDICT_COLOR.NEEDS_REVIEW, bg: VERDICT_BG.NEEDS_REVIEW, border: VERDICT_BORDER.NEEDS_REVIEW, wash: VERDICT_WASH.NEEDS_REVIEW },
  FAIL:         { label: 'FAIL',         icon: '✗', text: VERDICT_COLOR.FAIL,         bg: VERDICT_BG.FAIL,         border: VERDICT_BORDER.FAIL,         wash: VERDICT_WASH.FAIL         },
}

const scoreColor = n => n >= 4 ? '#2F8F5B' : n >= 3 ? '#C8841E' : '#D14B3D'
const CONF = {
  high:   { label: 'High',   color: '#2F8F5B', bg: '#E6F4EC' },
  medium: { label: 'Medium', color: '#C8841E', bg: '#FBEBD3' },
  low:    { label: 'Low',    color: '#B84A2E', bg: '#FFEAE6' },
}

// ── 5-dot score indicator ─────────────────────────────────────────────────────
function ScoreDots({ score }) {
  const color = scoreColor(score)
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="rounded-full transition-all"
          style={{
            width: 8, height: 8,
            background: i <= score ? color : '#F0ECE9',
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
        const avg   = Number(average)
        const color = scoreColor(avg)
        const pct   = (avg / 5) * 100
        return (
          <div key={name} className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tabular-nums" style={{ color }}>{isFinite(avg) ? avg.toFixed(1) : '—'}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: '#B84A2E', background: '#FFF4F1' }}>{weight}</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: '#F0ECE9' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
            </div>
            <p className="text-xs leading-tight" style={{ color: 'rgba(26,30,35,.6)' }}>{name}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Criteria row with dots ────────────────────────────────────────────────────
function SubScoreRow({ label, data, onActivate }) {
  const [open, setOpen] = useState(false)
  const { score, notes, confidence, evidence } = data
  const color = scoreColor(score)
  const conf = CONF[confidence]
  const ev = (evidence || []).map(String)
  // Expanding a criterion highlights its cited messages in the transcript
  const toggle = () => setOpen(v => { const nv = !v; if (nv && ev.length) onActivate?.(ev); return nv })

  return (
    <div className="py-2.5" style={{ borderBottom: '1px solid #F0ECE9' }}>
      <button onClick={toggle} className="w-full flex items-center gap-3 text-left">
        <span className="shrink-0 transition-transform" style={{ color: 'rgba(26,30,35,.45)', display:'inline-block', fontSize: '1rem', width: '1rem', transform: open ? 'rotate(90deg)':'rotate(0deg)' }}>▶</span>
        <span className="text-sm flex-1" style={{ color: 'rgba(26,30,35,.72)' }}>{label}</span>
        {ev.length > 0 && <span title={`${ev.length} cited message${ev.length>1?'s':''}`} style={{ width: 6, height: 6, borderRadius: 99, background: '#FF9780', flexShrink: 0 }} />}
        <ScoreDots score={score} />
        <span className="text-xs font-semibold w-6 text-right shrink-0 tabular-nums" style={{ color }}>{score}/5</span>
      </button>
      {open && (
        <div className="mt-2 ml-6">
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>{notes}</p>
          {(conf || ev.length > 0) && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {conf && (
                <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'rgba(26,30,35,.5)' }}>
                  AI confidence <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ color: conf.color, background: conf.bg }}>{conf.label}</span>
                </span>
              )}
              {ev.length > 0 && (
                <button onClick={() => onActivate?.(ev)}
                  className="text-[11px] inline-flex items-center gap-1 transition-colors" style={{ color: '#B84A2E' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#FF9780'} onMouseLeave={e => e.currentTarget.style.color = '#B84A2E'}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: '#FF9780' }} />
                  Show {ev.length} cited message{ev.length > 1 ? 's' : ''} in transcript
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DimensionCard({ name, weight, average, rows, isOpen, onToggle, onActivate }) {
  const avg = typeof average === 'number' ? average : Number(average) || 0
  const color = scoreColor(avg)

  return (
    <div className="rounded-xl mb-2 overflow-hidden"
      style={{ background: '#FBF7F3', border: `1px solid ${isOpen ? '#E1DCD7' : '#F0ECE9'}`, transition: 'border-color 250ms' }}>

      {/* Header — always visible, click to toggle */}
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5"
        style={{ cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left' }}>
        <div className="flex items-center gap-2.5">
          {/* Rotating chevron */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ color: isOpen ? '#FF9780' : 'rgba(26,30,35,.45)', transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1), color 200ms', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: isOpen ? '#1A1E23' : 'rgba(26,30,35,.72)', transition: 'color 200ms' }}>{name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold tabular-nums" style={{ color }}>{avg.toFixed(1)}<span style={{ color: 'rgba(26,30,35,.45)', fontWeight: 400 }}>/5</span></span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#B84A2E', background: '#FFF4F1' }}>{weight}</span>
        </div>
      </button>

      {/* Animated body — 900px ceiling gives room for expanded SubScoreRows */}
      <div style={{
        maxHeight: isOpen ? '900px' : '0px',
        opacity: isOpen ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 420ms cubic-bezier(0.4,0,0.2,1), opacity 250ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F0ECE9' }}>
          <div style={{ paddingTop: 4 }}>
            {rows.map(r => <SubScoreRow key={r.label} label={r.label} data={r.data} onActivate={onActivate} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function DimensionAccordion({ inquiry_resolution, internal_processes, customer_perception, onActivate }) {
  const [openDim, setOpenDim] = useState(-1) // start collapsed — no dimension auto-opens
  const toggle = i => setOpenDim(prev => prev === i ? -1 : i)
  return (
    <div>
      <DimensionCard name="Inquiry Resolution" weight="50%" average={inquiry_resolution.dimension_average}
        isOpen={openDim === 0} onToggle={() => toggle(0)} onActivate={onActivate}
        rows={[
          { label: 'Core Resolution',    data: inquiry_resolution.core_inquiry_resolved },
          { label: 'Troubleshooting',    data: inquiry_resolution.troubleshooting_procedure },
          { label: 'Forward Resolution', data: inquiry_resolution.forward_resolution },
        ]} />
      <DimensionCard name="Internal Processes" weight="25%" average={internal_processes.dimension_average}
        isOpen={openDim === 1} onToggle={() => toggle(1)} onActivate={onActivate}
        rows={[{ label: 'Ticket Handling', data: internal_processes.ticket_handling_procedure }]} />
      <DimensionCard name="Customer Perception" weight="25%" average={customer_perception.dimension_average}
        isOpen={openDim === 2} onToggle={() => toggle(2)} onActivate={onActivate}
        rows={[
          { label: 'Tone & Professionalism', data: customer_perception.tone_professionalism },
          { label: 'Communication Clarity',  data: customer_perception.communication_clarity },
        ]} />
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
    <div className="rounded-xl p-4" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.5)' }}>Reviewer Note</p>
        {saved && <span className="text-xs" style={{ color: '#2F8F5B' }}>Saved</span>}
        {!editing && canScore && scoreId && (
          <button onClick={() => setEditing(true)}
            className="text-xs font-medium transition-colors" style={{ color: '#FF9780' }}
            onMouseEnter={e => e.target.style.color='#B84A2E'} onMouseLeave={e => e.target.style.color='#FF9780'}>
            {note ? 'Edit' : '+ Add note'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea ref={textareaRef} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a reviewer note — observations, coaching points, context…"
            rows={3} className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-none outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23' }}
            onKeyDown={e => { if (e.key === 'Escape') cancel() }} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="g-btn-primary text-xs px-3 py-1.5 rounded-lg"
              style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={cancel} className="g-btn-ghost text-xs px-3 py-1.5">Cancel</button>
          </div>
        </div>
      ) : note ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(26,30,35,.72)' }}>{note}</p>
      ) : (
        <p className="text-sm" style={{ color: 'rgba(26,30,35,.5)' }}>
          {canScore && scoreId ? 'No note yet — click "Add note" to leave feedback.' : 'No reviewer note.'}
        </p>
      )}
    </div>
  )
}

function OverrideSection({ scoreId, actions = false, currentVerdict, currentScore, overrideVerdict, overrideScore, overrideNote, overrideAt }) {
  const { overrideScore: saveOverride } = useApp()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [open,    setOpen]    = useState(false)
  const [verdict, setVerdict] = useState(overrideVerdict || currentVerdict || 'PASS')
  const [score,   setScore]   = useState(overrideScore   ?? currentScore ?? 80)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  // Editing is only allowed where the modal is in "work" mode (My Queue).
  // Elsewhere an existing override still shows, read-only.
  const canEdit = actions && isAdmin

  if (!scoreId) return null
  if (!overrideVerdict && !canEdit) return null

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
    <div className="rounded-xl p-4" style={{ background: hasOverride ? 'rgba(99,102,241,0.06)' : '#FBF7F3', border: `1px solid ${hasOverride ? 'rgba(99,102,241,0.25)' : '#F0ECE9'}` }}>
      {hasOverride ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#818cf8' }}>
              ⊘ Human Override
            </p>
            {saved && <span className="text-xs" style={{ color: '#2F8F5B' }}>Saved</span>}
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: vc.text, background: vc.bg, border: `1px solid ${vc.border}` }}>
              {vc.icon} {vc.label} · {overrideScore?.toFixed(0)}/100
            </span>
          </div>
          {canEdit && (
            <button onClick={() => setOpen(v => !v)}
              className="text-xs font-medium transition-colors" style={{ color: 'rgba(26,30,35,.6)' }}
              onMouseEnter={e => e.target.style.color='#818cf8'} onMouseLeave={e => e.target.style.color='rgba(26,30,35,.6)'}>
              {open ? 'Cancel' : 'Edit override'}
            </button>
          )}
        </div>
      ) : canEdit ? (
        <button onClick={() => setOpen(v => !v)}
          className="w-[85%] mx-auto block text-sm font-semibold py-2 rounded-lg transition-all"
          style={{ color: '#B84A2E', background: '#FFF4F1', border: '1px solid #FFEAE6' }}
          onMouseEnter={e => { e.currentTarget.style.background='#FFEAE6' }}
          onMouseLeave={e => { e.currentTarget.style.background='#FFF4F1' }}>
          {open ? 'Cancel' : 'Override Score'}
        </button>
      ) : null}

      {hasOverride && !open && overrideNote && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>{overrideNote}</p>
      )}
      {hasOverride && overrideAt && !open && (
        <p className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.45)' }}>
          Overridden {new Date(overrideAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Verdict picker */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'rgba(26,30,35,.6)' }}>New verdict</p>
            <div className="flex gap-2">
              {VERDICTS.map(v => {
                const vc2 = VERDICT[v]
                const active = verdict === v
                return (
                  <button key={v} onClick={() => setVerdict(v)}
                    className="flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all"
                    style={active
                      ? { color: vc2.text, background: vc2.bg, borderColor: vc2.border }
                      : { color: 'rgba(26,30,35,.6)', borderColor: '#E7E3DF' }}>
                    {vc2.icon} {vc2.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Score slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Adjusted score</p>
              <span className="text-sm font-bold tabular-nums"
                style={{ color: score >= 80 ? '#2F8F5B' : score >= 60 ? '#C8841E' : '#D14B3D' }}>
                {parseFloat(score).toFixed(0)}/100
              </span>
            </div>
            <input type="range" min="0" max="100" step="1"
              value={score} onChange={e => setScore(e.target.value)}
              className="w-full" style={{ accentColor: '#FF9780' }} />
          </div>

          {/* Reason (required) */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'rgba(26,30,35,.6)' }}>Reason <span style={{ color: '#D14B3D' }}>*</span></p>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Required — explain why you're overriding the AI score…"
              rows={2} className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23' }} />
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
  if (!scores) return null
  const all = Object.values(scores).flatMap(dim =>
    Object.entries(dim)
      .filter(([k, v]) => k !== 'dimension_average' && v?.score != null)
      .map(([, v]) => v)
  )
  const top = [...all].sort((a, b) => b.score - a.score).slice(0, 2).filter(c => c.score >= 4)
  if (!top.length) return null

  return (
    <div className="rounded-xl p-4" style={{ background: '#E6F4EC', border: '1px solid #BFE3CD' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#2F8F5B' }}>What went well</p>
      <div className="flex flex-col gap-2">
        {top.map((c, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: '#2F8F5B' }}>✓</span>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{c.notes}</p>
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
  // Only agents can flag a dispute. Admins see this section only once a dispute
  // exists (so they can review/clear it) — never the "Flag for dispute" action.
  if (isAdmin && !disputed) return null

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
      style={{ background: disputed ? '#FEF6F4' : '#FBF7F3', border: `1px solid ${disputed ? '#F4DDD7' : '#F0ECE9'}` }}>
      {disputed ? (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#C8841E' }}>
            ⚑ Disputed
          </p>
          {isAdmin && (
            <button onClick={clear} disabled={saving}
              className="text-xs font-medium transition-colors" style={{ color: 'rgba(26,30,35,.6)' }}
              onMouseEnter={e => e.target.style.color='#2F8F5B'}
              onMouseLeave={e => e.target.style.color='rgba(26,30,35,.6)'}>
              Clear dispute
            </button>
          )}
        </div>
      ) : (
        <button onClick={() => setOpen(v => !v)}
          className="w-[85%] mx-auto block text-sm font-semibold py-2 rounded-lg transition-all"
          style={{ color: '#D14B3D', background: '#FEF6F4', border: '1px solid #F4DDD7' }}
          onMouseEnter={e => { e.currentTarget.style.background='#FDEEEA' }}
          onMouseLeave={e => { e.currentTarget.style.background='#FEF6F4' }}>
          {open ? 'Cancel' : 'Flag for dispute'}
        </button>
      )}

      {disputed && disputeNote && !open && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>{disputeNote}</p>
      )}
      {disputed && disputeAt && (
        <p className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.45)' }}>
          Flagged {new Date(disputeAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Describe why this score is incorrect or unfair…"
            rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23' }} />
          <button onClick={submit} disabled={!note.trim() || saving}
            className="text-sm py-2 rounded-xl font-medium transition-all"
            style={{ background: '#FBEFD9', color: '#C8841E', border: '1px solid #EBD3A3', opacity: !note.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Submitting…' : 'Submit Dispute'}
          </button>
        </div>
      )}
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

export default function ScoreModal({ score, onClose, actions = false, variant = null }) {
  const { agents, addScore, deleteScore, acknowledgeScore, markReviewed, reopenReview, rubric, scoreHistory, openScoreEditor } = useApp()
  const { isAdmin, user } = useAuth()
  const navigateTo = useNavigate()
  const toast = useToast()
  const [confirmDelete,   setConfirmDelete]   = useState(false)
  const [rescoring,       setRescoring]       = useState(false)
  const [liveScore,       setLiveScore]       = useState(null)
  const [acknowledging,   setAcknowledging]   = useState(false)
  const [notifying,         setNotifying]         = useState(false)
  const [showNotifyPreview, setShowNotifyPreview] = useState(false)
  const [selectedAgentIds,  setSelectedAgentIds]  = useState([])

  // Use liveScore after a re-score, fall back to the original prop
  const s = liveScore ?? score

  // Reviewed state pulled from the live record (so it updates after marking)
  const record    = s.scoreId ? scoreHistory.find(x => x.id === s.scoreId) : null
  const reviewed  = !!record?.reviewedAt
  const [reviewing,      setReviewing]      = useState(false)
  const [confirmReview,  setConfirmReview]  = useState(false)
  const [notifyOnReview, setNotifyOnReview] = useState(true)
  const [activeEvidence, setActiveEvidence] = useState([])  // criterion's cited message ids → transcript highlight
  const [menuOpen,       setMenuOpen]       = useState(false) // header "⋯" overflow menu

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
    setSelectedAgentIds(agentsWithEmail.map(a => a.id))
    setShowNotifyPreview(true)
  }

  const sendNotification = async () => {
    const agentsWithEmail = matchedAgents.filter(a => a.email && selectedAgentIds.includes(a.id))
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
      const res  = await authFetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: String(s.ticket_id), rubric, few_shot_examples: buildFewShotExamples(scoreHistory) }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Re-score failed'); return }
      const entry = await addScore(data)
      setLiveScore({ ...data, scoreId: entry?.id, reviewerNote: '', overrideVerdict: null, overrideScore: null, overrideNote: null, overrideAt: null })
      toast.success('Ticket re-scored')
    } catch { toast.error('Could not reach the server') }
    finally { setRescoring(false) }
  }

  // Mark reviewed — opens a confirmation with an optional Slack notify
  const canNotify = matchedAgents.some(a => a.email)
  const openReviewConfirm = () => {
    setSelectedAgentIds(matchedAgents.filter(a => a.email).map(a => a.id))
    setNotifyOnReview(canNotify)
    setConfirmReview(true)
  }
  const confirmMarkReviewed = async () => {
    setReviewing(true)
    if (notifyOnReview && canNotify) await sendNotification()
    const err = await markReviewed(s.scoreId)
    setReviewing(false)
    setConfirmReview(false)
    if (err) toast.error(`Failed: ${err.message || 'could not mark reviewed'}`)
    else toast.success('Marked reviewed')
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose, variant])

  // Close the "⋯" menu on any outside click (deferred so the opening click doesn't close it)
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [menuOpen])

  const inner = (
    <>
    {/* Mark-reviewed confirmation */}
    {confirmReview && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(2px)' }}
        onClick={() => { if (!reviewing) setConfirmReview(false) }}>
        <div className="rounded-2xl p-6 w-full max-w-sm modal-enter" onClick={e => e.stopPropagation()}
          style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 24px 64px rgba(0,0,0,.18)' }}>
          <h3 className="font-semibold mb-1.5" style={{ color: '#1A1E23' }}>Mark this ticket reviewed?</h3>
          <p className="text-sm mb-4 leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>
            It leaves the review queue and releases your claim. Confident in the score
            {displayScore != null && <> — <span style={{ color: vc.text, fontWeight: 600 }}>{Math.round(displayScore)}/100 · {vc.label}</span></>}?
          </p>
          {canNotify ? (
            <label className="flex items-center gap-2.5 mb-5 cursor-pointer text-sm" style={{ color: 'rgba(26,30,35,.72)' }}>
              <input type="checkbox" checked={notifyOnReview} onChange={e => setNotifyOnReview(e.target.checked)}
                style={{ accentColor: '#FF9780', width: 15, height: 15 }} />
              Notify {agentNames[0] || 'the agent'} on Slack
            </label>
          ) : (
            <p className="text-xs mb-5" style={{ color: 'rgba(26,30,35,.5)' }}>No agent email on file — can't send a Slack notification.</p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmReview(false)} disabled={reviewing} className="g-btn-ghost text-sm px-3 py-2">Cancel</button>
            <button onClick={confirmMarkReviewed} disabled={reviewing}
              className="g-btn-primary text-sm px-4 py-2 rounded-xl" style={{ opacity: reviewing ? 0.6 : 1 }}>
              {reviewing ? 'Working…' : (notifyOnReview && canNotify ? 'Notify & mark reviewed' : 'Mark reviewed')}
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Sticky header — colour-washed by verdict */}
        <div className="sticky top-0 z-10 px-6 pt-5 pb-5 rounded-t-2xl"
          style={{ background: '#FFFFFF', borderBottom: `1px solid ${vc.border}`, boxShadow: '0 6px 16px -12px rgba(0,0,0,.22)' }}>

          {/* Row 1: Ticket ID (left) + Actions (right) — actions wrap on narrow panes */}
          <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
            <a href={gorgiasTicketUrl(s.ticket_id)} target="_blank" rel="noreferrer"
              className="text-xs transition-colors shrink-0 mt-1.5"
              style={{ color: '#B84A2E' }}
              onMouseEnter={e => e.currentTarget.style.color='#FF9780'}
              onMouseLeave={e => e.currentTarget.style.color='#B84A2E'}>
              Ticket #{s.ticket_id}
            </a>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {/* Work actions — only on My Queue; elsewhere the modal is view-only */}
              {actions && (<>
              {/* Primary: mark reviewed / reviewed status */}
              {isAdmin && s.scoreId && !confirmDelete && !reviewed && (
                <button onClick={openReviewConfirm} disabled={reviewing}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-all"
                  style={{ background: '#E6F4EC', border: '1px solid #BFE3CD', color: reviewing ? 'rgba(26,30,35,.45)' : '#2F8F5B', cursor: reviewing ? 'not-allowed' : 'pointer' }}
                  onMouseEnter={e => { if (!reviewing) { e.currentTarget.style.background = '#D7EEE0'; e.currentTarget.style.borderColor = '#9FD4B4' } }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#E6F4EC'; e.currentTarget.style.borderColor = '#BFE3CD' }}
                  title="Mark this ticket reviewed — removes it from the queue and releases your claim">
                  {reviewing ? 'Marking…' : '✓ Mark reviewed'}
                </button>
              )}
              {isAdmin && s.scoreId && !confirmDelete && reviewed && (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
                    style={{ background: '#E6F4EC', color: '#2F8F5B', border: '1px solid #BFE3CD' }}
                    title={record?.reviewedBy === user?.id ? 'Reviewed by you' : 'Reviewed'}>
                    ✓ Reviewed{record?.reviewedAt ? ` · ${new Date(record.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </span>
                  <button onClick={() => reopenReview(s.scoreId)} className="text-xs transition-colors" style={{ color: 'rgba(26,30,35,.6)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#FF9780'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,30,35,.6)'}
                    title="Re-open — puts it back in the queue">Re-open</button>
                </span>
              )}
              {/* Primary: edit score */}
              {isAdmin && s.scoreId && !confirmDelete && (
                <button onClick={() => openScoreEditor(s)}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-all"
                  style={{ background: '#FFFFFF', border: '1px solid #E7E3DF', color: 'rgba(26,30,35,.72)' }}
                  onMouseEnter={e => { e.currentTarget.style.background='#F6F2EF'; e.currentTarget.style.color='#B84A2E'; e.currentTarget.style.borderColor='#FFD2C9' }}
                  onMouseLeave={e => { e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.color='rgba(26,30,35,.72)'; e.currentTarget.style.borderColor='#E7E3DF' }}
                  title="Re-grade this ticket against the rubric (overrides the score)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  Edit score
                </button>
              )}
              {/* Secondary actions — collapsed into a "⋯" menu */}
              {s.scoreId && !confirmDelete && (
                <div className="relative">
                  <button onClick={() => setMenuOpen(o => !o)} disabled={rescoring || notifying}
                    className="flex items-center justify-center rounded-lg transition-all"
                    style={{ background: menuOpen ? '#F6F2EF' : '#FFFFFF', border: '1px solid #E7E3DF', color: 'rgba(26,30,35,.6)', width: 30, height: 30 }}
                    onMouseEnter={e => { e.currentTarget.style.background='#F6F2EF' }}
                    onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background='#FFFFFF' }}
                    title="More actions">
                    {(rescoring || notifying)
                      ? <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>}
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 py-1 rounded-xl overflow-hidden"
                      style={{ top: 'calc(100% + 6px)', minWidth: 184, background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 12px 32px rgba(0,0,0,.16)', zIndex: 30 }}>
                      {isAdmin && (
                        <button onClick={() => { setMenuOpen(false); openNotifyPreview() }}
                          className="w-full flex items-center gap-2.5 text-left text-xs px-3.5 py-2.5 transition-colors" style={{ color: 'rgba(26,30,35,.78)' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F6F2EF'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <svg width="13" height="13" viewBox="0 0 24 24"><path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/><path fill="#2EB67D" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/><path fill="#ECB22E" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/><path fill="#36C5F0" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                          Notify on Slack
                        </button>
                      )}
                      <button onClick={() => { setMenuOpen(false); rescore() }}
                        className="w-full flex items-center gap-2.5 text-left text-xs px-3.5 py-2.5 transition-colors" style={{ color: 'rgba(26,30,35,.78)' }}
                        onMouseEnter={e => e.currentTarget.style.background='#F6F2EF'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <RefreshIcon /> Re-score with AI
                      </button>
                      {isAdmin && (
                        <button onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                          className="w-full flex items-center gap-2.5 text-left text-xs px-3.5 py-2.5 transition-colors" style={{ color: '#D14B3D' }}
                          onMouseEnter={e => e.currentTarget.style.background='#FDEEEA'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          Delete score
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Delete confirmation — replaces the toolbar while active */}
              {confirmDelete && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#D14B3D' }}>Delete?</span>
                  <button onClick={async () => {
                    const ok = await deleteScore(s.scoreId)
                    if (ok) { toast.success('Score deleted'); onClose() }
                    else { toast.error('Failed to delete'); setConfirmDelete(false) }
                  }} className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: '#FDEEEA', color: '#D14B3D', border: '1px solid #F4DDD7' }}>Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: '#FFFFFF', color: 'rgba(26,30,35,.72)', border: '1px solid #E7E3DF' }}>Cancel</button>
                </div>
              )}
              <div style={{ width: '1px', height: '20px', background: '#EEEEEE', margin: '0 2px' }} />
              </>)}
              <button onClick={onClose} title="Close"
                className="flex items-center justify-center rounded-lg transition-all"
                style={{ background: '#FFFFFF', border: '1px solid #E7E3DF', color: 'rgba(26,30,35,.45)', width: 30, height: 30, fontSize: 18, lineHeight: 1 }}
                onMouseEnter={e => { e.currentTarget.style.background='#F6F2EF'; e.currentTarget.style.color='rgba(26,30,35,.72)' }}
                onMouseLeave={e => { e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.color='rgba(26,30,35,.45)' }}>×</button>
            </div>
          </div>

          {/* Row 2: Agent names — all clickable, navigate to Agents page */}
          {agentNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {agentNames.map((name, i) => (
                <button key={i}
                  onClick={() => { navigateTo('agents'); onClose() }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: '#B84A2E', background: '#FFF4F1', border: '1px solid #FFEAE6', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background='#FFEAE6'; e.currentTarget.style.borderColor='#FF9780' }}
                  onMouseLeave={e => { e.currentTarget.style.background='#FFF4F1'; e.currentTarget.style.borderColor='#FFEAE6' }}
                  title={`Go to ${name}`}>
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Row 3: Verdict badge + score */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border"
              style={{ color: vc.text, background: vc.bg, borderColor: vc.border, letterSpacing: '0.04em' }}>
              {vc.icon} {vc.label}
            </span>
            <span className="text-2xl font-bold tabular-nums" style={{ color: vc.text }}>
              {animatedScore}<span className="text-sm font-normal ml-0.5" style={{ color: 'rgba(26,30,35,.45)' }}>/100</span>
            </span>
            {s.overrideVerdict && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
                Human reviewed
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-6 space-y-4">
          {/* Auto-fail */}
          {s.auto_fail?.triggered && (
            <div className="rounded-xl p-4" style={{ background: '#FEF6F4', border: '1px solid #F4DDD7' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#D14B3D' }}>⚠ Auto-Fail Triggered</p>
              <ul className="space-y-1">{(s.auto_fail.reasons || []).map((r, i) => <li key={i} className="text-sm" style={{ color: 'rgba(26,30,35,.72)' }}>• {r}</li>)}</ul>
            </div>
          )}

          {/* Dimension breakdown — guarded against incomplete score data */}
          {inquiry_resolution && internal_processes && customer_perception ? (
            <>
              <DimensionStrip dimensions={[
                { name: 'Inquiry Resolution',  weight: '50%', average: inquiry_resolution.dimension_average },
                { name: 'Internal Processes',  weight: '25%', average: internal_processes.dimension_average },
                { name: 'Customer Perception', weight: '25%', average: customer_perception.dimension_average },
              ]} />

              {/* Criteria detail — accordion, one open at a time */}
              <DimensionAccordion
                inquiry_resolution={inquiry_resolution}
                internal_processes={internal_processes}
                customer_perception={customer_perception}
                onActivate={setActiveEvidence}
              />
            </>
          ) : (
            <p className="text-xs px-1" style={{ color: 'rgba(26,30,35,.5)' }}>Detailed dimension breakdown unavailable for this score.</p>
          )}

          {/* Summary */}
          <div className="rounded-xl p-4" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>Summary</p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{s.summary}</p>
          </div>

          {/* What went well */}
          <WhatWentWell scores={s.scores} />

          {/* Coaching cards */}
          {s.key_improvements?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>Key Improvements</p>
              <div className="flex flex-col gap-2">
                {s.key_improvements.map((imp, i) => (
                  <div key={i} className="rounded-xl p-3.5 flex gap-3"
                    style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: '#FFEAE6', color: '#B84A2E' }}>
                      {i + 1}
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{imp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviewer note — key forces remount on re-score so note state resets */}
          <NotesSection key={s.scoreId} scoreId={s.scoreId} initialNote={s.reviewerNote} />

          {/* Acknowledgment — only agents can mark as seen */}
          {s.scoreId && !isAdmin && (
            <div className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ background: s.acknowledged ? '#E6F4EC' : '#FBF7F3', border: `1px solid ${s.acknowledged ? '#BFE3CD' : '#F0ECE9'}` }}>
              {s.acknowledged ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#2F8F5B' }}>✓ Acknowledged</span>
                  {s.acknowledgedAt && (
                    <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>
                      {new Date(s.acknowledgedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>Agent hasn't acknowledged this score yet</p>
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
                    style={{ color: 'rgba(26,30,35,.6)', background: '#FFFFFF', border: '1px solid #E7E3DF', opacity: acknowledging ? 0.5 : 1 }}
                    onMouseEnter={e => { if (!acknowledging) e.currentTarget.style.color = '#2F8F5B' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.6)' }}>
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
            actions={actions}
            currentVerdict={s.verdict}
            currentScore={s.weighted_score}
            overrideVerdict={s.overrideVerdict}
            overrideScore={s.overrideScore}
            overrideNote={s.overrideNote}
            overrideAt={s.overrideAt}
          />
    </div>
    </>
  )

  const notifyEl = showNotifyPreview ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        style={{ background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(4px)' }}
        onClick={() => !notifying && setShowNotifyPreview(false)}>
        <div className="rounded-2xl w-full max-w-md modal-enter"
          style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 24px 64px rgba(0,0,0,.18)' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#EEEEEE' }}>
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/><path fill="#2EB67D" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/><path fill="#ECB22E" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/><path fill="#36C5F0" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
              <h3 className="font-semibold text-sm" style={{ color: '#1A1E23' }}>Send Slack DM</h3>
            </div>
            <button onClick={() => setShowNotifyPreview(false)} className="text-xl leading-none transition-colors" style={{ color: 'rgba(26,30,35,.45)' }}
              onMouseEnter={e => e.target.style.color = 'rgba(26,30,35,.72)'} onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.45)'}>×</button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Recipients — click to toggle */}
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>Sending to</p>
              <div className="flex flex-col gap-1.5">
                {matchedAgents.filter(a => a.email).map(a => {
                  const selected = selectedAgentIds.includes(a.id)
                  const toggle = () => setSelectedAgentIds(prev =>
                    selected ? prev.filter(id => id !== a.id) : [...prev, a.id]
                  )
                  return (
                    <button key={a.id} onClick={toggle}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl w-full text-left transition-all"
                      style={{
                        background: selected ? '#FFF4F1' : '#FBF7F3',
                        border: `1px solid ${selected ? '#FFEAE6' : '#F0ECE9'}`,
                        opacity: selected ? 1 : 0.55,
                      }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: '#FFEAE6', color: '#B84A2E' }}>
                        {a.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: '#1A1E23' }}>{a.name}</p>
                        <p className="text-xs truncate" style={{ color: 'rgba(26,30,35,.5)' }}>{a.email}</p>
                      </div>
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: selected ? '#FF9780' : '#EEEEEE' }}>
                        {selected && <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Message preview */}
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(26,30,35,.5)' }}>Message preview</p>
              <div className="rounded-xl px-4 py-3 flex flex-col gap-2.5" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{{'PASS':'✅','NEEDS_REVIEW':'⚠️','FAIL':'❌'}[s.verdict] || '❓'}</span>
                  <a href={gorgiasTicketUrl(s.ticket_id)} target="_blank" rel="noreferrer"
                    className="text-sm font-semibold transition-colors"
                    style={{ color: '#1A1E23' }}
                    onMouseEnter={e => e.currentTarget.style.color='#FF9780'}
                    onMouseLeave={e => e.currentTarget.style.color='#1A1E23'}>
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
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{s.summary}</p>
                )}
                {s.key_improvements?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'rgba(26,30,35,.5)' }}>Key Improvements</p>
                    {s.key_improvements.slice(0, 3).map((imp, i) => (
                      <p key={i} className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>{i + 1}. {imp}</p>
                    ))}
                  </div>
                )}
                {s.reviewerNote && (
                  <div className="pt-2" style={{ borderTop: '1px solid #F0ECE9' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: 'rgba(26,30,35,.5)' }}>Reviewer Note</p>
                    <p className="text-xs leading-relaxed italic" style={{ color: 'rgba(26,30,35,.6)' }}>{s.reviewerNote}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t flex gap-2 justify-end" style={{ borderColor: '#EEEEEE' }}>
            <button onClick={() => setShowNotifyPreview(false)} disabled={notifying}
              className="text-sm px-4 py-2 rounded-xl g-btn-ghost">
              Cancel
            </button>
            <button onClick={sendNotification} disabled={notifying || selectedAgentIds.length === 0}
              className="g-btn-primary text-sm px-5 py-2 rounded-xl flex items-center gap-2"
              style={{ opacity: notifying || selectedAgentIds.length === 0 ? 0.5 : 1 }}>
              {notifying
                ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sending…</>
                : 'Send DM'}
            </button>
          </div>
        </div>
      </div>
  ) : null

  // Per-message AI annotations: { msgId: [{ type, note }] }
  const annMap = {}
  ;(s.annotations || []).forEach(a => {
    if (a?.message_id == null) return
    const id = String(a.message_id)
    ;(annMap[id] = annMap[id] || []).push({ type: a.type === 'good' ? 'good' : 'bad', note: a.note || '' })
  })

  // Conversation transcript (left) — shared by the page + modal two-pane layouts
  const transcriptPane = (
    <div className="flex-1 min-w-0 h-full overflow-y-auto px-6 py-6" style={{ background: '#FFF9F4' }}>
      {variant === 'page' && (
        <button onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm mb-4 transition-colors" style={{ color: 'rgba(26,30,35,.6)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#B84A2E'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,30,35,.6)'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          Back
        </button>
      )}
      <TicketTranscript ticketId={s.ticket_id} evidenceIds={activeEvidence} annotations={annMap} />
    </div>
  )

  // Full-page two-pane — fills the content area (sidebar stays visible)
  if (variant === 'page') return (
    <>
    <div className="flex h-screen overflow-hidden">
      {transcriptPane}
      <div className="h-full overflow-y-auto shrink-0" style={{ width: 620, background: '#FFFFFF', borderLeft: '1px solid #EEEEEE' }}>
        {inner}
      </div>
    </div>
    {notifyEl}
    </>
  )

  // Large centered two-pane modal — the default (used in the review queue)
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
      style={{ background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="rounded-2xl w-full overflow-hidden modal-enter flex"
        style={{ maxWidth: 1240, height: '90vh', background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 24px 64px rgba(0,0,0,.18)' }}
        onClick={e => e.stopPropagation()}>
        {transcriptPane}
        <div className="h-full overflow-y-auto shrink-0" style={{ width: 560, borderLeft: '1px solid #EEEEEE' }}>
          {inner}
        </div>
      </div>
    </div>
    {notifyEl}
    </>
  )
}
