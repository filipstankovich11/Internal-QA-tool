import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/api'
import { gorgiasTicketUrl } from '../lib/gorgias'

const VERDICT_COLOR  = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG     = { PASS: 'rgba(16,185,129,0.08)', NEEDS_REVIEW: 'rgba(245,158,11,0.08)', FAIL: 'rgba(239,68,68,0.08)' }
const VERDICT_BORDER = { PASS: 'rgba(16,185,129,0.2)', NEEDS_REVIEW: 'rgba(245,158,11,0.2)', FAIL: 'rgba(239,68,68,0.2)' }
const VERDICT_LABEL  = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const scoreColor     = v => v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'

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
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}>

        <div className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-white font-semibold">New Calibration Session</h2>
            <p className="text-xs mt-0.5" style={{ color: '#666' }}>
              The ticket will be scored by AI — reviewers score it blind, then compare.
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: '#555' }}
            onMouseEnter={e => e.target.style.color = '#ccc'}
            onMouseLeave={e => e.target.style.color = '#555'}>×</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#888' }}>Ticket URL or ID</label>
            <input
              autoFocus
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
              placeholder="https://gorgias.gorgias.com/app/ticket/12345"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}
              onFocus={e => e.target.style.borderColor = '#FF9780'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>
        </div>

        <div className="px-6 py-4 flex gap-2 justify-end"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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

// ── Blind score submission form ───────────────────────────────────────────────
function SubmitForm({ session, onSubmitted }) {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [verdict,  setVerdict]  = useState('PASS')
  const [score,    setScore]    = useState(80)
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const submit = async () => {
    setSaving(true)
    const { error } = await supabase.from('calibration_entries').insert({
      session_id:    session.id,
      reviewer_id:   user?.id,
      reviewer_name: profile?.name || user?.email || 'Reviewer',
      verdict,
      weighted_score: parseFloat(score),
      notes: notes.trim(),
    })
    setSaving(false)
    if (error) { toast.error('Failed to submit — you may have already scored this session'); return }
    toast.success('Score submitted')
    onSubmitted()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,151,128,0.05)', border: '1px solid rgba(255,151,128,0.15)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#FF9780' }}>Blind Scoring</p>
        <p className="text-xs" style={{ color: '#888' }}>
          Score this ticket independently. Other reviewers' scores are hidden until the session is revealed.
        </p>
      </div>

      {/* Ticket link */}
      <div className="flex items-center gap-3">
        <a href={gorgiasTicketUrl(session.ticket_id)} target="_blank" rel="noreferrer"
          className="text-sm font-medium transition-colors"
          style={{ color: '#FF9780' }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
          → Open Ticket #{session.ticket_id} in Gorgias
        </a>
      </div>

      {/* Verdict picker */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: '#888' }}>Your verdict</p>
        <div className="flex gap-2">
          {['PASS', 'NEEDS_REVIEW', 'FAIL'].map(v => (
            <button key={v} onClick={() => setVerdict(v)}
              className="flex-1 text-xs py-2.5 rounded-xl font-medium border transition-all"
              style={verdict === v
                ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_BORDER[v] }
                : { color: '#555', borderColor: 'rgba(255,255,255,0.07)', background: 'transparent' }}>
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Score slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium" style={{ color: '#888' }}>Score</p>
          <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor(score) }}>{score}/100</span>
        </div>
        <input type="range" min="0" max="100" step="1" value={score} onChange={e => setScore(+e.target.value)}
          className="w-full" style={{ accentColor: '#FF9780' }} />
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: '#555' }}>0</span>
          <span className="text-xs" style={{ color: '#555' }}>100</span>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: '#888' }}>Notes <span style={{ color: '#555' }}>(optional)</span></p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="What stood out? What drove your score?"
          rows={3} className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
          style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.07)', color: '#ccc' }}
          onFocus={e => e.target.style.borderColor = '#FF9780'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
        />
      </div>

      <button onClick={submit} disabled={saving}
        className="g-btn-primary text-sm py-2.5 rounded-xl"
        style={{ opacity: saving ? 0.5 : 1 }}>
        {saving ? 'Submitting…' : 'Submit my score'}
      </button>
    </div>
  )
}

