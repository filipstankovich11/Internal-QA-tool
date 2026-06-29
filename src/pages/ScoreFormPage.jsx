import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Dropdown from '../components/Dropdown'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetchJson } from '../lib/api'
import { gradeColor } from '../lib/verdict'

const CONF = {
  high:   { label: 'High confidence',   color: '#2F8F5B', bg: '#E6F4EC' },
  medium: { label: 'Medium confidence', color: '#C8841E', bg: '#FBEBD3' },
  low:    { label: 'Low confidence',    color: '#B84A2E', bg: '#FFEAE6' },
}

const CARD = { background: '#fff', border: '1px solid #EEEEEE', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }
const DIM_PALETTE = ['#FF9780', '#F2AE6D', '#FFB39A', '#E08F3C', '#FFC2A8'] // contribution-bar segments
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

export default function ScoreFormPage({ initialScore = null, asModal = false, onClose, onSaved }) {
  const { rubric, agents, addScore, overrideScore } = useApp()
  const { canScore } = useAuth()
  const toast = useToast()

  const dims = rubric?.dimensions || []
  const thresholds = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  const autoFailConds = rubric?.auto_fail_conditions || []
  const editing = !!initialScore   // editing an existing (AI-)scored ticket

  // The AI's original per-criterion scores — baseline for the agree/override read-out
  const aiScores = useMemo(() => {
    const m = {}
    if (initialScore?.scores) dims.forEach(d => d.criteria.forEach(c => {
      const v = initialScore.scores[d.id]?.[c.id]?.score
      if (v != null) m[c.id] = Math.max(1, Math.min(5, Math.round(v)))
    }))
    return m
  }, [initialScore, dims])

  // The AI's per-criterion rationale (its notes) — shown under each criterion when editing
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
  const improvements = initialScore?.key_improvements || []   // AI coaching snippets

  // criterionId -> 1..5 (pre-filled from the AI score when editing, else neutral 3)
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
  const [note, setNote]   = useState(initialScore?.reviewerNote || initialScore?.overrideNote || '')
  const [ticketUrl, setTicketUrl] = useState('')
  const [agentId, setAgentId] = useState(() => {
    const senders = initialScore?.agent_senders || []
    return agents.find(a => senders.some(s =>
      (s.email && a.email?.toLowerCase() === s.email?.toLowerCase()) ||
      (s.gorgias_user_id && a.gorgias_user_id === s.gorgias_user_id)))?.id || ''
  })
  const [submitted, setSubmitted] = useState(false)
  const allCrit = useMemo(() => dims.flatMap(d => d.criteria.map(c => c.id)), [dims])
  const [focusIdx, setFocusIdx] = useState(0)
  const [transcript, setTranscript] = useState(null)   // null = not loaded; [] = none
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [activeCrit, setActiveCrit] = useState(null)   // criterion whose evidence is highlighted
  const evidenceIds = activeCrit ? (aiMeta[activeCrit]?.evidence || []) : []

  const dimAvg = (d) => {
    const vals = d.criteria.map(c => scores[c.id]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const total = useMemo(() => Math.round(dims.reduce((sum, d) => sum + (dimAvg(d) / 5) * (d.weight || 0), 0)), [scores, dims]) // eslint-disable-line
  const verdict = autoFails.length ? 'FAIL' : total >= thresholds.pass ? 'PASS' : total >= thresholds.needs_review ? 'NEEDS_REVIEW' : 'FAIL'
  const vColor = verdict === 'PASS' ? '#2F8F5B' : verdict === 'NEEDS_REVIEW' ? '#C8841E' : '#D14B3D'
  const vBg    = verdict === 'PASS' ? '#E6F4EC' : verdict === 'NEEDS_REVIEW' ? '#FBEBD3' : '#FCE9E6'

  const toggleAutoFail = (id) => setAutoFails(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const ticketId = editing ? initialScore.ticket_id : (ticketUrl.match(/(\d{4,})/) || [])[1] || ''

  const submit = async () => {
    // Editing a committed score → record the human revision as an override
    if (editing) {
      await overrideScore(initialScore.scoreId, { verdict, score: total, note: note.trim() })
      toast.success('Score revised')
      onSaved?.()
      return
    }
    const scoresObj = {}
    dims.forEach(d => {
      const dim = { dimension_average: +dimAvg(d).toFixed(2) }
      d.criteria.forEach(c => { dim[c.id] = { score: scores[c.id], notes: '' } })
      scoresObj[d.id] = dim
    })
    const agent = agents.find(a => a.id === agentId)
    const saved = await addScore({
      ticket_id:      ticketId || `manual-${Date.now()}`,
      ticket_subject: '',
      verdict,
      weighted_score: total,
      summary:        note.trim(),
      scores:         scoresObj,
      key_improvements: [],
      agent_senders:  agent ? [{ name: agent.name, email: agent.email, gorgias_user_id: agent.gorgias_user_id }] : [],
      auto_fail:      { triggered: autoFails.length > 0, conditions: autoFails.map(id => autoFailConds.find(c => c.id === id)?.name).filter(Boolean) },
      manual:         true,
    })
    if (saved?.error) { toast.error(`Couldn't save the score: ${saved.error.message || 'database error'}`); return }
    setSubmitted(true)
    toast.success('Score submitted')
  }

  // Keyboard scoring: 1–5 score the focused criterion, ↑/↓ move, ⌘↵ submit
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
      if (e.key >= '1' && e.key <= '5' && allCrit[focusIdx]) { setScores(s => ({ ...s, [allCrit[focusIdx]]: +e.key })) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, allCrit.length - 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (canScore && !submitted) submit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusIdx, allCrit, canScore, submitted, scores, autoFails, note, agentId, ticketUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the ticket conversation for the transcript (edit mode only)
  useEffect(() => {
    if (!editing || !ticketId) return
    let cancelled = false
    setLoadingMsgs(true)
    authFetchJson(`/api/ticket-messages?ticket_id=${ticketId}`)
      .then(({ data }) => { if (!cancelled) setTranscript(data?.messages || []) })
      .catch(() => { if (!cancelled) setTranscript([]) })
      .finally(() => { if (!cancelled) setLoadingMsgs(false) })
    return () => { cancelled = true }
  }, [editing, ticketId])

  // Evidence highlight follows the focused criterion (keyboard or click)
  useEffect(() => { if (editing) setActiveCrit(allCrit[focusIdx] || null) }, [focusIdx, editing, allCrit])

  const content = (
    <div className="max-w-5xl mx-auto px-8 pt-8 pb-14">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 style={{ fontSize: 30, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>{editing ? 'Score ticket' : 'Grade a ticket'}</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(26,30,35,.6)' }}>
            {editing ? `Pre-filled with the AI's grades for #${ticketId}. Adjust any criterion — press 1–5 to score. Saving overrides the committed score.` : 'Score a ticket against the rubric — the total and verdict update as you go.'}
          </p>
        </div>
        {editing && (
          <span className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0 inline-flex items-center gap-1.5" style={{ background: '#FFF4F1', border: '1px solid #FFE0D6', color: '#B84A2E' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a3 3 0 0 0-3 3v.5a3 3 0 0 0-2 5.3V13a3 3 0 0 0 5 2.2 3 3 0 0 0 5-2.2v-1.2a3 3 0 0 0-2-5.3V6a3 3 0 0 0-3-3Z"/></svg>
            AI-assisted scoring
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* Left — ticket context */}
        <div className="p-5 flex flex-col gap-4" style={CARD}>
          <p className="g-label" style={{ margin: 0 }}>Ticket</p>
          {editing ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <a href={gorgiasTicketUrl(ticketId)} target="_blank" rel="noreferrer" className="font-mono text-sm font-medium" style={{ color: '#B84A2E' }}>#{ticketId}</a>
                <span className="text-sm" style={{ color: 'rgba(26,30,35,.72)' }}>{initialScore.ticket_subject || ''}</span>
              </div>
              {initialScore.summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(26,30,35,.45)' }}>AI summary</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>{initialScore.summary}</p>
                </div>
              )}
              {/* Conversation transcript — clicking a criterion rings its evidence */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.45)' }}>Conversation</p>
                  {evidenceIds.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: '#FFF4F1', border: '1px solid #FFE0D6', color: '#B84A2E' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: '#FF9780' }} />
                      {evidenceIds.length} cited
                    </span>
                  )}
                </div>
                {loadingMsgs ? (
                  <p className="text-xs py-6 text-center" style={{ color: 'rgba(26,30,35,.45)' }}>Loading conversation…</p>
                ) : (transcript && transcript.length) ? (
                  <div className="flex flex-col gap-2.5 overflow-y-auto pr-1" style={{ maxHeight: 440 }}>
                    {transcript.map(m => {
                      const lit = evidenceIds.includes(String(m.id))
                      const agent = m.from_agent
                      return (
                        <div key={m.id} style={{ alignSelf: agent ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
                          <div className="flex items-center gap-1.5 mb-0.5 text-xs" style={{ color: 'rgba(26,30,35,.45)', justifyContent: agent ? 'flex-end' : 'flex-start' }}>
                            <span className="font-medium" style={{ color: 'rgba(26,30,35,.6)' }}>{m.author || (agent ? 'Agent' : 'Customer')}</span>
                            {!m.public && <span className="px-1 rounded" style={{ background: '#F1ECE8' }}>internal</span>}
                          </div>
                          <div className="text-sm leading-relaxed px-3.5 py-2.5 whitespace-pre-wrap" style={{
                            background: agent ? '#FFF4F1' : '#F6F4F2', color: '#1A1E23',
                            borderRadius: 16, borderTopRightRadius: agent ? 4 : 16, borderTopLeftRadius: agent ? 16 : 4,
                            boxShadow: lit ? '0 0 0 2px #FF9780, 0 1px 6px rgba(255,151,128,.3)' : 'none',
                            transition: 'box-shadow .2s ease',
                          }}>{(m.body || '').trim() || '(no text)'}</div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs py-3 leading-relaxed" style={{ color: 'rgba(26,30,35,.45)' }}>
                    Couldn’t load the conversation here. <a href={gorgiasTicketUrl(ticketId)} target="_blank" rel="noreferrer" style={{ color: '#B84A2E' }}>Open #{ticketId} in Gorgias →</a>
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <input value={ticketUrl} onChange={e => setTicketUrl(e.target.value)}
                placeholder="https://yourcompany.gorgias.com/app/ticket/…"
                className="g-input rounded-lg px-3 py-2.5 text-sm" />
              {ticketId && (
                <a href={gorgiasTicketUrl(ticketId)} target="_blank" rel="noreferrer"
                  className="text-sm font-medium" style={{ color: '#B84A2E' }}>→ Open ticket #{ticketId} in Gorgias</a>
              )}
            </>
          )}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'rgba(26,30,35,.6)' }}>Agent graded</label>
            <Dropdown value={agentId} onChange={setAgentId} width="100%" avatars
              options={[{ value: '', label: 'No agent' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} />
          </div>
          <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9', color: 'rgba(26,30,35,.6)' }}>
            {editing
              ? 'Pre-filled with the AI’s scores. Adjust any criterion — “Overrode” shows where you differ from the AI. Saving overrides the committed score.'
              : 'Open the full conversation in Gorgias for context, then grade each criterion on the right. The conversation isn’t stored in the QA app.'}
          </div>
        </div>

        {/* Right — live grading */}
        <div className="flex flex-col gap-4">
          {/* Score card */}
          <div className="p-5" style={CARD}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="tabular-nums" style={{ fontSize: 34, fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, color: gradeColor(total, thresholds) }}>{total}</span>
                <span className="text-sm" style={{ color: 'rgba(26,30,35,.45)' }}>/100</span>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: vColor, background: vBg }}>{VERDICT_LABEL[verdict]}</span>
            </div>
            {/* Contribution bar — total split by each dimension's weighted points */}
            <div className="w-full rounded-full overflow-hidden flex" style={{ height: 8, background: '#F0ECE9' }}>
              {dims.map((d, i) => {
                const contrib = (dimAvg(d) / 5) * (d.weight || 0)
                return <div key={d.id} title={`${d.name}: ${contrib.toFixed(1)} pts`}
                  style={{ width: `${contrib}%`, background: DIM_PALETTE[i % DIM_PALETTE.length], transition: 'width .35s cubic-bezier(.16,1,.3,1)' }} />
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {dims.map((d, i) => (
                <span key={d.id} className="flex items-center gap-1 text-xs" style={{ color: 'rgba(26,30,35,.55)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: DIM_PALETTE[i % DIM_PALETTE.length] }} />
                  {d.name} <span className="tabular-nums font-medium" style={{ color: 'rgba(26,30,35,.72)' }}>{((dimAvg(d) / 5) * (d.weight || 0)).toFixed(1)}</span>
                </span>
              ))}
            </div>
            {autoFails.length > 0 && <p className="text-xs mt-2" style={{ color: '#D14B3D' }}>Auto-fail triggered — verdict forced to FAIL.</p>}
            <p className="text-xs mt-2" style={{ color: 'rgba(26,30,35,.4)' }}>Press <b style={{ color: 'rgba(26,30,35,.6)' }}>1–5</b> to score · <b style={{ color: 'rgba(26,30,35,.6)' }}>↑↓</b> to move · <b style={{ color: 'rgba(26,30,35,.6)' }}>⌘↵</b> to submit</p>
          </div>

          {/* Dimension cards */}
          {dims.map(d => (
            <div key={d.id} className="p-5" style={CARD}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold" style={{ fontSize: 15, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif" }}>{d.name}
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#FFEAE6', color: '#B84A2E', fontWeight: 600 }}>{d.weight}%</span>
                </p>
                <span className="text-sm font-bold tabular-nums" style={{ color: gradeColor((dimAvg(d) / 5) * 100, thresholds) }}>{dimAvg(d).toFixed(1)}<span className="text-xs font-normal" style={{ color: 'rgba(26,30,35,.45)' }}>/5</span></span>
              </div>
              <div className="flex flex-col gap-1">
                {d.criteria.map(c => {
                  const idx = allCrit.indexOf(c.id)
                  const focused = idx === focusIdx
                  const ai = aiScores[c.id]
                  const diff = editing && ai != null && scores[c.id] !== ai
                  const conf = editing ? CONF[aiMeta[c.id]?.confidence] : null
                  const ev = editing ? (aiMeta[c.id]?.evidence || []) : []
                  return (
                    <div key={c.id} onClick={() => setFocusIdx(idx)}
                      className="rounded-lg px-2 py-2 -mx-2 transition-colors cursor-pointer"
                      style={{ background: focused ? '#FFF4F1' : 'transparent', boxShadow: focused ? 'inset 0 0 0 1px #FFD2C9' : 'none' }}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm min-w-0 flex items-center gap-2 flex-wrap" style={{ color: 'rgba(26,30,35,.72)' }}>
                          {c.name}
                          {conf && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ color: conf.color, background: conf.bg }}>{conf.label}</span>
                          )}
                          {editing && ai != null && (
                            <span className="text-xs font-medium" style={{ color: diff ? '#B84A2E' : 'rgba(26,30,35,.4)' }}>
                              {diff ? `overrode ${ai}→${scores[c.id]}` : `matches AI (${ai})`}
                            </span>
                          )}
                        </span>
                        <Pills value={scores[c.id]} onChange={(n) => { setScores(s => ({ ...s, [c.id]: n })); setFocusIdx(idx) }} />
                      </div>
                      {editing && aiNotes[c.id] && (
                        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'rgba(26,30,35,.55)' }}>
                          <span className="font-medium" style={{ color: 'rgba(26,30,35,.45)' }}>AI: </span>{aiNotes[c.id]}
                        </p>
                      )}
                      {ev.length > 0 && (
                        <p className="text-xs mt-1" style={{ color: focused ? '#B84A2E' : 'rgba(26,30,35,.4)' }}>
                          {focused ? `↖ Highlighted ${ev.length} cited message${ev.length > 1 ? 's' : ''} in the transcript` : `${ev.length} cited message${ev.length > 1 ? 's' : ''} — click to highlight`}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Auto-fail */}
          {autoFailConds.length > 0 && (
            <div className="p-5" style={{ ...CARD, border: '1px solid #F4DDD7' }}>
              <p className="g-label mb-3" style={{ margin: 0, color: '#D14B3D' }}>Auto-fail conditions</p>
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

          {/* Coaching note + submit */}
          <div className="p-5" style={CARD}>
            <label className="g-label block mb-2" style={{ margin: 0 }}>Coaching note</label>
            {improvements.length > 0 && (
              <div className="mb-2">
                <p className="text-xs mb-1.5" style={{ color: 'rgba(26,30,35,.45)' }}>AI suggestions — tap to add</p>
                <div className="flex flex-col gap-1.5">
                  {improvements.map((imp, i) => (
                    <button key={i} type="button" onClick={() => setNote(n => n.trim() ? `${n.trim()}\n• ${imp}` : `• ${imp}`)}
                      className="text-xs text-left rounded-lg px-3 py-2 transition-colors" style={{ background: '#FFF4F1', border: '1px solid #FFE0D6', color: '#B84A2E' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FFEAE6'} onMouseLeave={e => e.currentTarget.style.background = '#FFF4F1'}>
                      + {imp}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="What went well, what to improve…"
              className="g-input w-full rounded-xl px-3 py-2.5 text-sm resize-none" style={{ color: '#1A1E23' }} />
            {submitted ? (
              <div className="mt-3 flex items-center gap-2 text-sm rounded-xl px-3 py-2.5" style={{ background: '#E6F4EC', border: '1px solid #BFE3CD', color: '#2F8F5B' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Score submitted — {total}/100 · {VERDICT_LABEL[verdict]}
              </div>
            ) : (
              <button onClick={submit} disabled={!canScore}
                className="g-btn-primary w-full mt-3 text-sm py-2.5 rounded-xl font-medium"
                style={{ opacity: canScore ? 1 : 0.5 }}>
                {editing ? 'Save revision' : 'Submit score'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (asModal) return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: 'rgba(26,30,35,.45)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <button onClick={onClose} aria-label="Close"
        className="fixed right-5 top-5 z-[71] w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: '#fff', border: '1px solid #EEEEEE', color: 'rgba(26,30,35,.6)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>✕</button>
      <div className="min-h-full" style={{ background: '#FFF9F4' }} onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  )
  return content
}
