import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { useToast } from '../components/Toast'
import { isClaimActive, CLAIM_TTL_MS } from '../lib/claims'
import { isInReviewQueue } from '../lib/queue'
import { VERDICT_COLOR, VERDICT_BG } from '../lib/verdict'

function statusOf(s) {
  if (s.disputed)                      return { label: 'DISPUTED', color: '#fb923c', bg: 'rgba(251,146,60,0.1)' }
  if (s.effectiveVerdict === 'FAIL')   return { label: 'FAIL',     color: VERDICT_COLOR.FAIL,         bg: VERDICT_BG.FAIL }
  return { label: 'REVIEW', color: VERDICT_COLOR.NEEDS_REVIEW, bg: VERDICT_BG.NEEDS_REVIEW }
}

function timeSince(ts) {
  const ms = Date.now() - ts
  const d = Math.floor(ms / 86400000)
  if (d >= 1) return `${d}d`
  const h = Math.floor(ms / 3600000)
  if (h >= 1) return `${h}h`
  return `${Math.max(1, Math.floor(ms / 60000))}m`
}

// Shared column template so the header and every row line up
const QUEUE_COLS = '88px minmax(0,1fr) 120px 88px 64px 44px 152px'
const colLabel   = { fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8c8c8' }

function QueueHeader() {
  return (
    <div className="grid items-center gap-3 px-3 mb-1.5" style={{ gridTemplateColumns: QUEUE_COLS }}>
      <span style={colLabel} title="Gorgias ticket ID">Ticket</span>
      <span style={colLabel} title="Ticket subject">Subject</span>
      <span style={colLabel} title="Agents on the ticket">Agents</span>
      <span style={colLabel} title="Verdict — fail / review / disputed">Status</span>
      <span style={colLabel} className="text-right" title="Weighted QA score (0–100)">Grade</span>
      <span style={colLabel} className="text-right" title="Time since the ticket was scored">Age</span>
      <span style={colLabel} className="text-right">Actions</span>
    </div>
  )
}

function QueueRow({ s, onOpen, onRelease, onComplete, agentNames, muted }) {
  const st = statusOf(s)
  const claimAge = Date.now() - (s.claimedAt || Date.now())
  const expiresIn = Math.max(0, Math.ceil((CLAIM_TTL_MS - claimAge) / 86400000))
  return (
    <div className="grid items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
      style={{ gridTemplateColumns: QUEUE_COLS, background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)', opacity: muted ? 0.6 : 1 }}
      onMouseEnter={e => e.currentTarget.style.background = '#161616'}
      onMouseLeave={e => e.currentTarget.style.background = '#1e1e20'}>
      {/* Ticket */}
      <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
        className="text-xs font-mono truncate transition-colors" style={{ color: '#FF9780' }}
        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
        onMouseLeave={e => e.target.style.textDecoration = 'none'}>
        #{s.ticketId}
      </a>
      {/* Subject */}
      <button onClick={() => onOpen(s)} className="text-left truncate text-sm transition-colors min-w-0"
        style={{ color: '#e8e8e8' }}
        title={s.fullScore?.ticket_subject || undefined}
        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
        onMouseLeave={e => e.currentTarget.style.color = '#e8e8e8'}>
        {s.fullScore?.ticket_subject || '—'}
      </button>
      {/* Agents */}
      <span className="text-xs truncate" style={{ color: agentNames ? '#c8c8c8' : '#666' }} title={agentNames || undefined}>
        {agentNames || '—'}
      </span>
      {/* Status */}
      {!muted
        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full justify-self-start" style={{ color: st.color, background: st.bg }}>{st.label}</span>
        : <span className="text-xs" style={{ color: '#666' }}>—</span>}
      {/* Grade */}
      <span className="text-sm tabular-nums text-right" style={{ color: '#c8c8c8' }}>{s.effectiveScore?.toFixed(0)}/100</span>
      {/* Age */}
      <span className="text-xs tabular-nums text-right" style={{ color: '#888' }}
        title={muted ? undefined : `Auto-releases in ~${expiresIn} day${expiresIn !== 1 ? 's' : ''} if untouched`}>
        {timeSince(s.scoredAt)}
      </span>
      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {onComplete && (
          <button onClick={() => onComplete(s.id)}
            className="text-xs px-2 py-1 rounded-lg shrink-0 transition-colors" style={{ color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.08)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.16)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.08)'}
            title="Mark reviewed — removes it from the queue and releases the claim">
            ✓ Reviewed
          </button>
        )}
        <button onClick={() => onRelease(s.id)}
          className="text-xs px-2 py-1 rounded-lg shrink-0 transition-colors" style={{ color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
          title="Release this claim back to the Review Queue">
          Release
        </button>
      </div>
    </div>
  )
}

export default function MyQueuePage() {
  const { scoreHistory, agents, unclaimScore, markReviewed, activeOverlay, setActiveOverlay } = useApp()
  const { user } = useAuth()
  const toast = useToast()

  const [panelScore, setPanelScore] = useState(null)
  const [modalScore, setModalScore] = useState(null)
  const openPanel  = (s) => { setPanelScore(s); setActiveOverlay('score') }
  const closePanel = () => { setPanelScore(null); setActiveOverlay(o => o === 'score' ? null : o) }
  useEffect(() => { if (activeOverlay !== 'score') setPanelScore(null) }, [activeOverlay])

  const agentNamesFor = (s) => (s.agentIds || []).map(id => agents.find(a => a.id === id)?.name).filter(Boolean).join(', ')

  // My active claims — oldest first, so you work through the queue in order
  const mine = useMemo(() => {
    const now = Date.now()
    return scoreHistory
      .filter(s => s.claimedBy === user?.id && isClaimActive(s, now))
      .sort((a, b) => a.scoredAt - b.scoredAt)
  }, [scoreHistory, user])

  const open = mine.filter(isInReviewQueue)
  const done = mine.filter(s => !isInReviewQueue(s))

  const release  = async (id) => { const ok = await unclaimScore(id); if (ok) toast.info('Ticket released') }
  const complete = async (id) => { const err = await markReviewed(id); if (!err) toast.success('Marked reviewed') }

  const openScore = (s) => openPanel({
    ...s.fullScore, scoreId: s.id, reviewerNote: s.notes,
    overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt,
  })

  return (
    <div className={`panel-push ${panelScore ? 'is-open' : ''}`}>
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">My Queue</h1>
          {open.length > 0 && (
            <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(255,151,128,0.12)', color: '#FF9780' }}>
              {open.length} to review
            </span>
          )}
        </div>
        <p className="text-sm mt-0.5" style={{ color: '#c8c8c8' }}>
          Tickets you've claimed from the Review Queue. Claims auto-release after {Math.round(CLAIM_TTL_MS / 86400000)} days if untouched.
        </p>
      </div>

      {mine.length === 0 ? (
        <div className="text-center py-20" style={{ color: '#888' }}>
          <p className="text-4xl mb-3">🗂️</p>
          <p className="text-sm">Nothing claimed yet. Claim tickets from the Review Queue to build your worklist.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* To review */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#c8c8c8' }}>To review</p>
            {open.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: '#888' }}>All caught up — nothing left to review in your claims.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <QueueHeader />
                {open.map(s => (
                  <QueueRow key={s.id} s={s} onOpen={openScore} onRelease={release} onComplete={complete} agentNames={agentNamesFor(s)} />
                ))}
              </div>
            )}
          </div>

          {/* Resolved (claimed, already reviewed) */}
          {done.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#888' }}>
                Resolved <span style={{ color: '#666' }}>· release to clear from your queue</span>
              </p>
              <div className="flex flex-col gap-2">
                <QueueHeader />
                {done.map(s => (
                  <QueueRow key={s.id} s={s} onOpen={openScore} onRelease={release} agentNames={agentNamesFor(s)} muted />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    {panelScore && (
      <ScoreModal
        score={panelScore}
        onClose={closePanel}
        onExpand={() => { setModalScore(panelScore); closePanel() }}
        panel
        actions
      />
    )}
    {modalScore && <ScoreModal score={modalScore} onClose={() => setModalScore(null)} actions />}
    </div>
  )
}
