import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import ScoreBreakdownHover from '../components/ScoreBreakdownHover'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { isClaimActive } from '../lib/claims'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_BORDER } from '../lib/verdict'

const QUEUE_PAGE_SIZE = 10 // queue rows shown before "Show more"
const colLabel = { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(26,30,35,.5)' }
// Shared grid template for the header + every row, so columns line up like the dashboard table.
// Columns: [checkbox] Status · Ticket · Subject · Agents · Score · Waiting · Actions
const gridCols = (isAdmin) => (isAdmin ? '16px ' : '') + '88px 84px minmax(0,1fr) 120px 56px 60px 130px'

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
  if (days > 3) return '#D14B3D'
  if (days > 1) return '#C8841E'
  return '#B84A2E'
}

// Priority: disputed=0, fail=1, review=2 — then oldest
function priorityOf(item) {
  if (item.disputed)                          return 0
  if (item.effectiveVerdict === 'FAIL')       return 1
  return 2
}

const BADGES = {
  // DISPUTED is its own status (not a verdict) — coral tint / coral text
  DISPUTED:     { label: '⚑ DISPUTED', color: '#B84A2E',                  bg: '#FFEAE6',               border: VERDICT_BORDER.NEEDS_REVIEW, hoverBorder: VERDICT_BORDER.NEEDS_REVIEW },
  NEEDS_REVIEW: { label: '~ REVIEW',   color: '#C8841E',                  bg: '#FBEBD3',               border: VERDICT_BORDER.NEEDS_REVIEW, hoverBorder: VERDICT_BORDER.NEEDS_REVIEW },
  FAIL:         { label: '✕ FAIL',     color: '#D14B3D',                  bg: '#FCE9E6',               border: VERDICT_BORDER.FAIL,         hoverBorder: VERDICT_BORDER.FAIL },
}

function badgeFor(item) {
  if (item.disputed)                          return BADGES.DISPUTED
  if (item.effectiveVerdict === 'FAIL')       return BADGES.FAIL
  return BADGES.NEEDS_REVIEW
}

// ── Queue item row ─────────────────────────────────────────────────────────────

