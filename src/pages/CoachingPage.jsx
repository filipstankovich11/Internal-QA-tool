import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

const CRITERIA = [
  { key: 'core_inquiry_resolved',     name: 'Core Resolution',        dimension: 'Inquiry Resolution',  dimKey: 'inquiry_resolution',  weight: '50%' },
  { key: 'troubleshooting_procedure', name: 'Troubleshooting',        dimension: 'Inquiry Resolution',  dimKey: 'inquiry_resolution',  weight: '50%' },
  { key: 'forward_resolution',        name: 'Forward Resolution',     dimension: 'Inquiry Resolution',  dimKey: 'inquiry_resolution',  weight: '50%' },
  { key: 'ticket_handling_procedure', name: 'Ticket Handling',        dimension: 'Internal Processes',  dimKey: 'internal_processes',  weight: '25%' },
  { key: 'tone_professionalism',      name: 'Tone & Professionalism', dimension: 'Customer Perception', dimKey: 'customer_perception', weight: '25%' },
  { key: 'communication_clarity',     name: 'Communication Clarity',  dimension: 'Customer Perception', dimKey: 'customer_perception', weight: '25%' },
]

const scoreColor = v => v >= 4 ? '#2F8F5B' : v >= 3 ? '#C8841E' : '#D14B3D'
const scoreBg    = v => v >= 4 ? '#E6F4EC' : v >= 3 ? '#FBF1E0' : '#FEF6F4'
const scoreBorder = v => v >= 4 ? '#BFE3CD' : v >= 3 ? '#EAD3AE' : '#F4DDD7'

function ScorePips({ score }) {
  const color = scoreColor(score)
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="rounded-full"
          style={{ width: 7, height: 7, background: i <= Math.round(score) ? color : '#F0ECE9' }} />
      ))}
    </div>
  )
}

