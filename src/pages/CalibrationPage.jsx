import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/api'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_BORDER, VERDICT_LABEL, gradeColor } from '../lib/verdict'
import ScoreModal from '../components/ScoreModal'
import ScoringProgress from '../components/ScoringProgress'

// ── New session modal ─────────────────────────────────────────────────────────
function NewSessionModal({ onCreated, onClose }) {
  const { rubric } = useApp()
  const toast = useToast()
  const [url,     setUrl]     = useState('')
  const [loading, setLoading] = useState(false)
  const { user, profile } = useAuth()

  const create = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      const res  = await authFetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: trimmed, rubric }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Scoring failed'); return }

      const { data: session, error } = await supabase
        .from('calibration_sessions')
        .insert({
          ticket_id:      data.ticket_id,
          ticket_subject: data.ticket_subject || '',
          created_by:     user?.id,
          created_by_name: profile?.name || user?.email || 'Unknown',
          status:         'open',
          ai_score:       data,
        })
        .select()
        .single()

      if (error) { toast.error('Failed to save session'); return }
      toast.success('Calibration session created')
      onCreated(session)
    } catch { toast.error('Could not reach the server') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(26,30,35,0.35)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>

        <div className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid #F0ECE9' }}>
          <div>
            <h2 className="font-semibold" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>New Calibration Session</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
              The ticket will be scored by AI — reviewers score it blind, then compare.
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: 'rgba(26,30,35,.45)' }}
            onMouseEnter={e => e.target.style.color = 'rgba(26,30,35,.72)'}
            onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.45)'}>×</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(26,30,35,.6)' }}>Ticket URL or ID</label>
            <input
              autoFocus
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
              placeholder="https://gorgias.gorgias.com/app/ticket/12345"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23' }}
              onFocus={e => e.target.style.borderColor = '#FF9780'}
              onBlur={e => e.target.style.borderColor = '#E1DCD7'}
            />
          </div>
          <ScoringProgress loading={loading} />
        </div>

        <div className="px-6 py-4 flex gap-2 justify-end"
          style={{ borderTop: '1px solid #F0ECE9' }}>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl g-btn-ghost">Cancel</button>
          <button onClick={create} disabled={!url.trim() || loading}
            className="g-btn-primary text-sm px-5 py-2 rounded-xl flex items-center gap-2"
            style={{ opacity: !url.trim() || loading ? 0.5 : 1 }}>
            {loading
              ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Scoring…</>
              : 'Score & Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Blind score submission form (also used to edit before reveal) ─────────────
function SubmitForm({ session, existingEntry, onSubmitted, onCancel, onViewDetail }) {
  const { user, profile } = useAuth()
  const toast = useToast()
  const editing = !!existingEntry
  const [verdict,  setVerdict]  = useState(existingEntry?.verdict ?? 'PASS')
  const [score,    setScore]    = useState(existingEntry?.weighted_score ?? 80)
  const [notes,    setNotes]    = useState(existingEntry?.notes ?? '')
  const [saving,   setSaving]   = useState(false)

  const submit = async () => {
    setSaving(true)
    const payload = {
      verdict,
      weighted_score: Math.max(0, Math.min(100, parseFloat(score) || 0)),
      notes: notes.trim(),
    }
    const { error } = editing
      ? await supabase.from('calibration_entries').update(payload).eq('id', existingEntry.id)
      : await supabase.from('calibration_entries').insert({
          session_id:    session.id,
          reviewer_id:   user?.id,
          reviewer_name: profile?.name || user?.email || 'Reviewer',
          ...payload,
        })
    setSaving(false)
    if (error) { toast.error(editing ? 'Failed to update your score' : 'Failed to submit — you may have already scored this session'); return }
    toast.success(editing ? 'Score updated' : 'Score submitted')
    onSubmitted()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: '#FFEAE6', border: '1px solid #FF9780' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#B84A2E' }}>Blind Scoring</p>
        <p className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>
          Score this ticket independently. Other reviewers' scores are hidden until the session is revealed.
        </p>
      </div>

      {/* Ticket actions */}
      <div className="flex flex-wrap gap-2">
        <a href={gorgiasTicketUrl(session.ticket_id)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          style={{ color: 'rgba(26,30,35,.72)', border: '1px solid #E7E3DF', background: '#FFFFFF' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F6F2EF' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open in Gorgias
        </a>
        {onViewDetail && session.ai_score && (
          <button onClick={() => onViewDetail(session.ai_score)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            style={{ color: '#B84A2E', border: '1px solid #FF9780', background: '#FFEAE6' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FFDED6'}
            onMouseLeave={e => e.currentTarget.style.background = '#FFEAE6'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            View ticket detail
          </button>
        )}
      </div>

      {/* Verdict picker */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'rgba(26,30,35,.6)' }}>Your verdict</p>
        <div className="flex gap-2">
          {['PASS', 'NEEDS_REVIEW', 'FAIL'].map(v => (
            <button key={v} onClick={() => setVerdict(v)}
              className="flex-1 text-xs py-2.5 rounded-xl font-medium border transition-all"
              style={verdict === v
                ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_BORDER[v] }
                : { color: 'rgba(26,30,35,.6)', borderColor: '#E7E3DF', background: '#FFFFFF' }}>
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Score — drag the slider or type the exact grade */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium" style={{ color: 'rgba(26,30,35,.6)' }}>Score</p>
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="100"
              value={score}
              onChange={e => setScore(e.target.value === '' ? '' : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              className="no-spinner w-14 text-right text-sm font-bold tabular-nums rounded-lg px-2 py-1 outline-none transition-colors"
              style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: gradeColor(score === '' ? 0 : score) }}
              onFocus={e => e.target.style.borderColor = '#FF9780'}
              onBlur={e => { if (e.target.value === '') setScore(0); e.target.style.borderColor = '#E1DCD7' }} />
            <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>/100</span>
          </div>
        </div>
        <input type="range" min="0" max="100" step="1" value={score === '' ? 0 : score} onChange={e => setScore(+e.target.value)}
          className="w-full" style={{ accentColor: '#FF9780' }} />
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>0</span>
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>100</span>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(26,30,35,.6)' }}>Notes <span style={{ color: 'rgba(26,30,35,.5)' }}>(optional)</span></p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="What stood out? What drove your score?"
          rows={3} className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23' }}
          onFocus={e => e.target.style.borderColor = '#FF9780'}
          onBlur={e => e.target.style.borderColor = '#E1DCD7'}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={submit} disabled={saving}
          className="g-btn-primary text-sm py-2.5 rounded-xl flex-1"
          style={{ opacity: saving ? 0.5 : 1 }}>
          {saving ? (editing ? 'Updating…' : 'Submitting…') : (editing ? 'Update my score' : 'Submit my score')}
        </button>
        {editing && onCancel && (
          <button onClick={onCancel} disabled={saving} className="g-btn-ghost text-sm px-4 py-2.5 rounded-xl">Cancel</button>
        )}
      </div>
    </div>
  )
}

// ── Waiting state (submitted, not yet revealed) ───────────────────────────────
function WaitingState({ session, entries, onReveal, onEdit, isAdmin }) {
  const [revealing, setRevealing] = useState(false)
  const toast = useToast()

  const reveal = async () => {
    setRevealing(true)
    const { error } = await supabase.from('calibration_sessions').update({ status: 'revealed' }).eq('id', session.id)
    setRevealing(false)
    if (error) { toast.error('Failed to reveal'); return }
    onReveal()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-5 text-center" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
        <p className="text-2xl mb-2">⏳</p>
        <p className="font-semibold mb-1" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Score submitted</p>
        <p className="text-sm" style={{ color: 'rgba(26,30,35,.6)' }}>
          {entries.length} reviewer{entries.length !== 1 ? 's' : ''} have submitted so far.
          Scores stay hidden until an admin reveals the session.
        </p>
        {onEdit && (
          <button onClick={onEdit} className="text-xs mt-3 px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#B84A2E', border: '1px solid #FF9780', background: '#FFEAE6' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FFDED6'}
            onMouseLeave={e => e.currentTarget.style.background = '#FFEAE6'}
            title="Revise your verdict, score or notes before the session is revealed">
            Edit my score
          </button>
        )}
      </div>

      <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(26,30,35,.5)' }}>Submissions</p>
        <div className="flex flex-col gap-2">
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: '#E6F4EC', color: '#2F8F5B' }}>✓</div>
              <span className="text-sm" style={{ color: '#1A1E23' }}>{e.reviewer_name}</span>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <button onClick={reveal} disabled={revealing}
          className="text-sm py-2.5 rounded-xl font-medium transition-all"
          style={{ background: '#FFEAE6', color: '#B84A2E', border: '1px solid #FF9780', opacity: revealing ? 0.5 : 1 }}
          onMouseEnter={e => { if (!revealing) e.currentTarget.style.background = '#FFDED6' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#FFEAE6' }}>
          {revealing ? 'Revealing…' : '👁 Reveal all scores'}
        </button>
      )}
    </div>
  )
}

// ── Alignment / divergence summary ────────────────────────────────────────────
// The point of calibration is measuring how far apart reviewers landed. Shows the
// score spread, the group avg vs the AI, the biggest outlier, and a 0–100 strip
// with a dot per reviewer so the spread is visible at a glance.
function DivergenceSummary({ aiScore, entries }) {
  const scored = entries.filter(e => isFinite(Number(e.weighted_score)))
  if (!scored.length) return null
  const scores = scored.map(e => Number(e.weighted_score))
  const min = Math.min(...scores), max = Math.max(...scores)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const spread = max - min
  const ai = isFinite(Number(aiScore)) ? Number(aiScore) : null
  const aiDelta = ai != null ? avg - ai : null

  // Outlier = reviewer furthest from the group average (only flag if meaningful)
  let outlier = null
  if (scored.length >= 3) {
    const ranked = scored
      .map(e => ({ name: e.reviewer_name, dev: Math.abs(Number(e.weighted_score) - avg) }))
      .sort((a, b) => b.dev - a.dev)
    if (ranked[0]?.dev >= 10) outlier = ranked[0]
  }

  const spreadColor = spread <= 8 ? '#2F8F5B' : spread <= 20 ? '#C8841E' : '#D14B3D'

  return (
    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.5)' }}>Alignment</p>
        <div className="flex items-center gap-4 text-xs">
          <span style={{ color: 'rgba(26,30,35,.6)' }}>Spread <span className="font-bold tabular-nums" style={{ color: spreadColor }}>{Math.round(spread)} pts</span></span>
          <span style={{ color: 'rgba(26,30,35,.6)' }}>Reviewer avg <span className="font-bold tabular-nums" style={{ color: gradeColor(avg) }}>{Math.round(avg)}</span></span>
          {aiDelta != null && (
            <span style={{ color: 'rgba(26,30,35,.6)' }}>vs AI <span className="font-bold tabular-nums" style={{ color: Math.abs(aiDelta) <= 8 ? '#2F8F5B' : '#C8841E' }}>{aiDelta >= 0 ? '+' : ''}{Math.round(aiDelta)}</span></span>
          )}
        </div>
      </div>

      {/* 0–100 strip: dot per reviewer + AI diamond + avg tick */}
      <div className="relative" style={{ height: 22 }}>
        <div className="absolute left-0 right-0" style={{ top: 10, height: 3, borderRadius: 999, background: '#F0ECE9' }} />
        <div className="absolute" title={`Reviewer avg ${Math.round(avg)}`}
          style={{ left: `${avg}%`, top: 4, width: 1, height: 15, background: 'rgba(26,30,35,.28)', transform: 'translateX(-50%)' }} />
        {ai != null && (
          <div className="absolute" title={`AI ${Math.round(ai)}`}
            style={{ left: `${ai}%`, top: 6, width: 9, height: 9, background: '#818cf8', transform: 'translateX(-50%) rotate(45deg)', borderRadius: 2, border: '1px solid #FFFFFF' }} />
        )}
        {scored.map(e => {
          const sc = Number(e.weighted_score)
          const isOut = outlier && e.reviewer_name === outlier.name
          return (
            <div key={e.id} className="absolute" title={`${e.reviewer_name}: ${Math.round(sc)}`}
              style={{ left: `${sc}%`, top: 6, width: 11, height: 11, borderRadius: '50%', background: '#FF9780',
                transform: 'translateX(-50%)', border: isOut ? '2px solid #1A1E23' : '1px solid #FFFFFF',
                boxShadow: isOut ? '0 0 8px rgba(26,30,35,0.25)' : 'none', zIndex: isOut ? 2 : 1 }} />
          )
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>0</span>
        <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>100</span>
      </div>

      <div className="flex items-center justify-between mt-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF9780' }} /> Reviewer
          </span>
          {ai != null && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>
              <span style={{ width: 8, height: 8, background: '#818cf8', transform: 'rotate(45deg)', borderRadius: 1 }} /> AI
            </span>
          )}
        </div>
        {outlier && (
          <span className="text-xs" style={{ color: '#C8841E' }}>
            {outlier.name} diverges most (±{Math.round(outlier.dev)} from avg)
          </span>
        )}
      </div>
    </div>
  )
}

// ── Revealed comparison view ──────────────────────────────────────────────────
function RevealedView({ session, entries }) {
  const ai = session.ai_score || {}
  const allCols = [
    { key: 'ai', label: '🤖 AI', verdict: ai.verdict, score: ai.weighted_score, notes: ai.summary },
    ...entries.map(e => ({ key: e.id, label: e.reviewer_name, verdict: e.verdict, score: e.weighted_score, notes: e.notes })),
  ]

  const verdictAgreement = allCols.map(c => c.verdict).filter(Boolean)
  const majorityVerdict = verdictAgreement.length
    ? Object.entries(verdictAgreement.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0][0]
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl p-3" style={{ background: '#E6F4EC', border: '1px solid #BFE3CD' }}>
        <p className="text-xs" style={{ color: '#2F8F5B' }}>
          Session revealed — {entries.length} reviewer{entries.length !== 1 ? 's' : ''} participated
          {majorityVerdict && <> · Majority verdict: <strong>{VERDICT_LABEL[majorityVerdict] || majorityVerdict}</strong></>}
        </p>
      </div>

      <DivergenceSummary aiScore={ai.weighted_score} entries={entries} />

      {/* Comparison table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EEEEEE', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
        {/* Header row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)`, background: '#FBF7F3', borderBottom: '1px solid #EEEEEE' }}>
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.5)' }}>Criterion</div>
          {allCols.map(col => (
            <div key={col.key} className="px-4 py-3 text-xs font-semibold text-center" style={{ color: 'rgba(26,30,35,.72)' }}>{col.label}</div>
          ))}
        </div>

        {/* Verdict row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)`, borderBottom: '1px solid #F0ECE9' }}>
          <div className="px-4 py-3 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Verdict</div>
          {allCols.map(col => {
            const vc = VERDICT_COLOR[col.verdict]
            const vb = VERDICT_BG[col.verdict]
            const disagreed = col.verdict !== majorityVerdict
            return (
              <div key={col.key} className="px-4 py-3 flex justify-center">
                {col.verdict
                  ? <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ color: vc, background: vb, outline: disagreed ? `1px solid ${vc}` : 'none' }}>
                      {VERDICT_LABEL[col.verdict] || col.verdict}
                    </span>
                  : <span style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}
              </div>
            )
          })}
        </div>

        {/* Score row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)`, borderBottom: '1px solid #F0ECE9' }}>
          <div className="px-4 py-3 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Score</div>
          {allCols.map(col => (
            <div key={col.key} className="px-4 py-3 text-center">
              {col.score != null
                ? <span className="text-sm font-bold tabular-nums" style={{ color: gradeColor(col.score) }}>{Math.round(col.score)}/100</span>
                : <span style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}
            </div>
          ))}
        </div>

        {/* Notes row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)` }}>
          <div className="px-4 py-3 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Notes</div>
          {allCols.map(col => (
            <div key={col.key} className="px-4 py-3">
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{col.notes || <span style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Session detail panel ──────────────────────────────────────────────────────
function SessionDetail({ session: initialSession, onBack }) {
  const { user, isAdmin } = useAuth()
  const { activeOverlay, setActiveOverlay } = useApp()
  const [session,  setSession]  = useState(initialSession)
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(false)   // revising my own score before reveal

  // Score detail — slide-in panel + expand-to-full modal, same as the other pages
  const [panelScore, setPanelScore] = useState(null)
  const [modalScore, setModalScore] = useState(null)
  const openPanel  = (score) => { setPanelScore(score); setActiveOverlay('score') }
  const closePanel = () => { setPanelScore(null); setActiveOverlay(o => o === 'score' ? null : o) }
  useEffect(() => { if (activeOverlay !== 'score') setPanelScore(null) }, [activeOverlay])

  const myEntry = entries.find(e => e.reviewer_id === user?.id)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: s } = await supabase.from('calibration_sessions').select('*').eq('id', initialSession.id).single()
    const { data: e } = await supabase.from('calibration_entries').select('*').eq('session_id', initialSession.id).order('submitted_at')
    if (s) setSession(s)
    setEntries(e || [])
    setLoading(false)
  }, [initialSession.id])

  useEffect(() => { load() }, [load])

  const statusBadge = session.status === 'revealed'
    ? { label: 'Revealed', color: '#2F8F5B', bg: '#E6F4EC' }
    : { label: 'Open', color: '#C8841E', bg: '#FBEBD3' }

  return (
    <div className={`panel-push ${panelScore ? 'is-open' : ''}`}>
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      {/* Back + header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onBack} className="text-sm mt-0.5 transition-colors shrink-0" style={{ color: 'rgba(26,30,35,.6)' }}
          onMouseEnter={e => e.target.style.color = '#1A1E23'}
          onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.6)'}>
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-semibold truncate" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>
              Ticket #{session.ticket_id}
              {session.ticket_subject && <span className="font-normal text-sm ml-2" style={{ color: 'rgba(26,30,35,.6)' }}>— {session.ticket_subject}</span>}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
              style={{ color: statusBadge.color, background: statusBadge.bg }}>
              {statusBadge.label}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: 'rgba(26,30,35,.5)' }}>Loading…</div>
      ) : session.status === 'revealed' ? (
        <RevealedView session={session} entries={entries} />
      ) : myEntry && !editing ? (
        <WaitingState session={session} entries={entries} onReveal={load} onEdit={() => setEditing(true)} isAdmin={isAdmin} />
      ) : myEntry ? (
        <SubmitForm session={session} existingEntry={myEntry} onSubmitted={() => { setEditing(false); load() }} onCancel={() => setEditing(false)} onViewDetail={openPanel} />
      ) : (
        <SubmitForm session={session} onSubmitted={load} onViewDetail={openPanel} />
      )}
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

// ── Session list row ──────────────────────────────────────────────────────────
function SessionRow({ session, onClick }) {
  const submissionCount = session.calibration_entries?.length ?? 0
  const isRevealed = session.status === 'revealed'

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
      style={{ borderBottom: '1px solid #EEEEEE' }}
      onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium" style={{ color: '#B84A2E' }}>#{session.ticket_id}</span>
          <span className="text-sm truncate" style={{ color: '#1A1E23' }}>{session.ticket_subject || '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>
            {new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {session.created_by_name && (
            <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>by {session.created_by_name}</span>
          )}
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>
            {submissionCount} submission{submissionCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <span className="text-xs px-2.5 py-1 rounded-full shrink-0"
        style={{
          color:      isRevealed ? '#2F8F5B' : '#C8841E',
          background: isRevealed ? '#E6F4EC' : '#FBEBD3',
        }}>
        {isRevealed ? 'Revealed' : 'Open'}
      </span>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CalibrationPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [sessions,        setSessions]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [showNewModal,    setShowNewModal]     = useState(false)
  const [activeSession,   setActiveSession]   = useState(null)
  const [statusFilter,    setStatusFilter]    = useState('all')

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('calibration_sessions')
      .select('*, calibration_entries(id)')
      .order('created_at', { ascending: false })
    if (error) { toast.error('Failed to load sessions'); setLoading(false); return }
    setSessions(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const filtered = sessions.filter(s =>
    statusFilter === 'all'      ? true :
    statusFilter === 'open'     ? s.status === 'open' :
    statusFilter === 'revealed' ? s.status === 'revealed' : true
  )

  if (activeSession) {
    return (
      <SessionDetail
        session={activeSession}
        onBack={() => { setActiveSession(null); fetchSessions() }}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Calibration</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
            Score the same ticket independently to align reviewer standards
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowNewModal(true)}
            className="g-btn-primary text-sm px-4 py-2 rounded-xl shrink-0">
            + New Session
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-5"
        style={{ background: '#F1ECE8' }}>
        {[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'revealed', label: 'Revealed' }].map(f => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={statusFilter === f.id ? { background: '#FFFFFF', color: '#1A1E23', boxShadow: '0 1px 2px rgba(0,0,0,.06)' } : { color: 'rgba(26,30,35,.6)' }}
            onMouseEnter={e => { if (statusFilter !== f.id) e.currentTarget.style.color = '#1A1E23' }}
            onMouseLeave={e => { if (statusFilter !== f.id) e.currentTarget.style.color = 'rgba(26,30,35,.6)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="text-center py-20" style={{ color: 'rgba(26,30,35,.5)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'rgba(26,30,35,.5)' }}>
          <p className="text-3xl mb-3">🎯</p>
          <p className="text-sm">
            {sessions.length === 0
              ? isAdmin ? 'No sessions yet — create one to get started.' : 'No calibration sessions yet.'
              : 'No sessions match this filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EEEEEE', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
          {filtered.map(s => (
            <SessionRow key={s.id} session={s} onClick={() => setActiveSession(s)} />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewSessionModal
          onCreated={session => { setShowNewModal(false); fetchSessions(); setActiveSession(session) }}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  )
}
