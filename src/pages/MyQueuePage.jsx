import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { useToast } from '../components/Toast'
import { isClaimActive } from '../lib/claims'
import { isInReviewQueue } from '../lib/queue'
import { gradeColor } from '../lib/verdict'

// Status pill — matches the Review Queue tints
function statusOf(s) {
  if (s.disputed)                      return { label: '⚑ DISPUTED', color: '#B84A2E', bg: '#FFEAE6' }
  if (s.effectiveVerdict === 'FAIL')   return { label: '✕ FAIL',     color: '#D14B3D', bg: '#FCE9E6' }
  return { label: '~ REVIEW', color: '#C8841E', bg: '#FBEBD3' }
}

function ago(ts) {
  const ms = Date.now() - ts
  const d = Math.floor(ms / 86400000)
  if (d >= 1) return `${d}d`
  const h = Math.floor(ms / 3600000)
  if (h >= 1) return `${h}h`
  return `${Math.max(1, Math.floor(ms / 60000))}m`
}

const PlayIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
const PenIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>

const CARD_SHADOW = '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)'

function StatTile({ label, value, color }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: 14, padding: '16px 18px', boxShadow: CARD_SHADOW }}>
      <p className="tabular-nums m-0" style={{ fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, fontSize: 28, color: color || '#1A1E23', lineHeight: 1.1 }}>{value}</p>
      <p className="m-0 mt-1 uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(26,30,35,.5)' }}>{label}</p>
    </div>
  )
}

function ClaimCard({ s, agentNames, onScore, onRelease, muted }) {
  const st = statusOf(s)
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors"
      style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: CARD_SHADOW, opacity: muted ? 0.65 : 1 }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: st.color, background: st.bg }}>{st.label}</span>
          <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono transition-colors" style={{ color: '#B84A2E' }}
            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
            onMouseLeave={e => e.target.style.textDecoration = 'none'}>
            #{s.ticketId}
          </a>
          <span className="text-xs" style={{ color: 'rgba(26,30,35,.45)' }}>· claimed {ago(s.claimedAt || s.scoredAt)} ago</span>
        </div>
        <button onClick={() => onScore(s)} className="block text-left max-w-full transition-colors"
          onMouseEnter={e => e.currentTarget.style.color = '#B84A2E'}
          onMouseLeave={e => e.currentTarget.style.color = '#1A1E23'}
          style={{ color: '#1A1E23' }}>
          <p className="truncate font-medium" style={{ fontSize: 15 }}>{s.fullScore?.ticket_subject || '—'}</p>
        </button>
        <p className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.5)' }}>
          Auto-score <span className="font-semibold" style={{ color: gradeColor(s.effectiveScore) }}>{s.effectiveScore?.toFixed(0)}/100</span>
          {' · '}{agentNames || 'no agent linked'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onRelease(s.id)}
          className="text-xs px-3 py-2 rounded-lg transition-colors" style={{ color: 'rgba(26,30,35,.72)', border: '1px solid #E7E3DF', background: '#FFFFFF' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#D14B3D'; e.currentTarget.style.borderColor = '#F4DDD7' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.borderColor = '#E7E3DF' }}
          title="Release this claim back to the Review Queue">
          Release
        </button>
        <button onClick={() => onScore(s)}
          className="g-btn-primary inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg font-medium whitespace-nowrap">
          <PenIcon /> Score now
        </button>
      </div>
    </div>
  )
}

export default function MyQueuePage() {
  const { scoreHistory, agents, unclaimScore, openScore: showScore } = useApp()
  const { user } = useAuth()
  const toast = useToast()

  const agentNamesFor = (s) => (s.agentIds || []).map(id => agents.find(a => a.id === id)?.name).filter(Boolean).join(' · ')

  // My active claims — oldest first, so you work through the queue in order
  const mine = useMemo(() => {
    const now = Date.now()
    return scoreHistory
      .filter(s => s.claimedBy === user?.id && isClaimActive(s, now))
      .sort((a, b) => a.scoredAt - b.scoredAt)
  }, [scoreHistory, user])

  const open = mine.filter(isInReviewQueue)
  const done = mine.filter(s => !isInReviewQueue(s))

  // Stats
  const oldestWait = open.length ? Math.floor((Date.now() - Math.min(...open.map(s => s.scoredAt))) / 86400000) : 0
  const isToday = (ts) => ts && new Date(ts).toDateString() === new Date().toDateString()
  const scoredToday = scoreHistory.filter(s => s.reviewedBy === user?.id && isToday(s.reviewedAt)).length

  const release = async (id) => { const ok = await unclaimScore(id); if (ok) toast.info('Ticket released') }

  const openScore = (s) => showScore({
    ...s.fullScore, scoreId: s.id, reviewerNote: s.notes,
    overrideVerdict: s.overrideVerdict, overrideScore: s.overrideScore, overrideNote: s.overrideNote, overrideAt: s.overrideAt,
  }, { actions: true })

  return (
    <div className="panel-push">
    <div className="max-w-5xl mx-auto px-8 pt-8 pb-14">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: 30, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>My queue</h1>
            {open.length > 0 && (
              <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#FFEAE6', color: '#B84A2E' }}>{open.length}</span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: 'rgba(26,30,35,.6)' }}>Tickets you've claimed — score them before the wait runs out.</p>
        </div>
        <button onClick={() => open.length && openScore(open[0])} disabled={!open.length}
          className="g-btn-primary inline-flex items-center gap-2 text-sm px-4 rounded-lg font-medium shrink-0"
          style={{ height: 40, opacity: open.length ? 1 : 0.5, cursor: open.length ? 'pointer' : 'not-allowed' }}>
          <PlayIcon /> Start scoring
        </button>
      </div>

      {/* Stat ribbon */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatTile label="Claimed by me" value={mine.length} />
        <StatTile label="Oldest wait"   value={`${oldestWait}d`} color={oldestWait > 7 ? '#D14B3D' : oldestWait > 0 ? '#C8841E' : '#1A1E23'} />
        <StatTile label="Scored today"  value={scoredToday} color={scoredToday > 0 ? '#2F8F5B' : 'rgba(26,30,35,.45)'} />
      </div>

      {mine.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'rgba(26,30,35,.45)' }}>
          <p className="text-4xl mb-3">🗂️</p>
          <p className="text-sm">Nothing claimed yet. Claim tickets from the Review Queue to add them here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {open.map(s => (
            <ClaimCard key={s.id} s={s} agentNames={agentNamesFor(s)} onScore={openScore} onRelease={release} />
          ))}
          {done.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: 'rgba(26,30,35,.45)', letterSpacing: '.08em' }}>
                Resolved <span style={{ color: 'rgba(26,30,35,.35)' }}>· release to clear</span>
              </p>
              {done.map(s => (
                <ClaimCard key={s.id} s={s} agentNames={agentNamesFor(s)} onScore={openScore} onRelease={release} muted />
              ))}
            </>
          )}
        </div>
      )}
    </div>
    </div>
  )
}
