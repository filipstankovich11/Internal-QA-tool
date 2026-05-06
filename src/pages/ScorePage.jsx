import { useMemo, useState, useEffect, useRef } from 'react'
import ScoreModal from '../components/ScoreModal'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetch } from '../lib/api'

const VERDICT_COLOR = { PASS: '#10b981', NEEDS_REVIEW: '#f59e0b', FAIL: '#ef4444' }
const VERDICT_BG    = { PASS: 'rgba(16,185,129,0.1)', NEEDS_REVIEW: 'rgba(245,158,11,0.1)', FAIL: 'rgba(239,68,68,0.1)' }
const VERDICT_LABEL = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
const VERDICTS      = ['PASS', 'NEEDS_REVIEW', 'FAIL']

const inputStyle = { background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.07)', color: '#ccc', outline: 'none' }
const onFocus    = e => e.target.style.borderColor = '#FF9780'
const onBlur     = e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'

// ── Mode toggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, setMode }) {
  const modes = [
    { id: 'single', label: 'Single Ticket' },
    { id: 'csv',    label: 'CSV Upload'    },
    { id: 'view',   label: 'Gorgias View'  },
  ]
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)' }}>
      {modes.map(({ id, label }) => (
        <button key={id} onClick={() => setMode(id)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={mode === id ? { background: '#1e1e1e', color: '#fff' } : { color: '#666' }}
          onMouseEnter={e => { if (mode !== id) e.currentTarget.style.color = '#ccc' }}
          onMouseLeave={e => { if (mode !== id) e.currentTarget.style.color = '#666' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Single — history list ─────────────────────────────────────────────────────

function HistoryItem({ item, onClick }) {
  const color = VERDICT_COLOR[item.effectiveVerdict]
  const bg    = VERDICT_BG[item.effectiveVerdict]
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
      style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={e => e.currentTarget.style.background = '#161616'}
      onMouseLeave={e => e.currentTarget.style.background = '#0f0f0f'}>
      <div className="flex items-center gap-3 min-w-0">
        <a href={gorgiasTicketUrl(item.ticketId)} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-xs font-mono shrink-0 transition-colors" style={{ color: '#FF9780' }}
          onMouseEnter={e => e.target.style.textDecoration = 'underline'}
          onMouseLeave={e => e.target.style.textDecoration = 'none'}>
          #{item.ticketId}
        </a>
        <span className="text-sm truncate" style={{ color: '#ccc' }}>
          {item.fullScore?.ticket_subject || item.fullScore?.summary?.split('.')[0] || '—'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <span className="text-xs tabular-nums" style={{ color: '#777' }}>{item.effectiveScore?.toFixed(0)}/100</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, background: bg }}>
          {VERDICT_LABEL[item.effectiveVerdict]}
        </span>
      </div>
    </button>
  )
}

// ── Batch — CSV upload zone ───────────────────────────────────────────────────

function parseCSV(text) {
  const lines   = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')
  const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, '').toLowerCase())
  const colIdx  = headers.findIndex(h => ['ticket_id', 'ticket_url', 'url', 'id', 'ticket'].includes(h))
  if (colIdx === -1) throw new Error('No ticket_id or ticket_url column found')
  return lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/['"]/g, '')).at(colIdx)).filter(Boolean)
}

function CSVUploadZone({ onTickets, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [preview,  setPreview]  = useState(null)
  const [err,      setErr]      = useState(null)
  const inputRef = useRef()

  const process = text => {
    try   { const ids = parseCSV(text); setPreview(ids); setErr(null); onTickets(ids) }
    catch (e) { setErr(e.message); setPreview(null); onTickets([]) }
  }
  const onFile = f => { if (!f) return; const r = new FileReader(); r.onload = e => process(e.target.result); r.readAsText(f) }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => !disabled && inputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
        style={{ borderColor: dragging ? '#FF9780' : 'rgba(255,255,255,0.07)', background: dragging ? 'rgba(255,151,128,0.04)' : 'transparent' }}>
        <p className="text-3xl mb-3">📄</p>
        <p className="text-sm font-medium text-white">Drop your CSV here</p>
        <p className="text-xs mt-1" style={{ color: '#777' }}>or click to browse</p>
        <p className="text-xs mt-3" style={{ color: '#666' }}>Expected column: <code style={{ color: '#888' }}>ticket_id</code> or <code style={{ color: '#888' }}>ticket_url</code></p>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => onFile(e.target.files[0])} />
      </div>
      {err     && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{err}</p>}
      {preview && <p className="text-xs mt-2" style={{ color: '#10b981' }}>✓ {preview.length} ticket{preview.length !== 1 ? 's' : ''} ready to run</p>}
    </div>
  )
}

// ── Batch — Gorgias view picker ───────────────────────────────────────────────

function ViewPicker({ onTickets, disabled }) {
  const [views,    setViews]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [viewId,   setViewId]   = useState('')
  const [limit,    setLimit]    = useState(30)
  const [fetching, setFetching] = useState(false)
  const [err,      setErr]      = useState(null)
  const [preview,  setPreview]  = useState(null)

  useEffect(() => {
    setLoading(true)
    authFetch('/api/views').then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setViews(d.views || []) })
      .catch(e => setErr(e.message || 'Could not load views'))
      .finally(() => setLoading(false))
  }, [])

  const load = async () => {
    if (!viewId) return
    setFetching(true); setErr(null)
    try {
      const res  = await authFetch(`/api/view-tickets?view_id=${viewId}&limit=${limit}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data.tickets)
      onTickets(data.tickets.map(t => String(t.id)))
    } catch (e) { setErr(e.message); onTickets([]) }
    finally { setFetching(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-xs mb-1.5 block" style={{ color: '#888' }}>Gorgias View</label>
          <select value={viewId} onChange={e => { setViewId(e.target.value); setPreview(null); onTickets([]) }}
            disabled={disabled || loading}
            className="w-full rounded-xl px-4 py-2.5 text-sm" style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
            <option value="">{loading ? 'Loading views…' : 'Select a view…'}</option>
            {views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs mb-1.5 block" style={{ color: '#888' }}>Limit</label>
          <input type="number" min={1} max={100} value={limit}
            onChange={e => setLimit(Math.min(100, Math.max(1, +e.target.value)))}
            disabled={disabled}
            className="w-full rounded-xl px-4 py-2.5 text-sm" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <button onClick={load} disabled={!viewId || fetching || disabled}
          className="text-sm px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          style={{ background: '#1e1e1e', color: fetching ? '#555' : '#ccc', border: '1px solid rgba(255,255,255,0.07)' }}>
          {fetching ? 'Loading…' : 'Load Tickets'}
        </button>
      </div>
      {err && <p className="text-xs" style={{ color: '#ef4444' }}>{err}</p>}
      {preview && (
        <div className="rounded-xl p-3" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-2" style={{ color: '#10b981' }}>✓ {preview.length} tickets ready to run</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {preview.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono" style={{ color: '#777' }}>#{t.id}</span>
                <span className="truncate" style={{ color: '#888' }}>{t.subject || '(no subject)'}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#666' }}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Batch — result row ────────────────────────────────────────────────────────

function ResultRow({ result, onView }) {
  const color = VERDICT_COLOR[result.verdict]
  const bg    = VERDICT_BG[result.verdict]
  if (result.error) return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
      style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        className="font-mono text-xs w-24 shrink-0" style={{ color: '#FF9780' }}>#{result.ticketId}</a>
      <span className="text-xs flex-1 truncate" style={{ color: '#ef4444' }}>{result.error}</span>
    </div>
  )
  return (
    <button onClick={() => onView(result.fullScore)}
      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#0f0f0f'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="font-mono text-xs w-24 shrink-0" style={{ color: '#FF9780' }}
        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
        onMouseLeave={e => e.target.style.textDecoration = 'none'}>
        #{result.ticketId}
      </a>
      <span className="text-xs flex-1 truncate" style={{ color: '#ccc' }}>{result.fullScore?.ticket_subject || '—'}</span>
      {result.agentName && <span className="text-xs shrink-0 hidden sm:block" style={{ color: '#777' }}>{result.agentName}</span>}
      <span className="text-xs shrink-0 tabular-nums" style={{ color: '#888' }}>{result.weightedScore?.toFixed(0)}/100</span>
      {color && <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, background: bg }}>{VERDICT_LABEL[result.verdict]}</span>}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScorePage() {
  const { scoreHistory, addScore, agents, rubric } = useApp()
  const { canScore } = useAuth()

  const [mode,        setMode]        = useState('single')
  const [activeScore, setActiveScore] = useState(null)

  // Single mode state
  const [ticketUrl, setTicketUrl] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [filters,   setFilters]   = useState({ agent: '', verdicts: [], dateFrom: '', dateTo: '' })

  // Batch mode state
  const [ticketIds, setTicketIds] = useState([])
  const [running,   setRunning]   = useState(false)
  const [results,   setResults]   = useState([])
  const abortRef = useRef(false)

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const hasFilters = filters.agent || filters.verdicts.length || filters.dateFrom || filters.dateTo

  const filteredHistory = useMemo(() => scoreHistory.filter(s => {
    if (filters.agent && !s.agentIds?.includes(filters.agent)) return false
    if (filters.verdicts.length && !filters.verdicts.includes(s.effectiveVerdict)) return false
    if (filters.dateFrom && s.scoredAt < new Date(filters.dateFrom).setHours(0, 0, 0, 0)) return false
    if (filters.dateTo   && s.scoredAt > new Date(filters.dateTo).setHours(23, 59, 59, 999)) return false
    return true
  }), [scoreHistory, filters])

  const isValidUrl = val => {
    const v = val.trim()
    return /\/tickets?\/\d+/.test(v) || /\/views\/\d+\/\d+/.test(v) || /^\d+$/.test(v)
  }
  const urlError = ticketUrl.trim() && !isValidUrl(ticketUrl) ? 'Paste a Gorgias ticket URL or ticket ID' : null

  const analyze = async () => {
    const url = ticketUrl.trim()
    if (!url || loading || urlError) return
    setLoading(true); setError(null)
    try {
      const res  = await authFetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: url, rubric }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return }
      addScore(data)
      setActiveScore(data)
      setTicketUrl('')
    } catch { setError('Could not reach the server.') }
    finally { setLoading(false) }
  }

  const runBatch = async () => {
    if (!ticketIds.length || running) return
    setRunning(true); setResults([]); abortRef.current = false
    for (const raw of ticketIds) {
      if (abortRef.current) break
      const ticketId = String(raw).replace(/.*\/ticket\//, '').trim()
      try {
        const res  = await authFetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: ticketId, rubric }) })
        const data = await res.json()
        if (!res.ok) { setResults(p => [...p, { ticketId, error: data.error || 'Failed' }]); continue }
        addScore(data)
        const agentName = (data.agent_senders || []).map(s => s.name).filter(Boolean).join(', ') || null
        setResults(p => [...p, { ticketId: data.ticket_id, verdict: data.verdict, weightedScore: data.weighted_score, agentName, fullScore: data }])
      } catch { setResults(p => [...p, { ticketId, error: 'Network error' }]) }
    }
    setRunning(false)
  }

  const switchMode = m => { setMode(m); setTicketIds([]); setResults([]) }

  const batchDone    = results.length
  const batchSuccess = results.filter(r => !r.error)
  const batchAvg     = batchSuccess.length
    ? (batchSuccess.reduce((s, r) => s + (r.weightedScore || 0), 0) / batchSuccess.length).toFixed(1)
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Score</h1>
        <p className="text-sm" style={{ color: '#888' }}>Score a single ticket, upload a CSV, or pull from a Gorgias view</p>
      </div>

      {/* Mode toggle */}
      <div className="mb-6">
        <ModeToggle mode={mode} setMode={switchMode} />
      </div>

      {/* ── Single mode ── */}
      {mode === 'single' && (
        <>
          {!canScore && (
            <div className="rounded-xl px-4 py-3 mb-4 text-sm text-center"
              style={{ background: 'rgba(255,151,128,0.06)', border: '1px solid rgba(255,151,128,0.15)', color: '#888' }}>
              Your role is <strong style={{ color: '#FF9780' }}>read-only</strong>. Contact an admin to score tickets.
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="text" value={ticketUrl}
              onChange={e => setTicketUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              disabled={loading || !canScore}
              placeholder="https://yourcompany.gorgias.com/app/ticket/…"
              className="flex-1 rounded-xl px-4 py-3 text-sm text-white outline-none transition-colors g-input disabled:opacity-50"
            />
            <button onClick={analyze} disabled={loading || !ticketUrl.trim() || !!urlError || !canScore}
              className="g-btn-primary text-sm px-6 py-3 rounded-xl whitespace-nowrap disabled:opacity-40">
              {loading
                ? <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>Analyzing…
                  </span>
                : 'Analyze'}
            </button>
          </div>

          {urlError && <p className="text-xs mt-2 ml-1" style={{ color: '#f59e0b' }}>⚠ {urlError}</p>}
          {loading   && <p className="text-xs text-center mt-2" style={{ color: '#777' }}>Claude is scoring this ticket — usually 15–30 seconds</p>}
          {error     && <p className="text-xs text-center mt-2" style={{ color: '#ef4444' }}>{error}</p>}

          {scoreHistory.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider" style={{ color: '#666' }}>
                  History {hasFilters && <span style={{ color: '#FF9780' }}>· {filteredHistory.length} match</span>}
                </p>
                {hasFilters && (
                  <button onClick={() => setFilters({ agent: '', verdicts: [], dateFrom: '', dateTo: '' })}
                    className="text-xs transition-colors" style={{ color: '#777' }}
                    onMouseEnter={e => e.target.style.color = '#ef4444'}
                    onMouseLeave={e => e.target.style.color = '#555'}>
                    Clear filters
                  </button>
                )}
              </div>

              <div className="rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                  <label className="text-xs" style={{ color: '#777' }}>Agent</label>
                  <select value={filters.agent} onChange={e => setF('agent', e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm" style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">All agents</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs" style={{ color: '#777' }}>From</label>
                  <input type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm" style={{ ...inputStyle, colorScheme: 'dark' }} onFocus={onFocus} onBlur={onBlur} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs" style={{ color: '#777' }}>To</label>
                  <input type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm" style={{ ...inputStyle, colorScheme: 'dark' }} onFocus={onFocus} onBlur={onBlur} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs" style={{ color: '#777' }}>Status</label>
                  <div className="flex gap-1.5">
                    {VERDICTS.map(v => {
                      const active = filters.verdicts.includes(v)
                      return (
                        <button key={v}
                          onClick={() => setF('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                          className="text-xs px-2.5 py-2 rounded-xl border transition-all font-medium"
                          style={active
                            ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                            : { color: '#777', borderColor: 'rgba(255,255,255,0.07)' }}>
                          {VERDICT_LABEL[v]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {filteredHistory.length === 0
                ? <p className="text-xs text-center py-8" style={{ color: '#555' }}>No tickets match your filters.</p>
                : <div className="flex flex-col gap-2">
                    {filteredHistory.map((item, i) => (
                      <div key={item.id} className="stagger-item" style={{ '--i': i }}>
                        <HistoryItem item={item} onClick={() => setActiveScore({
                          ...item.fullScore,
                          scoreId: item.id,
                          reviewerNote: item.notes,
                          acknowledged: item.acknowledged,
                          acknowledgedAt: item.acknowledgedAt,
                        })} />
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

        </>
      )}

      {/* ── Batch modes ── */}
      {(mode === 'csv' || mode === 'view') && (
        <>
          <div className="mb-6">
            {mode === 'csv'
              ? <CSVUploadZone onTickets={setTicketIds} disabled={running} />
              : <ViewPicker    onTickets={setTicketIds} disabled={running} />}
          </div>

          <div className="flex items-center gap-3 mb-8">
            <button onClick={runBatch} disabled={!ticketIds.length || running}
              className="g-btn-primary text-sm px-6 py-3 rounded-xl flex items-center gap-2"
              style={{ opacity: !ticketIds.length || running ? 0.5 : 1 }}>
              {running
                ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>Scoring…</>
                : `▶ Run Batch (${ticketIds.length} ticket${ticketIds.length !== 1 ? 's' : ''})`}
            </button>
            {running && (
              <button onClick={() => { abortRef.current = true }}
                className="text-sm transition-colors" style={{ color: '#666' }}
                onMouseEnter={e => e.target.style.color = '#ef4444'}
                onMouseLeave={e => e.target.style.color = '#555'}>
                Stop
              </button>
            )}
            {!running && results.length > 0 && (
              <button onClick={() => setResults([])} className="text-sm g-btn-ghost">Clear</button>
            )}
          </div>

          {(running || results.length > 0) && (
            <div>
              <div className="mb-5">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: '#888' }}>
                  <span>{batchDone} / {ticketIds.length} scored</span>
                  <span>{Math.round(ticketIds.length > 0 ? (batchDone / ticketIds.length) * 100 : 0)}%</span>
                </div>
                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: '#1a1a1a' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${ticketIds.length > 0 ? (batchDone / ticketIds.length) * 100 : 0}%`, background: '#FF9780' }} />
                </div>
                {batchAvg && (
                  <div className="flex items-center gap-4 mt-3 text-xs">
                    <span style={{ color: '#888' }}>Average: <span className="text-white font-medium">{batchAvg}/100</span></span>
                    <span style={{ color: '#10b981' }}>{results.filter(r => r.verdict === 'PASS').length} pass</span>
                    <span style={{ color: '#f59e0b' }}>{results.filter(r => r.verdict === 'NEEDS_REVIEW').length} review</span>
                    <span style={{ color: '#ef4444' }}>{results.filter(r => r.verdict === 'FAIL').length} fail</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {results.map((r, i) => <ResultRow key={i} result={r} onView={setActiveScore} />)}
                {running && batchDone < ticketIds.length && (
                  <div className="flex items-center gap-2 py-2 px-3">
                    <svg className="animate-spin h-3 w-3" style={{ color: '#333' }} viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    <span className="text-xs" style={{ color: '#555' }}>Scoring next ticket…</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
