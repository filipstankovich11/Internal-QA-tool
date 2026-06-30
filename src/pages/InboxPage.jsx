import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import ScoreBreakdownHover from '../components/ScoreBreakdownHover'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_BORDER, VERDICT_LABEL, gradeColor } from '../lib/verdict'

const CheckIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const FlagIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>

// ── Dimension mini-bars ───────────────────────────────────────────────────────
function DimMini({ scores }) {
  const dims = [
    { key: 'inquiry_resolution',  label: 'IR',  short: 'Inquiry' },
    { key: 'internal_processes',  label: 'IP',  short: 'Internal' },
    { key: 'customer_perception', label: 'CP',  short: 'Customer' },
  ]
  return (
    <div className="flex gap-3">
      {dims.map(d => {
        const avg = Number(scores?.[d.key]?.dimension_average)
        if (!isFinite(avg)) return null
        const color = avg >= 4 ? '#2F8F5B' : avg >= 3 ? '#C8841E' : '#D14B3D'
        return (
          <div key={d.key} className="flex flex-col gap-1" title={`${d.short}: ${avg.toFixed(1)}/5`}>
            <div className="w-12 rounded-full overflow-hidden" style={{ height: 3, background: '#F0ECE9' }}>
              <div className="h-full rounded-full" style={{ width: `${(avg / 5) * 100}%`, background: color }} />
            </div>
            <span className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>{d.short} {avg.toFixed(1)}</span>
          </div>
        )
      })}
    </div>
  )
}

const DISPUTE_CATEGORIES = [
  'Wrong score',
  'Wrong criteria applied',
  'Missing context',
  'Ticket misattributed',
  'Other',
]

