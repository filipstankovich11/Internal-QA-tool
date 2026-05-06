import { useMemo, useState } from 'react'
import ScoreModal from '../components/ScoreModal'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { gorgiasTicketUrl } from '../lib/gorgias'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

const VERDICT_STYLE = {
  PASS:         { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '✓', label: 'PASS'   },
  NEEDS_REVIEW: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '~', label: 'REVIEW' },
  FAIL:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: '✗', label: 'FAIL'   },
}

function HistoryItem({ item, onClick }) {
  const vs = VERDICT_STYLE[item.verdict] || { color: '#888', bg: 'transparent', icon: '?', label: '?' }
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
      style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={e => e.currentTarget.style.background = '#161616'}
      onMouseLeave={e => e.currentTarget.style.background = '#0f0f0f'}
    >
      <div className="flex items-center gap-3 min-w-0">
        <a href={gorgiasTicketUrl(item.ticketId)} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-xs font-mono shrink-0 transition-colors"
          style={{ color: '#FF9780' }}
          onMouseEnter={e => e.target.style.textDecoration='underline'}
          onMouseLeave={e => e.target.style.textDecoration='none'}>
          #{item.ticketId}
        </a>
        <span className="text-sm truncate" style={{ color: '#ccc' }}>
          {item.fullScore?.ticket_subject || item.fullScore?.summary?.split('.')[0] || '—'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <span className="text-xs tabular-nums" style={{ color: '#555' }}>{item.weightedScore?.toFixed(0)}/100</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: vs.color, background: vs.bg }}>
          {vs.icon} {vs.label}
        </span>
      </div>
    </button>
  )
}