// ── Waiting state (submitted, not yet revealed) ───────────────────────────────
function WaitingState({ session, entries, onReveal, isAdmin }) {
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
      <div className="rounded-xl p-5 text-center" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-2xl mb-2">⏳</p>
        <p className="text-white font-semibold mb-1">Score submitted</p>
        <p className="text-sm" style={{ color: '#777' }}>
          {entries.length} reviewer{entries.length !== 1 ? 's' : ''} have submitted so far.
          Scores stay hidden until an admin reveals the session.
        </p>
      </div>

      <div className="rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#777' }}>Submissions</p>
        <div className="flex flex-col gap-2">
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>✓</div>
              <span className="text-sm" style={{ color: '#ccc' }}>{e.reviewer_name}</span>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <button onClick={reveal} disabled={revealing}
          className="text-sm py-2.5 rounded-xl font-medium transition-all"
          style={{ background: 'rgba(255,151,128,0.1)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.25)', opacity: revealing ? 0.5 : 1 }}
          onMouseEnter={e => { if (!revealing) e.currentTarget.style.background = 'rgba(255,151,128,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,151,128,0.1)' }}>
          {revealing ? 'Revealing…' : '👁 Reveal all scores'}
        </button>
      )}
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
      <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
        <p className="text-xs" style={{ color: '#10b981' }}>
          Session revealed — {entries.length} reviewer{entries.length !== 1 ? 's' : ''} participated
          {majorityVerdict && <> · Majority verdict: <strong>{VERDICT_LABEL[majorityVerdict] || majorityVerdict}</strong></>}
        </p>
      </div>

      {/* Comparison table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Header row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)`, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#555' }}>Criterion</div>
          {allCols.map(col => (
            <div key={col.key} className="px-4 py-3 text-xs font-semibold text-center" style={{ color: '#aaa' }}>{col.label}</div>
          ))}
        </div>

        {/* Verdict row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="px-4 py-3 text-xs" style={{ color: '#666' }}>Verdict</div>
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
                  : <span style={{ color: '#555' }}>—</span>}
              </div>
            )
          })}
        </div>

        {/* Score row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="px-4 py-3 text-xs" style={{ color: '#666' }}>Score</div>
          {allCols.map(col => (
            <div key={col.key} className="px-4 py-3 text-center">
              {col.score != null
                ? <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor(col.score) }}>{Math.round(col.score)}/100</span>
                : <span style={{ color: '#555' }}>—</span>}
            </div>
          ))}
        </div>

        {/* Notes row */}
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${allCols.length}, 1fr)` }}>
          <div className="px-4 py-3 text-xs" style={{ color: '#666' }}>Notes</div>
          {allCols.map(col => (
            <div key={col.key} className="px-4 py-3">
              <p className="text-xs leading-relaxed" style={{ color: '#888' }}>{col.notes || <span style={{ color: '#444' }}>—</span>}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Session detail panel ──────────────────────────────────────────────────────
function SessionDetail({ session: initialSession, onBack }) {
  const { user } = useAuth()
  const { isAdmin } = useAuth()
  const [session,  setSession]  = useState(initialSession)
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(true)

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
    ? { label: 'Revealed', color: '#10b981', bg: 'rgba(16,185,129,0.1)' }
    : { label: 'Open', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }

  return (
    <div>
      {/* Back + header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onBack} className="text-sm mt-0.5 transition-colors shrink-0" style={{ color: '#666' }}
          onMouseEnter={e => e.target.style.color = '#ccc'}
          onMouseLeave={e => e.target.style.color = '#666'}>
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-white font-semibold truncate">
              Ticket #{session.ticket_id}
              {session.ticket_subject && <span className="font-normal text-sm ml-2" style={{ color: '#888' }}>— {session.ticket_subject}</span>}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
              style={{ color: statusBadge.color, background: statusBadge.bg }}>
              {statusBadge.label}
            </span>
          </div>
          <a href={gorgiasTicketUrl(session.ticket_id)} target="_blank" rel="noreferrer"
            className="text-xs transition-colors" style={{ color: '#555' }}
            onMouseEnter={e => e.target.style.color = '#FF9780'}
            onMouseLeave={e => e.target.style.color = '#555'}>
            Open in Gorgias →
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: '#555' }}>Loading…</div>
      ) : session.status === 'revealed' ? (
        <RevealedView session={session} entries={entries} />
      ) : myEntry ? (
        <WaitingState session={session} entries={entries} onReveal={load} isAdmin={isAdmin} />
      ) : (
        <SubmitForm session={session} onSubmitted={load} />
      )}
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
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium" style={{ color: '#FF9780' }}>#{session.ticket_id}</span>
          <span className="text-sm truncate" style={{ color: '#ccc' }}>{session.ticket_subject || '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: '#555' }}>
            {new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {session.created_by_name && (
            <span className="text-xs" style={{ color: '#555' }}>by {session.created_by_name}</span>
          )}
          <span className="text-xs" style={{ color: '#666' }}>
            {submissionCount} submission{submissionCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <span className="text-xs px-2.5 py-1 rounded-full shrink-0"
        style={{
          color:      isRevealed ? '#10b981' : '#f59e0b',
          background: isRevealed ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
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
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
        <SessionDetail
          session={activeSession}
          onBack={() => { setActiveSession(null); fetchSessions() }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Calibration</h1>
          <p className="text-sm mt-0.5" style={{ color: '#888' }}>
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
        style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)' }}>
        {[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'revealed', label: 'Revealed' }].map(f => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={statusFilter === f.id ? { background: '#1e1e1e', color: '#fff' } : { color: '#aaa' }}
            onMouseEnter={e => { if (statusFilter !== f.id) e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { if (statusFilter !== f.id) e.currentTarget.style.color = '#aaa' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="text-center py-20" style={{ color: '#555' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: '#555' }}>
          <p className="text-3xl mb-3">🎯</p>
          <p className="text-sm">
            {sessions.length === 0
              ? isAdmin ? 'No sessions yet — create one to get started.' : 'No calibration sessions yet.'
              : 'No sessions match this filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
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
