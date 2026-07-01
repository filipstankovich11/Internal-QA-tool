import { useState, useMemo, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import TicketTranscript from '../components/TicketTranscript'
import Linkify from '../components/Linkify'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { gradeColor } from '../lib/verdict'

const CONF = {
  high:   { label: 'High confidence',   color: '#2F8F5B', bg: '#E6F4EC' },
  medium: { label: 'Medium confidence', color: '#C8841E', bg: '#FBEBD3' },
  low:    { label: 'Low confidence',    color: '#B84A2E', bg: '#FFEAE6' },
}

const CARD = { background: '#fff', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'NEEDS REVIEW', FAIL: 'FAIL' }

// 1–5 pill selector
function Pills({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => {
        const sel = value === n
        return (
          <button key={n} type="button" onClick={() => onChange(n)}
            className="flex items-center justify-center text-sm font-semibold rounded-lg transition-colors"
            style={{ width: 34, height: 34, border: `1px solid ${sel ? '#FF9780' : '#E1DCD7'}`, background: sel ? '#FF9780' : '#fff', color: sel ? '#1A1E23' : 'rgba(26,30,35,.6)' }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#FBF7F3' }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = '#fff' }}>
            {n}
          </button>
        )
      })}
    </div>
  )
}

// Full-page editor for a committed score — opened via "Edit score". Pre-filled
// with the AI's grades; saving records a human override.
export default function ScoreFormPage({ initialScore, onClose, onSaved }) {
  const { rubric, overrideScore, scoreHistory, updateReviewerEvidence } = useApp()
  const { canScore } = useAuth()
  const toast = useToast()

  const dims = rubric?.dimensions || []
  const thresholds = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  const autoFailConds = rubric?.auto_fail_conditions || []
  const ticketId = initialScore.ticket_id

  // The AI's original per-criterion scores — baseline for the agree/override read-out
  const aiScores = useMemo(() => {
    const m = {}
    if (initialScore?.scores) dims.forEach(d => d.criteria.forEach(c => {
      const v = initialScore.scores[d.id]?.[c.id]?.score
      if (v != null) m[c.id] = Math.max(1, Math.min(5, Math.round(v)))
    }))
    return m
  }, [initialScore, dims])

  // The AI's per-criterion rationale (its notes) — shown under the focused criterion
  const aiNotes = useMemo(() => {
    const m = {}
    if (initialScore?.scores) dims.forEach(d => d.criteria.forEach(c => {
      const n = initialScore.scores[d.id]?.[c.id]?.notes
      if (n) m[c.id] = n
    }))
    return m
  }, [initialScore, dims])

  // Per-criterion AI confidence + evidence (message ids) — present on newly-scored tickets
  const aiMeta = useMemo(() => {
    const m = {}
    if (initialScore?.scores) dims.forEach(d => d.criteria.forEach(c => {
      const cell = initialScore.scores[d.id]?.[c.id]
      if (cell) m[c.id] = { confidence: cell.confidence, evidence: (cell.evidence || []).map(String) }
    }))
    return m
  }, [initialScore, dims])

  // criterionId -> 1..5 (pre-filled from the AI score)
  const [scores, setScores] = useState(() => {
    const init = {}
    dims.forEach(d => d.criteria.forEach(c => { init[c.id] = aiScores[c.id] ?? 3 }))
    return init
  })
  const [autoFails, setAutoFails] = useState(() => {
    if (!initialScore?.auto_fail?.triggered) return []
    const names = initialScore.auto_fail.conditions || []
    return autoFailConds.filter(c => names.includes(c.name)).map(c => c.id)
  })
  const [note, setNote] = useState(initialScore?.reviewerNote || initialScore?.overrideNote || '')
  const allCrit = useMemo(() => dims.flatMap(d => d.criteria.map(c => c.id)), [dims])
  const [focusIdx, setFocusIdx] = useState(-1)  // -1 = nothing focused yet — no default evidence highlight
  const [activeCrit, setActiveCrit] = useState(null)   // criterion whose evidence is highlighted / being tagged
  const critName = (id) => dims.flatMap(d => d.criteria).find(c => c.id === id)?.name || ''

  // Reviewer-tagged evidence (persisted, separate from the AI's own citations) —
  // live off scoreHistory so edits round-trip through the DB write.
  const reviewerEvidence = scoreHistory.find(s => s.id === initialScore.scoreId)?.reviewerEvidence || {}
  const toggleReviewerEvidence = (critId, msgId) => {
    if (!critId) return
    const key = String(msgId)
    const cur = reviewerEvidence[critId] || []
    const next = cur.includes(key) ? cur.filter(x => x !== key) : [...cur, key]
    updateReviewerEvidence(initialScore.scoreId, { ...reviewerEvidence, [critId]: next })
  }
  // Transcript highlight for the focused criterion = AI's citations + the reviewer's own tags
  const evidenceIds = activeCrit
    ? [...new Set([...(aiMeta[activeCrit]?.evidence || []), ...(reviewerEvidence[activeCrit] || [])])]
    : []
  // Coverage: messages the reviewer has tagged for any OTHER criterion
  const taggedElsewhere = [...new Set(
    Object.entries(reviewerEvidence).flatMap(([critId, ids]) => critId === activeCrit ? [] : (ids || []).map(String))
  )]

  const dimAvg = (d) => {
    const vals = d.criteria.map(c => scores[c.id]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const total = useMemo(() => Math.round(dims.reduce((sum, d) => sum + (dimAvg(d) / 5) * (d.weight || 0), 0)), [scores, dims]) // eslint-disable-line
  const verdict = autoFails.length ? 'FAIL' : total >= thresholds.pass ? 'PASS' : total >= thresholds.needs_review ? 'NEEDS_REVIEW' : 'FAIL'
  const vColor = verdict === 'PASS' ? '#2F8F5B' : verdict === 'NEEDS_REVIEW' ? '#C8841E' : '#D14B3D'
  const vBg    = verdict === 'PASS' ? '#E6F4EC' : verdict === 'NEEDS_REVIEW' ? '#FBEBD3' : '#FCE9E6'

  const toggleAutoFail = (id) => setAutoFails(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const submit = async () => {
    await overrideScore(initialScore.scoreId, { verdict, score: total, note: note.trim() })
    toast.success('Score revised')
    onSaved?.()
  }

  // Keyboard scoring: 1–5 score the focused criterion, ↑/↓ move, ⌘↵ submit.
  // Subscribe once and read the latest values through a ref (avoids re-binding
  // the listener on every keystroke in the coaching note).
  const latest = useRef(null)
  latest.current = { focusIdx, canScore, submit, allCrit }
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
      const { focusIdx, canScore, submit, allCrit } = latest.current
      if (e.key >= '1' && e.key <= '5' && allCrit[focusIdx]) { setScores(s => ({ ...s, [allCrit[focusIdx]]: +e.key })) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, allCrit.length - 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (canScore) submit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Evidence highlight follows the focused criterion (keyboard or click)
  useEffect(() => { setActiveCrit(allCrit[focusIdx] || null) }, [focusIdx, allCrit])

  // ── Derived for the layout ───────────────────────────────────────────────────
  const agentChips = (initialScore.agent_senders || []).map(a => a.name).filter(Boolean)
  // What went well: AI's `strengths` when present, else derive from high-scoring criteria notes
  const derivedWell = dims.flatMap(d => d.criteria).filter(c => (aiScores[c.id] || 0) >= 4 && aiNotes[c.id]).map(c => aiNotes[c.id]).slice(0, 3)
  const wentWell = initialScore.strengths?.length ? initialScore.strengths : derivedWell
  const toFix = initialScore?.key_improvements || []
  // Per-message inline annotations from the AI: { msgId: [{ type, note }] }
  const annotationMap = useMemo(() => {
    const m = {}
    ;(initialScore?.annotations || []).forEach(a => {
      if (a?.message_id == null) return
      const id = String(a.message_id)
      ;(m[id] = m[id] || []).push({ type: a.type === 'good' ? 'good' : 'bad', note: a.note || '' })
    })
    return m
  }, [initialScore])

  // One framed shell; each pane scrolls independently within the editor's height
  const content = (
    <div className="grid lg:grid-cols-2 overflow-hidden" style={{ ...CARD, height: '100%' }}>
        {/* Left — ticket + conversation */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto" style={{ borderRight: '1px solid #EEEEEE' }}>
          {/* Ticket meta + title */}
          <div>
            <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'rgba(26,30,35,.5)' }}>
              <a href={gorgiasTicketUrl(ticketId)} target="_blank" rel="noreferrer" className="font-medium" style={{ color: '#B84A2E' }}>#{ticketId}</a>
              <span>·</span><span>Gorgias</span>
            </div>
            {initialScore.ticket_subject && (
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.3 }}>{initialScore.ticket_subject}</h2>
            )}
          </div>

          {/* Agent chips */}
          {agentChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {agentChips.map((n, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ color: '#B84A2E', background: '#FFF4F1', border: '1px solid #FFE0D6' }}>{n}</span>
              ))}
            </div>
          )}

          {/* Conversation highlights (AI) */}
          {(wentWell.length > 0 || toFix.length > 0) && (
            <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.45)' }}>Conversation highlights</p>
              {wentWell.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: '#2F8F5B' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    What went well
                  </p>
                  <ul className="flex flex-col gap-1">
                    {wentWell.map((t, i) => <li key={i} className="text-xs leading-relaxed pl-3" style={{ color: 'rgba(26,30,35,.7)', textIndent: '-0.6rem' }}>· <Linkify text={t} /></li>)}
                  </ul>
                </div>
              )}
              {toFix.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: '#D14B3D' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    What to fix
                  </p>
                  <ul className="flex flex-col gap-1">
                    {toFix.map((t, i) => <li key={i} className="text-xs leading-relaxed pl-3" style={{ color: 'rgba(26,30,35,.7)', textIndent: '-0.6rem' }}>· <Linkify text={t} /></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Conversation transcript — click a criterion to see its evidence, click a
              message to tag/untag it as evidence for whichever criterion is focused */}
          <TicketTranscript ticketId={ticketId} evidenceIds={evidenceIds} annotations={annotationMap}
            taggedIds={taggedElsewhere}
            onToggleMessage={activeCrit ? (id) => toggleReviewerEvidence(activeCrit, id) : undefined}
            taggingLabel={activeCrit ? critName(activeCrit) : null} />
        </div>

        {/* Right — scoring (flat: dividers + boxed live-score/auto-fail/coaching) */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Live score */}
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #EEEEEE' }}>
            <div className="flex items-start justify-between mb-2.5 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(26,30,35,.45)' }}>Live score</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="tabular-nums" style={{ fontSize: 40, fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, color: gradeColor(total, thresholds), lineHeight: 1 }}>{total}</span>
                  <span className="text-sm" style={{ color: 'rgba(26,30,35,.45)' }}>/100</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: vColor, background: vBg }}>{VERDICT_LABEL[verdict]}</span>
                <p className="text-xs mt-1.5" style={{ color: 'rgba(26,30,35,.4)' }}>Pass ≥ {thresholds.pass} · Review ≥ {thresholds.needs_review}</p>
              </div>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: '#F0ECE9' }}>
              <div style={{ width: `${total}%`, height: '100%', background: gradeColor(total, thresholds), transition: 'width .35s cubic-bezier(.16,1,.3,1)' }} />
            </div>
            {autoFails.length > 0 && <p className="text-xs mt-2" style={{ color: '#D14B3D' }}>Auto-fail triggered — verdict forced to FAIL.</p>}
          </div>

          {/* Dimensions — flat sections */}
          <div className="flex flex-col">
            {dims.map((d) => (
              <div key={d.id} className="py-4" style={{ borderTop: '1px solid #EEEEEE' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold flex items-center gap-2" style={{ fontSize: 15, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif" }}>
                    {d.name}
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#FFEAE6', color: '#B84A2E', fontWeight: 600 }}>{d.weight}%</span>
                  </p>
                  <span className="text-sm font-bold tabular-nums" style={{ color: gradeColor((dimAvg(d) / 5) * 100, thresholds) }}>{dimAvg(d).toFixed(1)}<span className="text-xs font-normal" style={{ color: 'rgba(26,30,35,.45)' }}>/5</span></span>
                </div>
                <div className="flex flex-col gap-1">
                  {d.criteria.map(c => {
                    const idx = allCrit.indexOf(c.id)
                    const focused = idx === focusIdx
                    const ai = aiScores[c.id]
                    const diff = ai != null && scores[c.id] !== ai
                    const conf = CONF[aiMeta[c.id]?.confidence]
                    const ev = aiMeta[c.id]?.evidence || []
                    const tagged = reviewerEvidence[c.id] || []
                    return (
                      <div key={c.id} onClick={() => setFocusIdx(idx)}
                        className="rounded-lg px-2.5 py-2 -mx-2.5 transition-colors cursor-pointer"
                        style={{ background: focused ? '#FBF7F3' : 'transparent' }}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm min-w-0 flex items-center gap-2 flex-wrap" style={{ color: '#1A1E23' }}>
                            {c.name}
                            {conf && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ color: conf.color, background: conf.bg }}>{conf.label}</span>
                            )}
                            {ai != null && (
                              <span className="text-xs font-medium" style={{ color: diff ? '#B84A2E' : 'rgba(26,30,35,.4)' }}>
                                {diff ? `overrode ${ai}→${scores[c.id]}` : `matches AI (${ai})`}
                              </span>
                            )}
                          </span>
                          <Pills value={scores[c.id]} onChange={(n) => { setScores(s => ({ ...s, [c.id]: n })); setFocusIdx(idx) }} />
                        </div>
                        {focused && aiNotes[c.id] && (
                          <p className="text-xs mt-2 leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>
                            <span className="font-semibold" style={{ color: '#B84A2E' }}>AI rationale · </span><Linkify text={aiNotes[c.id]} />
                          </p>
                        )}
                        {(ev.length > 0 || tagged.length > 0) && (
                          <p className="text-xs mt-1" style={{ color: focused ? '#B84A2E' : 'rgba(26,30,35,.4)' }}>
                            {focused
                              ? [ev.length && `${ev.length} AI cited`, tagged.length && `${tagged.length} you tagged`].filter(Boolean).join(' · ') + ' — click a message to tag/untag'
                              : [ev.length && `${ev.length} cited`, tagged.length && `${tagged.length} tagged`].filter(Boolean).join(' · ') + ' — click to focus'}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Auto-fail conditions */}
          {autoFailConds.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #EEEEEE' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: '#D14B3D' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Auto-fail conditions
              </p>
              <div className="flex flex-col gap-2.5">
                {autoFailConds.map(c => {
                  const on = autoFails.includes(c.id)
                  return (
                    <button key={c.id} type="button" onClick={() => toggleAutoFail(c.id)}
                      className="flex items-start gap-2.5 text-left rounded-lg px-3 py-2 transition-colors"
                      style={{ background: on ? '#FEF6F4' : 'transparent', border: `1px solid ${on ? '#F4DDD7' : 'transparent'}` }}>
                      <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5"
                        style={{ border: `1.5px solid ${on ? '#D14B3D' : '#E1DCD7'}`, background: on ? '#D14B3D' : '#fff' }}>
                        {on && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="text-sm" style={{ color: '#1A1E23' }}>{c.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Coaching note */}
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #EEEEEE' }}>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'rgba(26,30,35,.45)' }}>Coaching note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="What should this agent do differently next time?"
              className="w-full text-sm resize-none" style={{ color: '#1A1E23', border: 'none', outline: 'none', background: 'transparent', padding: 0 }} />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs" style={{ color: 'rgba(26,30,35,.4)' }}>Press <b style={{ color: 'rgba(26,30,35,.6)' }}>1–5</b> · <b style={{ color: 'rgba(26,30,35,.6)' }}>↑↓</b> · <b style={{ color: 'rgba(26,30,35,.6)' }}>⌘↵</b></p>
            <button onClick={submit} disabled={!canScore}
              className="g-btn-primary text-sm px-5 py-2.5 rounded-xl font-medium inline-flex items-center gap-2 ml-auto"
              style={{ opacity: canScore ? 1 : 0.5 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Save revision
            </button>
          </div>
        </div>
      </div>
  )

  // Full-page editor shell (opened from "Edit score")
  return (
    <div className="h-screen flex flex-col" style={{ background: '#FFF9F4' }}>
      <div className="flex items-center gap-3 px-6 py-3 shrink-0" style={{ borderBottom: '1px solid #EEEEEE', background: '#fff' }}>
        <button onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'rgba(26,30,35,.6)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#B84A2E'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,30,35,.6)'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          Back
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif" }}>
          Score ticket{ticketId ? ` · #${ticketId}` : ''}
        </span>
      </div>
      <div className="flex-1 min-h-0 px-6 py-5">
        {content}
      </div>
    </div>
  )
}