function SamplerSection({ onScore }) {
  const { agents, rubric, addScore } = useApp()
  const samplerAgents = agents.filter(a => a.gorgias_user_id)
  const [agentId,   setAgentId]   = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [count,     setCount]     = useState(5)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [tickets,   setTickets]   = useState(null)   // null = not sampled yet
  const [scoring,   setScoring]   = useState({})     // ticketId → 'loading'|'done'|'error'

  const sample = async () => {
    if (!agentId) return
    setLoading(true); setError(null); setTickets(null)
    try {
      const agent = agents.find(a => a.id === agentId)
      const params = new URLSearchParams({ gorgias_user_id: agent.gorgias_user_id, count })
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to',   dateTo)
      const res  = await fetch(`${API_BASE}/api/sample-tickets?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Sampling failed'); return }
      setTickets(data)
    } catch { setError('Could not reach the server') }
    finally { setLoading(false) }
  }

  const scoreTicket = async (ticketId) => {
    setScoring(prev => ({ ...prev, [ticketId]: 'loading' }))
    try {
      const res  = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: String(ticketId), rubric }) })
      const data = await res.json()
      if (!res.ok) { setScoring(prev => ({ ...prev, [ticketId]: 'error' })); return }
      const entry = await addScore(data)
      setScoring(prev => ({ ...prev, [ticketId]: 'done' }))
      onScore({ ...data, scoreId: entry?.id })
    } catch { setScoring(prev => ({ ...prev, [ticketId]: 'error' })) }
  }

  const selectStyle = { background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.07)', color: '#ccc', outline: 'none' }
  const focus = e => e.target.style.borderColor = '#FF9780'
  const blur  = e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'

  return (
    <div className="mt-10">
      <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#444' }}>Random Sample</p>
      <div className="rounded-2xl p-5" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
        {samplerAgents.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#444' }}>
            No agents with a Gorgias User ID yet — add one in the Agents page to enable sampling.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
                <label className="text-xs" style={{ color: '#555' }}>Agent</label>
                <select value={agentId} onChange={e => setAgentId(e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  <option value="">Select agent…</option>
                  {samplerAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs" style={{ color: '#555' }}>From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs" style={{ color: '#555' }}>To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm" style={{ ...selectStyle, colorScheme: 'dark' }} onFocus={focus} onBlur={blur} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs" style={{ color: '#555' }}>Count</label>
                <select value={count} onChange={e => setCount(Number(e.target.value))}
                  className="rounded-xl px-3 py-2 text-sm" style={selectStyle} onFocus={focus} onBlur={blur}>
                  {[3,5,8,10].map(n => <option key={n} value={n}>{n} tickets</option>)}
                </select>
              </div>
            </div>

            <button onClick={sample} disabled={!agentId || loading}
              className="g-btn-primary text-sm px-5 py-2.5 rounded-xl w-full"
              style={{ opacity: !agentId || loading ? 0.5 : 1 }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>Fetching from Gorgias…
                </span>
              ) : 'Get Random Sample'}
            </button>

            {error && <p className="text-xs text-center mt-3" style={{ color: '#ef4444' }}>{error}</p>}

            {tickets && (
              <div className="mt-5">
                <p className="text-xs mb-3" style={{ color: '#555' }}>
                  Sampled {tickets.tickets.length} of {tickets.total_found} matching tickets — click Score to evaluate
                </p>
                <div className="flex flex-col gap-2">
                  {tickets.tickets.map(t => {
                    const st = scoring[t.id]
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: '#111', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <a href={gorgiasTicketUrl(t.id)} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono shrink-0" style={{ color: '#FF9780' }}
                          onMouseEnter={e => e.target.style.textDecoration='underline'}
                          onMouseLeave={e => e.target.style.textDecoration='none'}>
                          #{t.id}
                        </a>
                        <span className="text-sm flex-1 truncate" style={{ color: '#ccc' }}>{t.subject || '—'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 capitalize"
                          style={{ background: '#1a1a1a', color: '#555' }}>{t.status}</span>
                        {st === 'done' ? (
                          <span className="text-xs font-medium shrink-0" style={{ color: '#10b981' }}>✓ Scored</span>
                        ) : st === 'error' ? (
                          <span className="text-xs shrink-0" style={{ color: '#ef4444' }}>Error</span>
                        ) : (
                          <button onClick={() => scoreTicket(t.id)} disabled={st === 'loading'}
                            className="text-xs px-3 py-1 rounded-lg shrink-0 transition-all g-btn-primary"
                            style={{ opacity: st === 'loading' ? 0.5 : 1 }}>
                            {st === 'loading' ? '…' : 'Score'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const VERDICT_COLOR = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG    = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const VERDICTS      = ['PASS', 'NEEDS_REVIEW', 'FAIL']

const hStyle = { background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.07)', color: '#ccc', outline: 'none' }
const hFocus  = e => e.target.style.borderColor = '#FF9780'
const hBlur   = e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'

export default function ScorePage() {
  const { scoreHistory, addScore, agents, rubric } = useApp()
  const { canScore } = useAuth()
  const [ticketUrl,   setTicketUrl]   = useState('')
  const [loading,     setLoading]     = useState(false)
  const [activeScore, setActiveScore] = useState(null)
  const [error,       setError]       = useState(null)
  const [filters,     setFilters]     = useState({ agent: '', verdicts: [], dateFrom: '', dateTo: '' })

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const hasFilters = filters.agent || filters.verdicts.length || filters.dateFrom || filters.dateTo

  const filteredHistory = useMemo(() => scoreHistory.filter(s => {
    if (filters.agent && !s.agentIds?.includes(filters.agent)) return false
    if (filters.verdicts.length && !filters.verdicts.includes(s.effectiveVerdict)) return false
    if (filters.dateFrom && s.scoredAt < new Date(filters.dateFrom).setHours(0,0,0,0)) return false
    if (filters.dateTo   && s.scoredAt > new Date(filters.dateTo).setHours(23,59,59,999)) return false
    return true
  }), [scoreHistory, filters])

  const isValidGorgiasUrl = (val) => {
    const v = val.trim()
    // Accept: full URL containing /ticket(s)/, a view URL, or a bare numeric ID
    return /\/tickets?\/\d+/.test(v) || /\/views\/\d+\/\d+/.test(v) || /^\d+$/.test(v)
  }

  const urlError = ticketUrl.trim() && !isValidGorgiasUrl(ticketUrl)
    ? 'Paste a Gorgias ticket URL or ticket ID'
    : null

  const analyze = async () => {
    const url = ticketUrl.trim()
    if (!url || loading || urlError) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: url, rubric }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return }
      addScore(data)
      setActiveScore(data)
      setTicketUrl('')
    } catch { setError('Could not reach the server.') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-16 pb-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white mb-1">Score a Ticket</h1>
        <p className="text-sm" style={{ color: '#666' }}>Paste a Gorgias ticket URL to evaluate agent quality</p>
      </div>

      {!canScore && (
        <div className="rounded-xl px-4 py-3 mb-4 text-sm text-center" style={{ background: 'rgba(255,151,128,0.06)', border: '1px solid rgba(255,151,128,0.15)', color: '#888' }}>
          Your role is <strong style={{ color: '#FF9780' }}>read-only</strong>. Contact an admin to score tickets.
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input
          type="text" value={ticketUrl}
          onChange={e => setTicketUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          disabled={loading || !canScore}
          placeholder="https://gorgias.gorgias.com/app/ticket/..."
          className="flex-1 rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] outline-none transition-colors g-input disabled:opacity-50"
        />
        <button onClick={analyze} disabled={loading || !ticketUrl.trim() || !!urlError || !canScore}
          className="g-btn-primary text-sm px-6 py-3 rounded-xl whitespace-nowrap disabled:opacity-40">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>Analyzing...
            </span>
          ) : 'Analyze'}
        </button>
      </div>

      {urlError && <p className="text-xs mt-2 ml-1" style={{ color: '#f59e0b' }}>⚠ {urlError}</p>}
      {loading  && <p className="text-xs text-center mt-2" style={{ color: '#555' }}>Claude is scoring this ticket — usually 15–30 seconds</p>}
      {error    && <p className="text-xs text-center mt-2" style={{ color: '#ef4444' }}>{error}</p>}

      {scoreHistory.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider" style={{ color: '#444' }}>
              History {hasFilters && <span style={{ color: '#FF9780' }}>· {filteredHistory.length} match</span>}
            </p>
            {hasFilters && (
              <button onClick={() => setFilters({ agent: '', verdicts: [], dateFrom: '', dateTo: '' })}
                className="text-xs transition-colors" style={{ color: '#555' }}
                onMouseEnter={e => e.target.style.color='#ef4444'}
                onMouseLeave={e => e.target.style.color='#555'}>
                Clear filters
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)' }}>

            <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
              <label className="text-xs" style={{ color: '#555' }}>Agent</label>
              <select value={filters.agent} onChange={e => setF('agent', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={hStyle} onFocus={hFocus} onBlur={hBlur}>
                <option value="">All agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#555' }}>From</label>
              <input type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...hStyle, colorScheme: 'dark' }} onFocus={hFocus} onBlur={hBlur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#555' }}>To</label>
              <input type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)}
                className="rounded-xl px-3 py-2 text-sm" style={{ ...hStyle, colorScheme: 'dark' }} onFocus={hFocus} onBlur={hBlur} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: '#555' }}>Status</label>
              <div className="flex gap-1.5">
                {VERDICTS.map(v => {
                  const active = filters.verdicts.includes(v)
                  return (
                    <button key={v}
                      onClick={() => setF('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                      className="text-xs px-2.5 py-2 rounded-xl border transition-all font-medium"
                      style={active
                        ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                        : { color: '#555', borderColor: 'rgba(255,255,255,0.07)' }}>
                      {VERDICT_LABEL[v]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: '#333' }}>No tickets match your filters.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredHistory.map((item, i) => (
                <div key={item.id} className="stagger-item" style={{ '--i': i }}>
                  <HistoryItem item={item} onClick={() => setActiveScore({ ...item.fullScore, scoreId: item.id, reviewerNote: item.notes, acknowledged: item.acknowledged, acknowledgedAt: item.acknowledgedAt })} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canScore && <SamplerSection onScore={setActiveScore} />}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