// ── Dispute modal ─────────────────────────────────────────────────────────────
function DisputeModal({ s, onDispute, onClose }) {
  const [category, setCategory] = useState(DISPUTE_CATEGORIES[0])
  const [note,     setNote]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const vc = VERDICT_COLOR[s.effectiveVerdict]
  const vb = VERDICT_BG[s.effectiveVerdict]
  const vborder = VERDICT_BORDER[s.effectiveVerdict]

  const handleSubmit = async () => {
    if (!note.trim()) return
    setSaving(true)
    await onDispute(s.id, `[${category}] ${note.trim()}`)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(26,30,35,.35)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 24px 80px rgba(0,0,0,.18)' }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between"
          style={{ borderBottom: '1px solid #EEEEEE' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#1A1E23' }}>Dispute Score</h2>
            <p className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.6)' }}>
              Let your reviewer know why this score seems incorrect.
            </p>
          </div>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: 'rgba(26,30,35,.5)' }}
            onMouseEnter={e => e.target.style.color = '#1A1E23'}
            onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.5)'}>✕</button>
        </div>

        {/* Ticket context */}
        <div className="px-6 py-4 flex items-center gap-4"
          style={{ borderBottom: '1px solid #EEEEEE', background: '#FBF7F3' }}>
          <span className="font-mono text-sm font-medium" style={{ color: '#B84A2E' }}>#{s.ticketId}</span>
          <span className="text-sm truncate flex-1" style={{ color: 'rgba(26,30,35,.72)' }}>{s.fullScore?.ticket_subject || '—'}</span>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full border shrink-0"
            style={{ color: vc, background: vb, borderColor: vborder }}>
            {VERDICT_LABEL[s.effectiveVerdict]}
          </span>
          <span className="text-xl font-bold tabular-nums shrink-0" style={{ color: gradeColor(s.effectiveScore) }}>
            {s.effectiveScore?.toFixed(0)}<span className="text-xs font-normal" style={{ color: 'rgba(26,30,35,.5)' }}>/100</span>
          </span>
        </div>

        {/* Form */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Category */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'rgba(26,30,35,.6)' }}>Reason category</label>
            <div className="flex flex-wrap gap-2">
              {DISPUTE_CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                  style={{
                    background: category === c ? '#FFEAE6' : '#FFFFFF',
                    color:      category === c ? '#B84A2E' : 'rgba(26,30,35,.6)',
                    border:     category === c ? '1px solid #FF9780' : '1px solid #E7E3DF',
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'rgba(26,30,35,.6)' }}>Details</label>
            <textarea
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Explain what you believe is incorrect and what the correct assessment should be…"
              rows={5}
              className="g-input w-full rounded-xl px-4 py-3 text-sm resize-none leading-relaxed"
              style={{ color: '#1A1E23' }}
              onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            />
            <p className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>
              Your reviewer will be notified and will respond to your dispute.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3"
          style={{ borderTop: '1px solid #EEEEEE' }}>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-xl" style={{ color: 'rgba(26,30,35,.6)' }}
            onMouseEnter={e => e.target.style.color = '#1A1E23'}
            onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.6)'}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!note.trim() || saving}
            className="g-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-medium"
            style={{ opacity: !note.trim() || saving ? 0.5 : 1 }}>
            <FlagIcon /> {saving ? 'Submitting…' : 'Submit dispute'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ s, onAcknowledge, onDispute, onView, isNew }) {
  const [acking,        setAcking]        = useState(false)
  const [disputeOpen,   setDisputeOpen]   = useState(false)
  const vc = VERDICT_COLOR[s.effectiveVerdict]
  const vb = VERDICT_BG[s.effectiveVerdict]
  const vborder = VERDICT_BORDER[s.effectiveVerdict]

  const handleAck = async () => {
    setAcking(true)
    await onAcknowledge(s.id)
    setAcking(false)
  }

  return (
    <>
    <div className="rounded-2xl overflow-hidden transition-colors"
      style={{
        background: '#FFFFFF',
        border: '1px solid #EEEEEE',
        borderLeft: isNew ? '3px solid #FF9780' : '1px solid #EEEEEE',
        boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)',
      }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid #F0ECE9' }}>
        <div className="flex items-center gap-3">
          {isNew && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#FF9780' }} />}
          <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
            className="font-mono text-sm font-medium" style={{ color: '#B84A2E' }}
            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
            onMouseLeave={e => e.target.style.textDecoration = 'none'}
            onClick={e => e.stopPropagation()}>
            #{s.ticketId}
          </a>
          <span className="text-sm truncate max-w-xs" style={{ color: '#1A1E23' }}>
            {s.fullScore?.ticket_subject || '—'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>
            {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {s.overrideVerdict && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: '#B84A2E', background: '#FFEAE6' }}>
              Reviewed
            </span>
          )}
        </div>
      </div>

      {/* Score + dimensions */}
      <div className="px-5 py-4 flex items-center gap-6 flex-wrap"
        style={{ borderBottom: '1px solid #F0ECE9' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full border"
            style={{ color: vc, background: vb, borderColor: vborder }}>
            {VERDICT_LABEL[s.effectiveVerdict]}
          </span>
          <ScoreBreakdownHover scores={s.fullScore?.scores} align="left">
            <span className="text-2xl font-bold tabular-nums cursor-default" style={{ color: gradeColor(s.effectiveScore) }}>
              {s.effectiveScore?.toFixed(0)}
              <span className="text-sm font-normal ml-0.5" style={{ color: 'rgba(26,30,35,.5)' }}>/100</span>
            </span>
          </ScoreBreakdownHover>
        </div>
        <DimMini scores={s.fullScore?.scores} />
      </div>

      {/* Reviewer note */}
      {s.notes && (
        <div className="px-5 py-3" style={{ borderBottom: '1px solid #F0ECE9', background: '#FBF7F3' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(26,30,35,.6)' }}>Reviewer note</p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{s.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isNew ? (
            <button onClick={handleAck} disabled={acking}
              className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: '#FFEAE6', color: '#B84A2E', border: '1px solid #FF9780', opacity: acking ? 0.5 : 1 }}
              onMouseEnter={e => { if (!acking) e.currentTarget.style.background = '#FFE0D9' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFEAE6' }}>
              <CheckIcon /> {acking ? 'Saving…' : 'Mark as seen'}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>
              <CheckIcon /> Seen {s.acknowledgedAt ? new Date(s.acknowledgedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            </span>
          )}
          {s.disputed ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium"
              style={{ color: '#C8841E', background: '#FBF1E0', border: '1px solid #EAD3AE' }}>
              <FlagIcon /> Disputed
            </span>
          ) : (
            <button
              onClick={() => setDisputeOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-lg font-medium transition-colors"
              style={{ color: 'rgba(26,30,35,.6)', border: '1px solid #E7E3DF' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#D14B3D'; e.currentTarget.style.borderColor = '#F4DDD7' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.6)'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
              <FlagIcon /> Dispute
            </button>
          )}
        </div>
        <button onClick={() => onView(s)}
          className="text-xs" style={{ color: 'rgba(26,30,35,.6)', transition: 'color 150ms' }}
          onMouseEnter={e => e.target.style.color = '#1A1E23'}
          onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.6)'}>
          Full details →
        </button>
      </div>
    </div>

    {disputeOpen && (
      <DisputeModal s={s} onDispute={onDispute} onClose={() => setDisputeOpen(false)} />
    )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const { scoreHistory, acknowledgeScore, flagScore, openScore: showScore } = useApp()
  const { role } = useAuth()
  const toast  = useToast()

  // scoreHistory is already scoped to the agent's own scores via AppContext
  const visibleScores = scoreHistory

  const sorted  = [...visibleScores].sort((a, b) => b.scoredAt - a.scoredAt)
  const unread  = sorted.filter(s => !s.acknowledged)
  const read    = sorted.filter(s =>  s.acknowledged)

  const handleAcknowledge = async (id) => {
    const ok = await acknowledgeScore(id)
    if (ok) toast.success('Marked as seen')
    else    toast.error('Failed to acknowledge')
  }

  const handleDispute = async (id, note) => {
    const ok = await flagScore(id, note)
    if (ok) toast.info('Score flagged for dispute')
    else    toast.error('Failed to submit dispute')
  }

  const openScore = (s) => showScore({
    ...s.fullScore,
    scoreId:         s.id,
    reviewerNote:    s.notes,
    overrideVerdict: s.overrideVerdict,
    overrideScore:   s.overrideScore,
    overrideNote:    s.overrideNote,
    overrideAt:      s.overrideAt,
    disputed:        s.disputed,
    disputeNote:     s.disputeNote,
    disputeAt:       s.disputeAt,
    acknowledged:    s.acknowledged,
    acknowledgedAt:  s.acknowledgedAt,
  })

  const handleAckAll = async () => {
    await Promise.all(unread.map(s => acknowledgeScore(s.id)))
    toast.success(`Marked ${unread.length} score${unread.length !== 1 ? 's' : ''} as seen`)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Inbox</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
            {unread.length > 0
              ? <><span style={{ color: '#B84A2E' }}>{unread.length}</span> new score{unread.length !== 1 ? 's' : ''} to review</>
              : 'All caught up'}
          </p>
        </div>
        {unread.length > 1 && (
          <button onClick={handleAckAll}
            className="text-sm px-4 py-2 rounded-xl transition-colors"
            style={{ color: 'rgba(26,30,35,.6)', border: '1px solid #E7E3DF' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#1A1E23'; e.currentTarget.style.borderColor = '#E1DCD7'; e.currentTarget.style.background = '#F6F2EF' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.6)'; e.currentTarget.style.borderColor = '#E7E3DF'; e.currentTarget.style.background = 'transparent' }}>
            Mark all as seen
          </button>
        )}
      </div>

      {/* New scores */}
      {unread.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#B84A2E' }}>
            New — {unread.length}
          </p>
          <div className="flex flex-col gap-3">
            {unread.map(s => (
              <ScoreCard key={s.id} s={s} isNew
                onAcknowledge={handleAcknowledge}
                onDispute={handleDispute}
                onView={openScore}
              />
            ))}
          </div>
        </div>
      )}

      {/* Previous scores */}
      {read.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(26,30,35,.5)' }}>
            Previous — {read.length}
          </p>
          <div className="flex flex-col gap-3">
            {read.map(s => (
              <ScoreCard key={s.id} s={s} isNew={false}
                onAcknowledge={handleAcknowledge}
                onDispute={handleDispute}
                onView={openScore}
              />
            ))}
          </div>
        </div>
      )}

      {visibleScores.length === 0 && (
        <div className="text-center py-20" style={{ color: 'rgba(26,30,35,.5)' }}>
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">No scores yet — check back after your tickets are reviewed.</p>
        </div>
      )}
    </div>
  )
}
