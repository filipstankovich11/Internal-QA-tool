import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import ScoreModal from '../components/ScoreModal'
import ScoreBreakdownHover from '../components/ScoreBreakdownHover'
import { gorgiasTicketUrl } from '../lib/gorgias'

const VERDICT_COLOR  = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG     = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }
const VERDICT_BORDER = { PASS: 'rgba(16,185,129,0.2)', NEEDS_REVIEW: 'rgba(245,158,11,0.2)', FAIL: 'rgba(239,68,68,0.2)' }
const VERDICT_LABEL  = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const scoreColor     = v => v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'

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
        const color = avg >= 4 ? '#10b981' : avg >= 3 ? '#f59e0b' : '#ef4444'
        return (
          <div key={d.key} className="flex flex-col gap-1" title={`${d.short}: ${avg.toFixed(1)}/5`}>
            <div className="w-12 rounded-full overflow-hidden" style={{ height: 3, background: '#1e1e1e' }}>
              <div className="h-full rounded-full" style={{ width: `${(avg / 5) * 100}%`, background: color }} />
            </div>
            <span className="text-xs" style={{ color: '#666' }}>{d.label} {avg.toFixed(1)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Inline dispute form ───────────────────────────────────────────────────────
function DisputeInline({ scoreId, disputed, disputeNote, onDispute }) {
  const [open,   setOpen]   = useState(false)
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)

  if (disputed) return (
    <span className="text-xs px-3 py-1.5 rounded-xl font-medium"
      style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
      ⚑ Disputed
    </span>
  )

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm px-4 py-1.5 rounded-xl font-medium transition-all"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}>
          ⚑ Dispute
        </button>
      ) : (
        <div className="flex flex-col gap-2 mt-2">
          <textarea
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Describe why this score seems incorrect…"
            rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
            style={{ background: '#161616', border: '1px solid rgba(239,68,68,0.3)', color: '#ccc' }}
            onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setNote('') } }}
          />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!note.trim()) return
                setSaving(true)
                await onDispute(scoreId, note.trim())
                setSaving(false)
                setOpen(false)
                setNote('')
              }}
              disabled={!note.trim() || saving}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', opacity: !note.trim() || saving ? 0.5 : 1 }}>
              {saving ? 'Submitting…' : 'Submit dispute'}
            </button>
            <button onClick={() => { setOpen(false); setNote('') }}
              className="text-xs px-3 py-1.5 rounded-lg" style={{ color: '#777' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ s, onAcknowledge, onDispute, onView, isNew }) {
  const [acking, setAcking] = useState(false)
  const vc = VERDICT_COLOR[s.effectiveVerdict]
  const vb = VERDICT_BG[s.effectiveVerdict]
  const vborder = VERDICT_BORDER[s.effectiveVerdict]

  const handleAck = async () => {
    setAcking(true)
    await onAcknowledge(s.id)
    setAcking(false)
  }

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: isNew ? 'rgba(255,151,128,0.03)' : '#0a0a0a',
        border: isNew ? '1px solid rgba(255,151,128,0.15)' : '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: `1px solid ${isNew ? 'rgba(255,151,128,0.1)' : 'rgba(255,255,255,0.05)'}` }}>
        <div className="flex items-center gap-3">
          {isNew && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#FF9780' }} />}
          <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
            className="font-mono text-sm font-medium" style={{ color: '#FF9780' }}
            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
            onMouseLeave={e => e.target.style.textDecoration = 'none'}
            onClick={e => e.stopPropagation()}>
            #{s.ticketId}
          </a>
          <span className="text-sm text-white truncate max-w-xs">
            {s.fullScore?.ticket_subject || '—'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs" style={{ color: '#666' }}>
            {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {s.overrideVerdict && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)' }}>
              Reviewed
            </span>
          )}
        </div>
      </div>

      {/* Score + dimensions */}
      <div className="px-5 py-4 flex items-center gap-6 flex-wrap"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full border"
            style={{ color: vc, background: vb, borderColor: vborder }}>
            {VERDICT_LABEL[s.effectiveVerdict]}
          </span>
          <ScoreBreakdownHover scores={s.fullScore?.scores} align="left">
            <span className="text-2xl font-bold tabular-nums cursor-default" style={{ color: scoreColor(s.effectiveScore) }}>
              {s.effectiveScore?.toFixed(0)}
              <span className="text-sm font-normal ml-0.5" style={{ color: '#666' }}>/100</span>
            </span>
          </ScoreBreakdownHover>
        </div>
        <DimMini scores={s.fullScore?.scores} />
      </div>

      {/* Reviewer note */}
      {s.notes && (
        <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
          <p className="text-xs mb-1" style={{ color: '#777' }}>Reviewer note</p>
          <p className="text-sm leading-relaxed" style={{ color: '#aaa' }}>{s.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {isNew ? (
            <button onClick={handleAck} disabled={acking}
              className="text-sm px-4 py-1.5 rounded-xl font-medium transition-all"
              style={{ background: 'rgba(255,151,128,0.1)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.2)', opacity: acking ? 0.5 : 1 }}
              onMouseEnter={e => { if (!acking) e.currentTarget.style.background = 'rgba(255,151,128,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,151,128,0.1)' }}>
              {acking ? 'Saving…' : '✓ Mark as seen'}
            </button>
          ) : (
            <span className="text-xs" style={{ color: '#555' }}>
              ✓ Seen {s.acknowledgedAt ? new Date(s.acknowledgedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            </span>
          )}
          <DisputeInline
            scoreId={s.id}
            disputed={s.disputed}
            disputeNote={s.disputeNote}
            onDispute={onDispute}
          />
        </div>
        <button onClick={() => onView(s)}
          className="text-xs transition-colors" style={{ color: '#777' }}
          onMouseEnter={e => e.target.style.color = '#ccc'}
          onMouseLeave={e => e.target.style.color = '#555'}>
          Full details →
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const { scoreHistory, acknowledgeScore, flagScore } = useApp()
  const toast  = useToast()
  const [activeScore, setActiveScore] = useState(null)

  const sorted  = [...scoreHistory].sort((a, b) => b.scoredAt - a.scoredAt)
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

  const openScore = (s) => setActiveScore({
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
          <h1 className="text-2xl font-bold text-white">Inbox</h1>
          <p className="text-sm mt-0.5" style={{ color: '#888' }}>
            {unread.length > 0
              ? <><span style={{ color: '#FF9780' }}>{unread.length}</span> new score{unread.length !== 1 ? 's' : ''} to review</>
              : 'All caught up'}
          </p>
        </div>
        {unread.length > 1 && (
          <button onClick={handleAckAll}
            className="text-sm px-4 py-2 rounded-xl transition-colors"
            style={{ color: '#888', border: '1px solid rgba(255,255,255,0.1)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}>
            Mark all as seen
          </button>
        )}
      </div>

      {/* New scores */}
      {unread.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#FF9780' }}>
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
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#666' }}>
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

      {scoreHistory.length === 0 && (
        <div className="text-center py-20" style={{ color: '#555' }}>
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">No scores yet — check back after your tickets are reviewed.</p>
        </div>
      )}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
