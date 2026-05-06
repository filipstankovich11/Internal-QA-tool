import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import ScoreModal from '../components/ScoreModal'
import { gorgiasTicketUrl } from '../lib/gorgias'

const VERDICT_COLOR = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG    = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const VERDICTS      = ['PASS', 'NEEDS_REVIEW', 'FAIL']

const selectStyle = {
  background: '#0f0f0f',
  border: '1px solid rgba(255,255,255,0.07)',
  color: '#ccc',
  outline: 'none',
}

function FilterBar({ agents, teams, filters, setFilters, total, filtered }) {
  const set = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const hasFilters = filters.agent || filters.team || filters.verdicts.length || filters.dateFrom || filters.dateTo

  const inputFocus = e => e.target.style.borderColor = '#FF9780'
  const inputBlur  = e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'

  return (
    <div className="rounded-2xl p-4 mb-6" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex flex-wrap gap-3 items-end">

        {/* Agent */}
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <label className="text-xs" style={{ color: '#555' }}>Agent</label>
          <select value={filters.agent} onChange={e => set('agent', e.target.value)}
            className="rounded-xl px-3 py-2 text-sm" style={selectStyle}
            onFocus={inputFocus} onBlur={inputBlur}>
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Team */}
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <label className="text-xs" style={{ color: '#555' }}>Team</label>
          <select value={filters.team} onChange={e => set('team', e.target.value)}
            className="rounded-xl px-3 py-2 text-sm" style={selectStyle}
            onFocus={inputFocus} onBlur={inputBlur}>
            <option value="">All teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs" style={{ color: '#555' }}>From</label>
          <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
            className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }}
            onFocus={inputFocus} onBlur={inputBlur} />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs" style={{ color: '#555' }}>To</label>
          <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
            className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }}
            onFocus={inputFocus} onBlur={inputBlur} />
        </div>

        {/* Verdict toggles */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs" style={{ color: '#555' }}>Status</label>
          <div className="flex gap-1.5">
            {VERDICTS.map(v => {
              const active = filters.verdicts.includes(v)
              return (
                <button key={v} onClick={() => set('verdicts', active
                  ? filters.verdicts.filter(x => x !== v)
                  : [...filters.verdicts, v]
                )}
                  className="text-xs px-3 py-2 rounded-xl border transition-all font-medium"
                  style={active
                    ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                    : { color: '#555', borderColor: 'rgba(255,255,255,0.07)' }
                  }>
                  {VERDICT_LABEL[v]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Clear + count */}
        <div className="flex items-end gap-3 ml-auto">
          <span className="text-xs pb-2.5" style={{ color: '#444' }}>
            {filtered} / {total} tickets
          </span>
          {hasFilters && (
            <button onClick={() => setFilters({ agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '' })}
              className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#555'}>
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TicketsPage() {
  const { scoreHistory, agents, teams, getAgentScores } = useApp()
  const [activeScore, setActiveScore] = useState(null)
  const [filters, setFilters] = useState({
    agent: '', team: '', verdicts: [], dateFrom: '', dateTo: '',
  })

  // Build a set of agent IDs per team for team filter
  const teamAgentMap = useMemo(() => {
    const map = {}
    teams.forEach(t => {
      map[t.id] = new Set(agents.filter(a => a.team_id === t.id).map(a => a.id))
    })
    return map
  }, [teams, agents])

  const filtered = useMemo(() => scoreHistory.filter(s => {
    if (filters.agent && !s.agentIds?.includes(filters.agent)) return false
    if (filters.team  && !s.agentIds?.some(id => teamAgentMap[filters.team]?.has(id))) return false
    if (filters.verdicts.length && !filters.verdicts.includes(s.verdict)) return false
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).setHours(0,0,0,0)
      if (s.scoredAt < from) return false
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).setHours(23,59,59,999)
      if (s.scoredAt > to) return false
    }
    return true
  }), [scoreHistory, filters, teamAgentMap])

  // Agent name lookup
  const agentName = (id) => agents.find(a => a.id === id)?.name

  return (
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Tickets</h1>
        <p className="text-sm mt-0.5" style={{ color: '#666' }}>All scored tickets with filters</p>
      </div>

      <FilterBar
        agents={agents} teams={teams}
        filters={filters} setFilters={setFilters}
        total={scoreHistory.length} filtered={filtered.length}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: '#333' }}>
          <p className="text-4xl mb-3">🎫</p>
          <p className="text-sm">{scoreHistory.length === 0 ? 'No tickets scored yet.' : 'No tickets match your filters.'}</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Table header */}
          <div className="grid text-xs px-4 py-2.5" style={{
            gridTemplateColumns: '100px 1fr 140px 80px 90px 80px',
            background: '#0a0a0a', color: '#444', borderBottom: '1px solid rgba(255,255,255,0.05)'
          }}>
            <span>Ticket</span>
            <span>Subject</span>
            <span>Agents</span>
            <span className="text-right">Score</span>
            <span className="text-center">Status</span>
            <span className="text-right">Date</span>
          </div>

          {/* Rows */}
          {filtered.map(s => (
            <div key={s.id}
              className="grid items-center px-4 py-3 transition-colors"
              style={{
                gridTemplateColumns: '100px 1fr 140px 80px 90px 80px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Ticket ID — hyperlink */}
              <a href={gorgiasTicketUrl(s.ticketId)} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="font-mono text-xs transition-colors"
                style={{ color: '#FF9780' }}
                onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                onMouseLeave={e => e.target.style.textDecoration = 'none'}>
                #{s.ticketId}
              </a>

              {/* Subject — clickable to open score modal */}
              <button onClick={() => setActiveScore(s.fullScore)}
                className="text-sm text-left truncate pr-3 transition-colors"
                style={{ color: '#ccc' }}
                onMouseEnter={e => e.target.style.color = '#fff'}
                onMouseLeave={e => e.target.style.color = '#ccc'}>
                {s.fullScore?.ticket_subject || '—'}
              </button>

              {/* Agents */}
              <div className="flex flex-wrap gap-1 pr-2">
                {s.agentIds?.length > 0
                  ? s.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
                      style={{ background: '#1a1a1a', color: '#888' }}>{name}</span>
                  ))
                  : <span style={{ color: '#333' }}>—</span>
                }
              </div>

              {/* Score */}
              <span className="text-sm font-bold tabular-nums text-right"
                style={{ color: s.weightedScore >= 80 ? '#10b981' : s.weightedScore >= 60 ? '#f59e0b' : '#ef4444' }}>
                {s.weightedScore?.toFixed(0)}/100
              </span>

              {/* Verdict */}
              <div className="flex justify-center">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ color: VERDICT_COLOR[s.verdict], background: VERDICT_BG[s.verdict] }}>
                  {VERDICT_LABEL[s.verdict] || s.verdict}
                </span>
              </div>

              {/* Date */}
              <span className="text-xs text-right" style={{ color: '#444' }}>
                {new Date(s.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
