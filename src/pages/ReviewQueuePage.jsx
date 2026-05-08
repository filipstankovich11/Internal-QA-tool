import { useState, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import ScoreBreakdownHover from '../components/ScoreBreakdownHover'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetch } from '../lib/api'
import { useToast } from '../components/Toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeInQueue(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function urgencyColor(ts) {
  const days = (Date.now() - ts) / 86400000
  if (days > 3) return '#ef4444'
  if (days > 1) return '#f59e0b'
  return '#666'
}

// Priority: disputed=0, fail=1, review=2 — then oldest
function priorityOf(item) {
  if (item.disputed)                          return 0
  if (item.effectiveVerdict === 'FAIL')       return 1
  return 2
}

const BADGES = {
  DISPUTED:     { label: '⚑ DISPUTED', color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.15)', hoverBorder: 'rgba(251,146,60,0.3)' },
  NEEDS_REVIEW: { label: '~ REVIEW',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.15)', hoverBorder: 'rgba(245,158,11,0.3)' },
  FAIL:         { label: '✕ FAIL',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.15)',  hoverBorder: 'rgba(239,68,68,0.3)'  },
}

function badgeFor(item) {
  if (item.disputed)                          return BADGES.DISPUTED
  if (item.effectiveVerdict === 'FAIL')       return BADGES.FAIL
  return BADGES.NEEDS_REVIEW
}

// ── Queue item row ─────────────────────────────────────────────────────────────

