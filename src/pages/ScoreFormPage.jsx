import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Dropdown from '../components/Dropdown'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { gradeColor } from '../lib/verdict'

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

export default function ScoreFormPage() {
  const { rubric, agents, addScore } = useApp()
  const { canScore } = useAuth()
  const toast = useToast()

  const dims = rubric?.dimensions || []
  const thresholds = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  const autoFailConds = rubric?.auto_fail_conditions || []

  // criterionId -> 1..5 (default neutral 3)
  const [scores, setScores] = useState(() => {
    const init = {}
    dims.forEach(d => d.criteria.forEach(c => { init[c.id] = 3 }))
    return init
  })
  const [autoFails, setAutoFails] = useState([])   // triggered condition ids
  const [note, setNote]   = useState('')
  const [ticketUrl, setTicketUrl] = useState('')
  const [agentId, setAgentId] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const dimAvg = (d) => {
    const vals = d.criteria.map(c => scores[c.id]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const total = useMemo(() => Math.round(dims.reduce((sum, d) => sum + (dimAvg(d) / 5) * (d.weight || 0), 0)), [scores, dims]) // eslint-disable-line
  const verdict = autoFails.length ? 'FAIL' : total >= thresholds.pass ? 'PASS' : total >= thresholds.needs_review ? 'NEEDS_REVIEW' : 'FAIL'
  const vColor = verdict === 'PASS' ? '#2F8F5B' : verdict === 'NEEDS_REVIEW' ? '#C8841E' : '#D14B3D'
  const vBg    = verdict === 'PASS' ? '#E6F4EC' : verdict === 'NEEDS_REVIEW' ? '#FBEBD3' : '#FCE9E6'

  const toggleAutoFail = (id) => setAutoFails(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const ticketId = (ticketUrl.match(/(\d{4,})/) || [])[1] || ''

  const submit = async () => {
    const scoresObj = {}
    dims.forEach(d => {
      const dim = { dimension_average: +dimAvg(d).toFixed(2) }
      d.criteria.forEach(c => { dim[c.id] = { score: scores[c.id], notes: '' } })
      scoresObj[d.id] = dim
    })
    const agent = agents.find(a => a.id === agentId)
    await addScore({
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
    setSubmitted(true)
    toast.success('Score submitted')
  }

  return (
    <div className="max-w-5xl mx-auto px-8 pt-8 pb-14">
      <div className="mb-6">
        <h1 style={{ fontSize: 30, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>Grade a ticket</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(26,30,35,.6)' }}>Score a ticket against the rubric — the total and verdict update as you go.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* Left — ticket context */}
        <div className="p-5 flex flex-col gap-4" style={CARD}>
          <p className="g-label" style={{ margin: 0 }}>Ticket</p>
          <input value={ticketUrl} onChange={e => setTicketUrl(e.target.value)}
            placeholder="https://yourcompany.gorgias.com/app/ticket/…"
            className="g-input rounded-lg px-3 py-2.5 text-sm" />
          {ticketId && (
            <a href={gorgiasTicketUrl(ticketId)} target="_blank" rel="noreferrer"
              className="text-sm font-medium" style={{ color: '#B84A2E' }}>→ Open ticket #{ticketId} in Gorgias</a>
          )}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'rgba(26,30,35,.6)' }}>Agent graded</label>
            <Dropdown value={agentId} onChange={setAgentId} width="100%" avatars
              options={[{ value: '', label: 'No agent' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} />
          </div>
          <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9', color: 'rgba(26,30,35,.6)' }}>
            Open the full conversation in Gorgias for context, then grade each criterion on the right. The conversation isn't stored in the QA app.
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
            <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: '#F0ECE9' }}>
              <div className="h-full rounded-full" style={{ width: `${total}%`, background: gradeColor(total, thresholds), transition: 'width .35s cubic-bezier(.16,1,.3,1), background .2s' }} />
            </div>
            {autoFails.length > 0 && <p className="text-xs mt-2" style={{ color: '#D14B3D' }}>Auto-fail triggered — verdict forced to FAIL.</p>}
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
              <div className="flex flex-col gap-3">
                {d.criteria.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: 'rgba(26,30,35,.72)' }}>{c.name}</span>
                    <Pills value={scores[c.id]} onChange={(n) => setScores(s => ({ ...s, [c.id]: n }))} />
                  </div>
                ))}
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
                Submit score
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
