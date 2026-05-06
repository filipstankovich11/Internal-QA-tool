import { useState } from 'react'
import { useApp } from '../context/AppContext'
import ScoreModal from '../components/ScoreModal'
import { gorgiasTicketUrl } from '../lib/gorgias'

function QueueItem({ item, onClick, badge }) {
  const { agents } = useApp()
  const agentName = (id) => agents.find(a => a.id === id)?.name

  return (
    <button onClick={onClick}
      className="w-full rounded-xl px-4 py-3.5 text-left transition-all"
      style={{ background: '#0f0f0f', border: `1px solid ${badge.border}` }}
      onMouseEnter={e => { e.currentTarget.style.background = '#161616'; e.currentTarget.style.borderColor = badge.hoverBorder }}
      onMouseLeave={e => { e.currentTarget.style.background = '#0f0f0f'; e.currentTarget.style.borderColor = badge.border }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
            style={{ background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
          <a href={gorgiasTicketUrl(item.ticketId)} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs font-mono shrink-0 transition-colors"
            style={{ color: '#FF9780' }}
            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
            onMouseLeave={e => e.target.style.textDecoration = 'none'}>
            #{item.ticketId}
          </a>
          <span className="text-sm truncate" style={{ color: '#ccc' }}>
            {item.fullScore?.ticket_subject || '—'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {item.agentIds?.length > 0 && (
            <div className="hidden sm:flex gap-1">
              {item.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: '#1a1a1a', color: '#888' }}>{name}</span>
              ))}
            </div>
          )}
          <span className="text-sm font-bold tabular-nums" style={{ color: badge.color }}>
            {item.effectiveScore?.toFixed(0)}/100
          </span>
          <span className="text-xs" style={{ color: '#444' }}>
            {new Date(item.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function ReviewQueuePage() {
  const { scoreHistory } = useApp()
  const [activeScore, setActiveScore] = useState(null)

  const needsReview = scoreHistory.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW' && !s.overrideVerdict)
  const disputed    = scoreHistory.filter(s => s.disputed)
  const queue = needsReview  // used for total count badge

  const agentName = (id) => agents.find(a => a.id === id)?.name

  const open = (item) => setActiveScore({
    ...item.fullScore,
    scoreId: item.id,
    reviewerNote: item.notes,
    overrideVerdict: item.overrideVerdict,
    overrideScore: item.overrideScore,
    overrideNote: item.overrideNote,
    overrideAt: item.overrideAt,
    disputed: item.disputed,
    disputeNote: item.disputeNote,
    disputeAt: item.disputeAt,
  })

  const totalCount = needsReview.length + disputed.length

  const REVIEW_BADGE  = { label: '~ REVIEW',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.15)', hoverBorder: 'rgba(245,158,11,0.3)' }
  const DISPUTE_BADGE = { label: '⚑ DISPUTED', color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.15)', hoverBorder: 'rgba(251,146,60,0.3)' }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-16 pb-16">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">Review Queue</h1>
          {totalCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              {totalCount}
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: '#666' }}>
          Tickets needing human attention — Needs Review scores and agent disputes
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">✓</p>
          <p className="text-white font-semibold mb-1">Queue is clear</p>
          <p className="text-sm" style={{ color: '#555' }}>No pending reviews or disputes.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {needsReview.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#444' }}>
                Needs Review · {needsReview.length}
              </p>
              <div className="flex flex-col gap-2">
                {needsReview.map(item => (
                  <QueueItem key={item.id} item={item} badge={REVIEW_BADGE} onClick={() => open(item)} />
                ))}
              </div>
            </div>
          )}

          {disputed.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#444' }}>
                Disputed by agent · {disputed.length}
              </p>
              <div className="flex flex-col gap-2">
                {disputed.map(item => (
                  <QueueItem key={item.id} item={item} badge={DISPUTE_BADGE} onClick={() => open(item)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