function CriterionCard({ criterion, avg, notes, isWeak }) {
  const [expanded, setExpanded] = useState(false)
  const color = scoreColor(avg)

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: isWeak ? scoreBg(avg) : '#FFFFFF', border: `1px solid ${isWeak ? scoreBorder(avg) : '#EEEEEE'}`, boxShadow: isWeak ? 'none' : '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
        onClick={() => notes.length > 0 && setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: '#1A1E23' }}>{criterion.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: 'rgba(26,30,35,.6)', background: '#FBF7F3' }}>
              {criterion.dimension}
            </span>
          </div>
          <ScorePips score={avg} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg font-bold tabular-nums" style={{ color }}>
            {avg.toFixed(1)}<span className="text-xs font-normal ml-0.5" style={{ color: 'rgba(26,30,35,.5)' }}>/5</span>
          </span>
          {notes.length > 0 && (
            <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)', transform: expanded ? 'rotate(90deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform 0.2s' }}>▶</span>
          )}
        </div>
      </button>

      {expanded && notes.length > 0 && (
        <div className="px-5 pb-4 flex flex-col gap-2.5"
          style={{ borderTop: '1px solid #F0ECE9' }}>
          <p className="text-xs pt-3" style={{ color: 'rgba(26,30,35,.5)' }}>Recent AI feedback on this area:</p>
          {notes.slice(0, 4).map((note, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-xs mt-0.5 shrink-0" style={{ color: 'rgba(26,30,35,.45)' }}>•</span>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ImprovementCard({ text, index }) {
  return (
    <div className="flex gap-3 rounded-2xl px-5 py-4"
      style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
        style={{ background: '#FFEAE6', color: '#B84A2E' }}>
        {index + 1}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{text}</p>
    </div>
  )
}

export default function CoachingPage() {
  const { scoreHistory, agents } = useApp()
  const { user, role } = useAuth()

  const myAgentId = useMemo(
    () => role === 'agent' ? agents.find(a => a.user_id === user?.id)?.id ?? null : null,
    [role, agents, user]
  )
  const scores = useMemo(
    () => myAgentId ? scoreHistory.filter(s => s.agentIds?.includes(myAgentId)) : scoreHistory,
    [scoreHistory, myAgentId]
  )
  const recentScores = useMemo(() => [...scores].sort((a, b) => b.scoredAt - a.scoredAt).slice(0, 20), [scores])

  // ── Per-criterion averages + notes ─────────────────────────────────────────
  const criteriaStats = useMemo(() => {
    return CRITERIA.map(c => {
      const entries = scores
        .map(s => s.fullScore?.scores?.[c.dimKey]?.[c.key])
        .filter(v => v?.score != null)

      if (!entries.length) return { ...c, avg: null, notes: [] }

      const avg   = entries.reduce((sum, e) => sum + Number(e.score), 0) / entries.length
      const notes = entries
        .filter(e => e.notes?.trim())
        .slice(0, 6)
        .map(e => e.notes)

      return { ...c, avg, notes }
    }).filter(c => c.avg != null)
  }, [scores])

  const sorted     = [...criteriaStats].sort((a, b) => a.avg - b.avg)
  const focusAreas = sorted.slice(0, 3)
  const strengths  = sorted.slice(-2).reverse()

  // ── Key improvements from recent scores ────────────────────────────────────
  const improvements = useMemo(() => {
    const all = recentScores.flatMap(s => s.fullScore?.key_improvements || [])
    // Deduplicate near-identical entries (same first 60 chars)
    const seen = new Set()
    return all.filter(imp => {
      const key = imp.slice(0, 60).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 6)
  }, [recentScores])

  // ── Reviewer notes ─────────────────────────────────────────────────────────
  const reviewerNotes = useMemo(() =>
    recentScores.filter(s => s.notes?.trim()).slice(0, 4)
  , [recentScores])

  if (scores.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-16 text-center" style={{ color: 'rgba(26,30,35,.5)' }}>
        <p className="text-4xl mb-4">📋</p>
        <p className="text-sm">No scored tickets yet — coaching insights will appear once tickets are evaluated.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Coaching</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
          Insights based on <span style={{ color: '#B84A2E' }}>{scores.length}</span> scored ticket{scores.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Focus areas */}
      {focusAreas.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Focus Areas</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#D14B3D', background: '#FEF6F4' }}>
              Needs attention
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.6)' }}>
            These are your lowest-scoring areas. Click a card to see AI feedback from recent tickets.
          </p>
          <div className="flex flex-col gap-3">
            {focusAreas.map(c => (
              <CriterionCard key={c.key} criterion={c} avg={c.avg} notes={c.notes} isWeak />
            ))}
          </div>
        </div>
      )}

      {/* Key improvements */}
      {improvements.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold mb-3" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Key Improvements</h2>
          <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.6)' }}>
            Recurring suggestions from your most recent scores.
          </p>
          <div className="flex flex-col gap-2">
            {improvements.map((imp, i) => (
              <ImprovementCard key={i} text={imp} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Reviewer notes */}
      {reviewerNotes.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold mb-3" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Reviewer Notes</h2>
          <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.6)' }}>
            Coaching notes left by your QA reviewer.
          </p>
          <div className="flex flex-col gap-3">
            {reviewerNotes.map(s => (
              <div key={s.id} className="rounded-2xl px-5 py-4"
                style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)' }}>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,30,35,.72)' }}>{s.notes}</p>
                <p className="text-xs mt-2" style={{ color: 'rgba(26,30,35,.5)' }}>
                  Ticket #{s.ticketId} · {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold" style={{ fontFamily: "'Inter Tight'", fontWeight: 600, color: '#1A1E23' }}>Strengths</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: '#2F8F5B', background: '#E6F4EC' }}>
              Keep it up
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.6)' }}>
            Areas where you consistently perform well.
          </p>
          <div className="flex flex-col gap-3">
            {strengths.map(c => (
              <CriterionCard key={c.key} criterion={c} avg={c.avg} notes={c.notes} isWeak={false} />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