function QueueItem({ item, onClick, selected, onSelect, claimedBy, onClaim, onUnclaim, onNotify, notifying, isAdmin }) {
  const { agents } = useApp()
  const agentName  = (id) => agents.find(a => a.id === id)?.name
  const badge      = badgeFor(item)
  const waiting    = timeInQueue(item.scoredAt)
  const wColor     = urgencyColor(item.scoredAt)

  return (
    <div className="rounded-xl transition-all"
      style={{ background: selected ? '#161616' : '#0f0f0f', border: `1px solid ${selected ? badge.hoverBorder : badge.border}` }}>

      <div className="flex items-center gap-3 px-3 py-3.5">
        {/* Checkbox */}
        {isAdmin && (
          <button onClick={e => { e.stopPropagation(); onSelect(item.id) }}
            className="shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors"
            style={{ background: selected ? '#FF9780' : 'transparent', border: `1.5px solid ${selected ? '#FF9780' : '#444'}` }}>
            {selected && <span style={{ color: '#000', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
          </button>
        )}

        {/* Clickable content */}
        <button onClick={onClick} className="flex-1 flex items-center justify-between gap-3 min-w-0 text-left">
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
            <ScoreBreakdownHover scores={item.fullScore?.scores} align="right">
              <span className="text-sm font-bold tabular-nums cursor-default" style={{ color: badge.color }}>
                {item.effectiveScore?.toFixed(0)}/100
              </span>
            </ScoreBreakdownHover>
            <span className="text-xs tabular-nums font-medium" style={{ color: wColor }}
              title={new Date(item.scoredAt).toLocaleString()}>
              {waiting}
            </span>
          </div>
        </button>

        {/* Row actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Claim / unclaim */}
          {isAdmin && (
            claimedBy
              ? <span className="text-xs px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(255,151,128,0.08)', color: '#FF9780', border: '1px solid rgba(255,151,128,0.2)' }}
                  title={`Claimed by ${claimedBy}`}>
                  ● {claimedBy.split(' ')[0]}
                  <button onClick={e => { e.stopPropagation(); onUnclaim(item.id) }}
                    className="ml-1.5 opacity-60 hover:opacity-100" style={{ color: '#FF9780' }}>✕</button>
                </span>
              : <button onClick={e => { e.stopPropagation(); onClaim(item.id) }}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: '#666', border: '1px solid rgba(255,255,255,0.07)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#FF9780'; e.currentTarget.style.borderColor = 'rgba(255,151,128,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
                  Claim
                </button>
          )}

          {/* Notify */}
          {item.agentIds?.length > 0 && (
            <button onClick={e => { e.stopPropagation(); onNotify(item) }}
              disabled={notifying}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#666', border: '1px solid rgba(255,255,255,0.07)', opacity: notifying ? 0.5 : 1 }}
              onMouseEnter={e => { if (!notifying) { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' } }}
              onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
              title="Notify agent via Slack DM">
              {notifying ? '…' : '↗ Notify'}
            </button>
          )}
        </div>
      </div>

      {/* Dispute note */}
      {item.disputed && item.disputeNote && (
        <div className="px-4 pb-3.5" style={{ borderTop: '1px solid rgba(245,158,11,0.1)' }}>
          <p className="text-xs pt-2.5 mb-1" style={{ color: '#888' }}>Agent's dispute reason:</p>
          <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>{item.disputeNote}</p>
          {item.disputeAt && (
            <p className="text-xs mt-1.5" style={{ color: '#666' }}>
              Flagged {new Date(item.disputeAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReviewQueuePage() {
  const { scoreHistory, agents, acknowledgeScore } = useApp()
  const { user, isAdmin } = useAuth()
  const toast = useToast()

  const [activeScore,  setActiveScore]  = useState(null)
  const [sortOrder,    setSortOrder]    = useState('priority')
  const [agentFilter,  setAgentFilter]  = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [bulkWorking,  setBulkWorking]  = useState(false)
  // claimed: { [scoreId]: userName }
  const [claimed,      setClaimed]      = useState({})
  const [notifying,    setNotifying]    = useState(null) // scoreId being notified

  const userName = user?.email?.split('@')[0] || 'Reviewer'

  // Queue buckets
  const needsReview = scoreHistory.filter(s => s.effectiveVerdict === 'NEEDS_REVIEW' && !s.overrideVerdict)
  const disputed    = scoreHistory.filter(s => s.disputed)
  const failed      = scoreHistory.filter(s => s.effectiveVerdict === 'FAIL' && !s.acknowledged && !s.overrideVerdict)
  const allQueued   = useMemo(() => [...new Map([...disputed, ...needsReview, ...failed].map(s => [s.id, s])).values()], [scoreHistory])

  const totalCount  = allQueued.length
  const avgWaitDays = allQueued.length
    ? (allQueued.reduce((s, x) => s + (Date.now() - x.scoredAt), 0) / allQueued.length / 86400000).toFixed(1)
    : null

  // Agents in queue
  const queueAgentIds = [...new Set(allQueued.flatMap(s => s.agentIds || []))]
  const queueAgents   = agents.filter(a => queueAgentIds.includes(a.id))

  const sortAndFilter = (items) => {
    let result = agentFilter ? items.filter(s => s.agentIds?.includes(agentFilter)) : items
    return [...result].sort((a, b) => {
      if (sortOrder === 'priority') {
        const pd = priorityOf(a) - priorityOf(b)
        return pd !== 0 ? pd : a.scoredAt - b.scoredAt
      }
      if (sortOrder === 'oldest') return a.scoredAt - b.scoredAt
      return b.scoredAt - a.scoredAt
    })
  }

  const sorted = sortAndFilter(allQueued)

  // Selection
  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll    = () => setSelected(new Set(sorted.map(s => s.id)))
  const clearSelect  = () => setSelected(new Set())

  // Bulk acknowledge
  const bulkAcknowledge = async () => {
    if (!selected.size) return
    setBulkWorking(true)
    await Promise.all([...selected].map(id => acknowledgeScore(id)))
    setBulkWorking(false)
    toast.success(`${selected.size} ticket${selected.size > 1 ? 's' : ''} acknowledged`)
    clearSelect()
  }

  // Claim / unclaim
  const claimTicket   = (id) => setClaimed(c => ({ ...c, [id]: userName }))
  const unclaimTicket = (id) => setClaimed(c => { const n = { ...c }; delete n[id]; return n })

  // Quick notify (no preview — direct send)
  const quickNotify = async (item) => {
    const agent = agents.find(a => item.agentIds?.includes(a.id) && a.email)
    if (!agent?.email) { toast.error('No email found for this agent'); return }
    setNotifying(item.id)
    try {
      const res  = await authFetch('/api/notify-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_email:   agent.email,
          reviewer_note: '',
          score: {
            verdict:        item.effectiveVerdict,
            weighted_score: item.effectiveScore,
            ticket_id:      item.ticketId,
            ticket_subject: item.fullScore?.ticket_subject,
            summary:        item.fullScore?.summary,
            key_improvements: item.fullScore?.key_improvements,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Slack DM sent to ${agent.name}`)
    } catch (e) {
      toast.error(e.message || 'Failed to send notification')
    } finally {
      setNotifying(null)
    }
  }

  const open = (item) => setActiveScore({
    ...item.fullScore,
    scoreId:         item.id,
    reviewerNote:    item.notes,
    overrideVerdict: item.overrideVerdict,
    overrideScore:   item.overrideScore,
    overrideNote:    item.overrideNote,
    overrideAt:      item.overrideAt,
    disputed:        item.disputed,
    disputeNote:     item.disputeNote,
    disputeAt:       item.disputeAt,
  })

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Review Queue</h1>
            {totalCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                {totalCount}
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: '#888' }}>
            Tickets needing human attention — reviews, disputes and fails
          </p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">✓</p>
          <p className="text-white font-semibold mb-1">Queue is clear</p>
          <p className="text-sm" style={{ color: '#777' }}>No pending reviews, disputes or unacknowledged fails.</p>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Needs Review', value: needsReview.length, color: '#f59e0b' },
              { label: 'Disputed',     value: disputed.length,    color: '#fb923c' },
              { label: 'Unack. Fails', value: failed.length,      color: '#ef4444' },
              { label: 'Avg wait',     value: avgWaitDays ? `${avgWaitDays}d` : '—', color: +avgWaitDays > 2 ? '#ef4444' : '#aaa' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-3 text-center"
                style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: '#666' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap mb-4 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {/* Sort */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)' }}>
              {[{ id: 'priority', label: 'Priority' }, { id: 'oldest', label: 'Oldest' }, { id: 'newest', label: 'Newest' }].map(o => (
                <button key={o.id} onClick={() => setSortOrder(o.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={sortOrder === o.id ? { background: '#1e1e1e', color: '#fff' } : { color: '#aaa' }}
                  onMouseEnter={e => { if (sortOrder !== o.id) e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { if (sortOrder !== o.id) e.currentTarget.style.color = '#aaa' }}>
                  {o.label}
                </button>
              ))}
            </div>

            {/* Agent filter */}
            {queueAgents.length > 0 && (
              <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                className="rounded-xl px-3 py-2 text-xs"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)', color: agentFilter ? '#fff' : '#aaa', outline: 'none' }}>
                <option value="">All agents</option>
                {queueAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}

            {/* Bulk select controls */}
            {isAdmin && sorted.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                {selected.size === 0 ? (
                  <button onClick={selectAll}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: '#888', border: '1px solid rgba(255,255,255,0.07)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
                    Select all
                  </button>
                ) : (
                  <>
                    <span className="text-xs" style={{ color: '#aaa' }}>{selected.size} selected</span>
                    <button onClick={bulkAcknowledge} disabled={bulkWorking}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)', opacity: bulkWorking ? 0.6 : 1 }}>
                      {bulkWorking ? 'Working…' : '✓ Acknowledge all'}
                    </button>
                    <button onClick={clearSelect}
                      className="text-xs transition-colors" style={{ color: '#666' }}
                      onMouseEnter={e => e.target.style.color = '#ccc'}
                      onMouseLeave={e => e.target.style.color = '#666'}>
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Queue list */}
          <div className="flex flex-col gap-2">
            {sorted.map(item => (
              <QueueItem
                key={item.id}
                item={item}
                onClick={() => open(item)}
                selected={selected.has(item.id)}
                onSelect={toggleSelect}
                claimedBy={claimed[item.id] || null}
                onClaim={claimTicket}
                onUnclaim={unclaimTicket}
                onNotify={quickNotify}
                notifying={notifying === item.id}
                isAdmin={isAdmin}
              />
            ))}
            {sorted.length === 0 && agentFilter && (
              <p className="text-sm text-center py-10" style={{ color: '#555' }}>No queue items for this agent.</p>
            )}
          </div>
        </>
      )}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