function QueueItem({ item, onClick, selected, onSelect, claimedBy, onClaim, onUnclaim, isAdmin }) {
  const { agents } = useApp()
  const agentName  = (id) => agents.find(a => a.id === id)?.name
  const badge      = badgeFor(item)
  const waiting    = timeInQueue(item.scoredAt)
  const wColor     = urgencyColor(item.scoredAt)

  return (
    <div className="rounded-xl transition-all"
      style={{ background: selected ? '#FBF7F3' : '#FFFFFF', border: `1px solid ${selected ? '#E1DCD7' : '#EEEEEE'}`, boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#FBF7F3' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = '#FFFFFF' }}>

      <div className="grid items-center gap-3 px-3 py-3" style={{ gridTemplateColumns: gridCols(isAdmin) }}>
        {/* Checkbox */}
        {isAdmin && (
          <button onClick={() => onSelect(item.id)}
            className="w-4 h-4 rounded flex items-center justify-center transition-colors"
            style={{ background: selected ? '#FF9780' : '#FFFFFF', border: `1.5px solid ${selected ? '#FF9780' : '#E1DCD7'}` }}>
            {selected && <span style={{ color: '#FFFFFF', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
          </button>
        )}

        {/* Status */}
        <span className="text-xs px-2 py-0.5 rounded-full font-medium truncate text-center"
          style={{ background: badge.bg, color: badge.color }}>
          {badge.label}
        </span>

        {/* Ticket */}
        <a href={gorgiasTicketUrl(item.ticketId)} target="_blank" rel="noopener noreferrer"
          className="text-xs font-mono transition-colors truncate"
          style={{ color: '#B84A2E' }}
          onMouseEnter={e => e.target.style.textDecoration = 'underline'}
          onMouseLeave={e => e.target.style.textDecoration = 'none'}>
          #{item.ticketId}
        </a>

        {/* Subject — click to open */}
        <button onClick={onClick} className="text-sm truncate text-left transition-colors min-w-0"
          style={{ color: '#1A1E23' }}
          onMouseEnter={e => e.currentTarget.style.color = '#B84A2E'}
          onMouseLeave={e => e.currentTarget.style.color = '#1A1E23'}>
          {item.fullScore?.ticket_subject || '—'}
        </button>

        {/* Agents */}
        <div className="flex gap-1 overflow-hidden">
          {item.agentIds?.length > 0
            ? item.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate"
                style={{ background: '#F1ECE8', color: 'rgba(26,30,35,.6)' }}>{name}</span>
            ))
            : <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}
        </div>

        {/* Score */}
        <ScoreBreakdownHover scores={item.fullScore?.scores} align="right">
          <span className="text-sm font-bold tabular-nums cursor-default block text-right" style={{ color: badge.color }}>
            {item.effectiveScore?.toFixed(0)}/100
          </span>
        </ScoreBreakdownHover>

        {/* Waiting */}
        <span className="text-xs tabular-nums font-medium text-right" style={{ color: wColor }}
          title={new Date(item.scoredAt).toLocaleString()}>
          {waiting}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Claim / unclaim */}
          {isAdmin && (
            claimedBy
              ? <span className="text-xs px-2 py-1 rounded-lg truncate"
                  style={{ background: '#FFEAE6', color: '#B84A2E', border: '1px solid #FFEAE6' }}
                  title={`Claimed by ${claimedBy}`}>
                  ● {claimedBy.split(' ')[0]}
                  <button onClick={() => onUnclaim(item.id)}
                    className="ml-1.5 opacity-60 hover:opacity-100" style={{ color: '#B84A2E' }}>✕</button>
                </span>
              : <button onClick={() => onClaim(item.id)}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#B84A2E'; e.currentTarget.style.borderColor = '#FF9780' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
                  Claim
                </button>
          )}
        </div>
      </div>

      {/* Dispute note */}
      {item.disputed && item.disputeNote && (
        <div className="px-4 pb-3.5" style={{ borderTop: '1px solid #F0ECE9' }}>
          <p className="text-xs pt-2.5 mb-1" style={{ color: 'rgba(26,30,35,.5)' }}>Agent's dispute reason:</p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{item.disputeNote}</p>
          {item.disputeAt && (
            <p className="text-xs mt-1.5" style={{ color: 'rgba(26,30,35,.5)' }}>
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
  const { scoreHistory, agents, acknowledgeScore, claimScore, unclaimScore, activeOverlay, setActiveOverlay } = useApp()
  const { user, isAdmin } = useAuth()
  const toast = useToast()

  const [panelScore,  setPanelScore]  = useState(null) // concise side panel
  const [modalScore,  setModalScore]  = useState(null) // full modal (via expand)
  const [sortOrder,    setSortOrder]    = useState('priority')
  const [agentFilter,  setAgentFilter]  = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [statusFilter, setStatusFilter] = useState(null) // null | 'needs_review' | 'disputed' | 'fails'
  const [bulkWorking,  setBulkWorking]  = useState(false)
  const [visibleCount, setVisibleCount] = useState(QUEUE_PAGE_SIZE) // progressive reveal
  const [profiles,     setProfiles]     = useState({})   // id → name, for "claimed by" display

  // Resolve claimer names once (claims store a user id)
  useEffect(() => {
    supabase.from('profiles').select('id, name').then(({ data }) => {
      const map = {}; (data || []).forEach(p => { map[p.id] = p.name }); setProfiles(map)
    })
  }, [])
  const claimedName = (s) =>
    !isClaimActive(s) ? null : (s.claimedBy === user?.id ? 'You' : (profiles[s.claimedBy] || 'Another reviewer'))

  // Queue buckets
  const needsReview = scoreHistory.filter(s => !s.reviewedAt && s.effectiveVerdict === 'NEEDS_REVIEW' && !s.overrideVerdict)
  const disputed    = scoreHistory.filter(s => !s.reviewedAt && s.disputed)
  const failed      = scoreHistory.filter(s => !s.reviewedAt && s.effectiveVerdict === 'FAIL' && !s.acknowledged && !s.overrideVerdict)
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

  const baseList = statusFilter === 'needs_review' ? needsReview
                 : statusFilter === 'disputed'     ? disputed
                 : statusFilter === 'fails'        ? failed
                 : allQueued
  const sorted = sortAndFilter(baseList)

  // Reset the progressive reveal when the filter/sort or queue size changes
  useEffect(() => { setVisibleCount(QUEUE_PAGE_SIZE) }, [statusFilter, agentFilter, sortOrder, totalCount])

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

  // Claim / unclaim (persisted via AppContext)
  const claimTicket   = async (id) => {
    const err = await claimScore(id)
    if (err) toast.error(`Failed to claim: ${err.message || err.code || 'unknown error'}`)
    else toast.success('Ticket claimed')
  }
  const unclaimTicket = (id) => unclaimScore(id)


  // Mirror the dashboard: open a ticket in the side panel, mutually exclusive with
  // other overlays (notifications/settings), expandable to the full modal.
  const openPanel  = (score) => { setPanelScore(score); setActiveOverlay('score') }
  const closePanel = () => { setPanelScore(null); setActiveOverlay(o => o === 'score' ? null : o) }
  useEffect(() => { if (activeOverlay !== 'score') setPanelScore(null) }, [activeOverlay])

  const open = (item) => openPanel({
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
    <div className={`panel-push ${panelScore ? 'is-open' : ''}`}>
    <div className="max-w-6xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'", fontWeight: 600 }}>Review queue</h1>
            {totalCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#FBEBD3', color: '#C8841E' }}>
                {totalCount}
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,.6)' }}>
            Tickets requiring human attention — reviews, disputes and fails
          </p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4" style={{ color: '#2F8F5B' }}>✓</p>
          <p className="font-semibold mb-1" style={{ color: '#1A1E23' }}>Queue is clear</p>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,.5)' }}>No pending reviews, disputes or unacknowledged fails.</p>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Needs Review',         value: needsReview.length, color: '#C8841E', tint: '#FBEBD3', filter: 'needs_review' },
              { label: 'Disputed',             value: disputed.length,    color: '#B84A2E', tint: '#FFEAE6', filter: 'disputed'     },
              { label: 'Unacknowledged Fails', value: failed.length,      color: '#D14B3D', tint: '#FCE9E6', filter: 'fails', small: true },
            ].map(({ label, value, color, tint, filter, small }) => {
              const active = statusFilter === filter
              return (
                <button key={label} onClick={() => setStatusFilter(active ? null : filter)}
                  className="rounded-xl p-3 text-center transition-all"
                  style={{
                    background: active ? tint : '#FFFFFF',
                    border: `1px solid ${active ? color : '#EEEEEE'}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = color }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#EEEEEE' }}>
                  <p className="text-xl font-bold" style={{ color }}>{value}</p>
                  <p className="mt-0.5" style={{ color: active ? '#1A1E23' : 'rgba(26,30,35,.6)', fontSize: small ? '10px' : '12px' }}>{label}</p>
                </button>
              )
            })}
            <div className="rounded-xl p-3 text-center"
              style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
              <p className="text-xl font-bold" style={{ color: +avgWaitDays > 2 ? '#D14B3D' : 'rgba(26,30,35,.6)' }}>{avgWaitDays ? `${avgWaitDays}d` : '—'}</p>
              <p className="mt-0.5 text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Avg wait</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap mb-4 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
            {/* Sort */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#F1ECE8', border: '1px solid #EEEEEE' }}>
              {[{ id: 'priority', label: 'Priority' }, { id: 'oldest', label: 'Oldest' }, { id: 'newest', label: 'Newest' }].map(o => (
                <button key={o.id} onClick={() => setSortOrder(o.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={sortOrder === o.id ? { background: '#FFFFFF', color: '#1A1E23', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' } : { color: 'rgba(26,30,35,.6)' }}
                  onMouseEnter={e => { if (sortOrder !== o.id) e.currentTarget.style.color = '#1A1E23' }}
                  onMouseLeave={e => { if (sortOrder !== o.id) e.currentTarget.style.color = 'rgba(26,30,35,.6)' }}>
                  {o.label}
                </button>
              ))}
            </div>

            {/* Agent filter */}
            {queueAgents.length > 0 && (
              <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                className="rounded-xl px-3 py-2 text-xs"
                style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: agentFilter ? '#1A1E23' : 'rgba(26,30,35,.6)', outline: 'none' }}>
                <option value="">All agents</option>
                {queueAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}

            {/* Bulk select controls */}
            {isAdmin && sorted.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                {statusFilter && (
                  <button onClick={() => setStatusFilter(null)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#1A1E23'; e.currentTarget.style.borderColor = '#E1DCD7' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
                    Show all
                  </button>
                )}
                {selected.size === 0 ? (
                  <button onClick={selectAll}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(26,30,35,.6)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#1A1E23'; e.currentTarget.style.borderColor = '#E1DCD7' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.6)'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
                    Select all
                  </button>
                ) : (
                  <>
                    <span className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>{selected.size} selected</span>
                    <button onClick={bulkAcknowledge} disabled={bulkWorking}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{ background: '#E7F3EC', color: '#2F8F5B', border: '1px solid #CDE6D8', opacity: bulkWorking ? 0.6 : 1 }}>
                      {bulkWorking ? 'Working…' : '✓ Acknowledge all'}
                    </button>
                    <button onClick={clearSelect}
                      className="text-xs transition-colors" style={{ color: 'rgba(26,30,35,.5)' }}
                      onMouseEnter={e => e.target.style.color = '#1A1E23'}
                      onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.5)'}>
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Column headers — share the row grid template so columns line up */}
          {sorted.length > 0 && (
            <div className="grid items-center gap-3 px-3 mb-2" style={{ gridTemplateColumns: gridCols(isAdmin) }}>
              {isAdmin && <span />}
              <span style={colLabel}>Status</span>
              <span style={colLabel}>Ticket</span>
              <span style={colLabel}>Subject</span>
              <span style={colLabel}>Agents</span>
              <span style={colLabel} className="text-right">Score</span>
              <span style={colLabel} className="text-right">Waiting</span>
              <span style={colLabel}>Actions</span>
            </div>
          )}

          {/* Queue list */}
          <div className="flex flex-col gap-2">
            {sorted.slice(0, visibleCount).map(item => (
              <QueueItem
                key={item.id}
                item={item}
                onClick={() => open(item)}
                selected={selected.has(item.id)}
                onSelect={toggleSelect}
                claimedBy={claimedName(item)}
                onClaim={claimTicket}
                onUnclaim={unclaimTicket}
                isAdmin={isAdmin}
              />
            ))}
            {visibleCount < sorted.length && (
              <button onClick={() => setVisibleCount(c => c + QUEUE_PAGE_SIZE)}
                className="text-xs mx-auto mt-2 px-4 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E1DCD7' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E7E3DF' }}>
                Show more · {Math.min(QUEUE_PAGE_SIZE, sorted.length - visibleCount)} of {sorted.length - visibleCount} remaining
              </button>
            )}
            {sorted.length === 0 && agentFilter && (
              <p className="text-sm text-center py-10" style={{ color: 'rgba(26,30,35,.45)' }}>No queue items for this agent.</p>
            )}
          </div>
        </>
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
