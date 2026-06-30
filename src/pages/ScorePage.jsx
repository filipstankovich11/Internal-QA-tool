import { useMemo, useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetchJson, buildFewShotExamples } from '../lib/api'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL, VERDICTS, gradeColor } from '../lib/verdict'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import ScoringProgress from '../components/ScoringProgress'
import ScoreFormPage from './ScoreFormPage'
import DatePicker from '../components/DatePicker'
import Segmented from '../components/Segmented'
import Dropdown from '../components/Dropdown'

const HISTORY_PAGE_SIZE = 10 // history rows shown before "Show more"

const inputStyle = { background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23', outline: 'none' }
const onFocus    = e => e.target.style.borderColor = '#FF9780'
const onBlur     = e => e.target.style.borderColor = '#E1DCD7'

// Cache the Gorgias views fetch for the session — ViewPicker remounts every time
// the user toggles into View mode, so without this it re-hits /api/views each time.
let viewsCache = null
let viewsPromise = null
function loadViews() {
  if (viewsCache) return Promise.resolve(viewsCache)
  if (!viewsPromise) {
    viewsPromise = authFetchJson('/api/views').then(({ data }) => {
      if (data.error) throw new Error(data.error)
      viewsCache = data.views || []
      return viewsCache
    }).catch(e => { viewsPromise = null; throw e }) // allow retry on failure
  }
  return viewsPromise
}

// ── Scoring progress bar ──────────────────────────────────────────────────────

// ── Mode toggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, setMode }) {
  const modes = [
    { id: 'single', label: 'Single Ticket' },
    { id: 'csv',    label: 'CSV Upload'    },
    { id: 'view',   label: 'Gorgias View'  },
  ]
  return <Segmented options={modes} value={mode} onChange={setMode} segWidth={116} fontPx={14} padY={8} />
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
  const [hover,    setHover]    = useState(false)
  const [preview,  setPreview]  = useState(null)
  const [fileName, setFileName] = useState(null)
  const [err,      setErr]      = useState(null)
  const inputRef = useRef()

  const process = text => {
    try   { const ids = parseCSV(text); setPreview(ids); setErr(null); onTickets(ids) }
    catch (e) { setErr(e.message); setPreview(null); onTickets([]) }
  }
  const onFile = f => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) { setErr('Please upload a .csv file'); setPreview(null); setFileName(null); onTickets([]); return }
    setFileName(f.name)
    const r = new FileReader(); r.onload = e => process(e.target.result); r.readAsText(f)
  }
  const clear = () => { setPreview(null); setErr(null); setFileName(null); onTickets([]); if (inputRef.current) inputRef.current.value = '' }

  const loaded = preview && preview.length > 0
  const borderColor = err ? 'rgba(209,75,61,0.5)'
                    : dragging ? '#FF9780'
                    : loaded ? 'rgba(47,143,91,0.5)'
                    : hover ? '#D6CFC8'
                    : '#E1DCD7'
  const bg = dragging ? '#FFEAE6'
           : loaded ? 'rgba(47,143,91,0.06)'
           : hover ? '#FBF7F3'
           : '#FFFFFF'

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => !disabled && inputRef.current?.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
        style={{ borderColor, background: bg, transform: dragging ? 'scale(1.005)' : 'none' }}>
        {loaded ? (
          <>
            <div className="mx-auto mb-3 w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(47,143,91,0.12)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-sm font-medium truncate" style={{ color: '#1A1E23' }}>{fileName}</p>
            <p className="text-xs mt-1" style={{ color: '#2F8F5B' }}>{preview.length} ticket{preview.length !== 1 ? 's' : ''} ready</p>
            <button onClick={e => { e.stopPropagation(); clear() }}
              className="text-xs mt-3 px-3 py-1 rounded-lg transition-colors"
              style={{ color: 'rgba(26,30,35,.6)', border: '1px solid #E7E3DF' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#D14B3D'; e.currentTarget.style.borderColor = 'rgba(209,75,61,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.6)'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
              Remove
            </button>
          </>
        ) : (
          <>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="mx-auto mb-3" style={{ color: dragging || hover ? '#FF9780' : 'rgba(26,30,35,.45)', transition: 'color 150ms' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-sm font-medium" style={{ color: '#1A1E23' }}>Drop your CSV here</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(26,30,35,.5)' }}>or click to browse</p>
            <p className="text-xs mt-3" style={{ color: 'rgba(26,30,35,.5)' }}>Expected column: <code style={{ color: 'rgba(26,30,35,.72)' }}>ticket_id</code> or <code style={{ color: 'rgba(26,30,35,.72)' }}>ticket_url</code></p>
          </>
        )}
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => onFile(e.target.files[0])} />
      </div>
      {err && <p className="text-xs mt-2" style={{ color: '#D14B3D' }}>{err}</p>}
    </div>
  )
}

// ── Searchable view combobox ──────────────────────────────────────────────────

function ViewCombobox({ views, value, onChange, loading, disabled }) {
  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef  = useRef(null)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  const selected = views.find(v => String(v.id) === String(value))
  const q = query.trim().toLowerCase()
  const filtered = q ? views.filter(v => v.name?.toLowerCase().includes(q)) : views

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset + focus search when opening
  useEffect(() => { if (open) { setQuery(''); setHighlight(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  useEffect(() => { setHighlight(0) }, [query])

  // Keep the highlighted row in view
  useEffect(() => {
    if (open) listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const choose = (v) => { onChange(String(v.id)); setOpen(false) }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight]) }
    else if (e.key === 'Escape')    { setOpen(false) }
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" disabled={disabled || loading} onClick={() => setOpen(o => !o)}
        className="w-full rounded-xl px-4 py-2.5 text-sm flex items-center justify-between gap-2 text-left transition-colors"
        style={{ background: '#FFFFFF', border: `1px solid ${open ? '#FF9780' : '#E1DCD7'}`, color: selected ? '#1A1E23' : 'rgba(26,30,35,.45)', outline: 'none', opacity: disabled ? 0.5 : 1 }}>
        <span className="truncate">{loading ? 'Loading views…' : selected ? selected.name : 'Select a view…'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'rgba(26,30,35,.45)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl overflow-hidden"
          style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', animation: 'fadeIn 120ms ease' }}>
          {/* Search */}
          <div className="p-2" style={{ borderBottom: '1px solid #EEEEEE' }}>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(26,30,35,.45)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
                placeholder="Search views…"
                className="w-full rounded-lg pl-8 pr-2 py-2 text-sm outline-none"
                style={{ background: '#FFFFFF', border: '1px solid #E1DCD7', color: '#1A1E23' }} />
            </div>
          </div>
          {/* List */}
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-4 px-3" style={{ color: 'rgba(26,30,35,.5)' }}>No views match “{query}”</p>
            ) : filtered.map((v, i) => {
              const isSel = String(v.id) === String(value)
              return (
                <button key={v.id} type="button" onClick={() => choose(v)} onMouseEnter={() => setHighlight(i)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                  style={{ background: i === highlight ? '#FBF7F3' : 'transparent', color: isSel ? '#B84A2E' : '#1A1E23' }}>
                  <span style={{ width: 12, flexShrink: 0, color: '#B84A2E' }}>{isSel ? '✓' : ''}</span>
                  <span className="truncate">{v.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Batch — Gorgias view picker ───────────────────────────────────────────────

function ViewPicker({ onTickets, disabled }) {
  const [views,    setViews]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [viewId,   setViewId]   = useState('')
  const [limit,    setLimit]    = useState('30')
  const [fetching, setFetching] = useState(false)
  const [err,      setErr]      = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [btnHover, setBtnHover] = useState(false)

  useEffect(() => {
    if (viewsCache) { setViews(viewsCache); return } // instant on repeat visits
    setLoading(true)
    loadViews()
      .then(setViews)
      .catch(e => setErr(e.message || 'Could not load views'))
      .finally(() => setLoading(false))
  }, [])

  const load = async () => {
    if (!viewId) return
    setFetching(true); setErr(null)
    try {
      const { ok, data } = await authFetchJson(`/api/view-tickets?view_id=${viewId}&limit=${Math.min(100, Math.max(1, parseInt(limit) || 30))}`)
      if (!ok) throw new Error(data.error)
      setPreview(data.tickets)
      onTickets(data.tickets.map(t => String(t.id)))
    } catch (e) { setErr(e.message); onTickets([]) }
    finally { setFetching(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-xs mb-1.5 block" style={{ color: 'rgba(26,30,35,.6)' }}>Gorgias View</label>
          <ViewCombobox
            views={views}
            value={viewId}
            onChange={id => { setViewId(id); setPreview(null); onTickets([]) }}
            loading={loading}
            disabled={disabled}
          />
        </div>
        <div className="w-28 shrink-0">
          <label className="text-xs mb-1.5 block" style={{ color: 'rgba(26,30,35,.6)' }}>Limit</label>
          <div className="flex items-center rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E1DCD7' }}>
            <button type="button" aria-label="Decrease"
              onClick={() => setLimit(l => String(Math.max(1, (parseInt(l) || 30) - 5)))}
              disabled={disabled || (parseInt(limit) || 0) <= 1}
              className="stepper-btn shrink-0 w-8 py-2.5 text-base leading-none">−</button>
            <input type="number" min={1} max={100} value={limit}
              onChange={e => setLimit(e.target.value)}
              onBlur={e => setLimit(String(Math.min(100, Math.max(1, parseInt(e.target.value) || 30))))}
              onFocus={e => e.target.select()}
              disabled={disabled}
              className="no-spinner w-full text-center text-sm py-2.5 bg-transparent outline-none"
              style={{ color: '#1A1E23' }} />
            <button type="button" aria-label="Increase"
              onClick={() => setLimit(l => String(Math.min(100, (parseInt(l) || 30) + 5)))}
              disabled={disabled || (parseInt(limit) || 0) >= 100}
              className="stepper-btn shrink-0 w-8 py-2.5 text-base leading-none">+</button>
          </div>
        </div>
        {(() => {
          const hot = viewId && !fetching && !disabled && btnHover
          return (
            <button onClick={load} disabled={!viewId || fetching || disabled}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              className="g-btn-primary text-sm px-5 py-2.5 rounded-xl whitespace-nowrap shrink-0 flex items-center gap-1.5">
              {fetching
                ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Loading…</>
                : <>Load Tickets <span style={{ display: 'inline-block', transform: hot ? 'translateX(3px)' : 'none', transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1)' }}>→</span></>}
            </button>
          )
        })()}
      </div>
      {err && <p className="text-xs" style={{ color: '#D14B3D' }}>{err}</p>}
      {preview && (
        <div className="rounded-xl p-3" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
          <p className="text-xs mb-2" style={{ color: '#2F8F5B' }}>✓ {preview.length} tickets ready to run</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {preview.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono" style={{ color: '#B84A2E' }}>#{t.id}</span>
                <span className="truncate" style={{ color: 'rgba(26,30,35,.6)' }}>{t.subject || '(no subject)'}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', color: 'rgba(26,30,35,.5)' }}>{t.status}</span>
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
      style={{ background: 'rgba(209,75,61,0.06)', border: '1px solid rgba(209,75,61,0.15)' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        className="font-mono text-xs w-24 shrink-0" style={{ color: '#B84A2E' }}>#{result.ticketId}</a>
      <span className="text-xs flex-1 truncate" style={{ color: '#D14B3D' }}>{result.error}</span>
    </div>
  )
  return (
    <button onClick={() => onView(result.fullScore)}
      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#FBF7F3'; e.currentTarget.style.borderColor = '#F0ECE9' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="font-mono text-xs w-24 shrink-0" style={{ color: '#B84A2E' }}
        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
        onMouseLeave={e => e.target.style.textDecoration = 'none'}>
        #{result.ticketId}
      </a>
      <span className="text-xs flex-1 truncate" style={{ color: '#1A1E23' }}>{result.fullScore?.ticket_subject || '—'}</span>
      {result.agentName && <span className="text-xs shrink-0 hidden sm:block" style={{ color: 'rgba(26,30,35,.6)' }}>{result.agentName}</span>}
      <span className="text-xs shrink-0 tabular-nums" style={{ color: 'rgba(26,30,35,.6)' }}>{result.weightedScore?.toFixed(0)}/100</span>
      {color && <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, background: bg }}>{VERDICT_LABEL[result.verdict]}</span>}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScorePage() {
  const { scoreHistory, addScore, agents, rubric, openScore } = useApp()
  const { canScore } = useAuth()

  const [mode,        setMode]        = useState('single')
  const [method,      setMethod]      = useState('ai')  // 'ai' = AI scoring · 'manual' = grade by hand

  // Open a scored ticket in the full-page two-pane detail (same surface everywhere).
  const openPanel = openScore

  // Single mode state
  const [ticketUrl, setTicketUrl] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [filters,   setFilters]   = useState({ agent: '', verdicts: [], dateFrom: '', dateTo: '', ticketSearch: '' })
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE_SIZE) // progressive reveal

  // Batch mode state
  const [ticketIds, setTicketIds] = useState([])
  const [running,   setRunning]   = useState(false)
  const [results,   setResults]   = useState([])
  const abortRef = useRef(false)

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const hasFilters = filters.agent || filters.verdicts.length || filters.dateFrom || filters.dateTo || filters.ticketSearch
  const agentName = (id) => agents.find(a => a.id === id)?.name

  // Shared grid template for the history table header + rows (mirrors the dashboard)
  const historyGrid = '100px 1fr 120px 80px 90px 80px'

  const searchTicketId = useMemo(() => {
    const raw = (filters.ticketSearch || '').trim()
    if (!raw) return null
    const match = raw.match(/\/(?:tickets?|views\/\d+)\/(\d+)/) || raw.match(/^(\d+)$/)
    return match ? match[1] : raw
  }, [filters.ticketSearch])

  // Built once per history change, not per score call (was rebuilt inside the batch loop)
  const fewShotExamples = useMemo(() => buildFewShotExamples(scoreHistory), [scoreHistory])

  const filteredHistory = useMemo(() => scoreHistory.filter(s => {
    if (searchTicketId && String(s.ticketId) !== searchTicketId) return false
    if (filters.agent && !s.agentIds?.includes(filters.agent)) return false
    if (filters.verdicts.length && !filters.verdicts.includes(s.effectiveVerdict)) return false
    if (filters.dateFrom && s.scoredAt < new Date(filters.dateFrom).setHours(0, 0, 0, 0)) return false
    if (filters.dateTo   && s.scoredAt > new Date(filters.dateTo).setHours(23, 59, 59, 999)) return false
    return true
  }), [scoreHistory, filters, searchTicketId])

  // Reset the progressive reveal whenever the filtered result set changes
  useEffect(() => { setHistoryCount(HISTORY_PAGE_SIZE) }, [filteredHistory])

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
      const { ok, data } = await authFetchJson('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: url, rubric, few_shot_examples: fewShotExamples }) })
      if (!ok) { setError(data.error || 'Something went wrong.'); return }
      const saved = await addScore(data)
      if (saved?.error) { setError(`Scored ${data.verdict}, but it couldn't be saved to the queue: ${saved.error.message || 'database error'}. Please retry.`); return }
      openPanel(data)
      setTicketUrl('')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const runBatch = async () => {
    if (!ticketIds.length || running) return
    setRunning(true); setResults([]); abortRef.current = false
    for (const raw of ticketIds) {
      if (abortRef.current) break
      const ticketId = String(raw).replace(/.*\/ticket\//, '').trim()
      try {
        const { ok, data } = await authFetchJson('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: ticketId, rubric, few_shot_examples: fewShotExamples }) })
        if (!ok) { setResults(p => [...p, { ticketId, error: data.error || 'Failed' }]); continue }
        const saved = await addScore(data)
        if (saved?.error) { setResults(p => [...p, { ticketId, error: `Scored but not saved: ${saved.error.message || 'database error'}` }]); continue }
        const agentName = (data.agent_senders || []).map(s => s.name).filter(Boolean).join(', ') || null
        setResults(p => [...p, { ticketId: data.ticket_id, verdict: data.verdict, weightedScore: data.weighted_score, agentName, fullScore: data }])
      } catch (e) { setResults(p => [...p, { ticketId, error: e.message || 'Network error' }]) }
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
    <div className="panel-push">
    <div className="max-w-6xl mx-auto px-8 pt-8 pb-14">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-1" style={{ fontSize: 30, color: '#1A1E23', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>Score</h1>
        <p className="text-sm" style={{ color: 'rgba(26,30,35,.6)' }}>{method === 'ai' ? 'Score a single ticket, upload a CSV, or pull from a Gorgias view' : 'Grade a ticket by hand against the rubric — no AI involved.'}</p>
      </div>

      {/* Method: AI scoring vs manual grade */}
      <div className="mb-7">
        <Segmented options={[{ id: 'ai', label: 'Score with AI' }, { id: 'manual', label: 'Grade manually' }]}
          value={method} onChange={setMethod} segWidth={142} fontPx={14} padY={9} />
      </div>

      {method === 'ai' && (<>
      {/* Mode toggle */}
      <div className="mb-6">
        <ModeToggle mode={mode} setMode={switchMode} />
      </div>

      {/* ── Single mode ── */}
      {mode === 'single' && (
        <>
          {!canScore && (
            <div className="rounded-xl px-4 py-3 mb-4 text-sm text-center"
              style={{ background: '#FFEAE6', border: '1px solid #FFD2C9', color: 'rgba(26,30,35,.6)' }}>
              Your role is <strong style={{ color: '#B84A2E' }}>read-only</strong>. Contact an admin to score tickets.
            </div>
          )}

          <div className="flex gap-2 mb-3 max-w-2xl">
            <input
              type="text" value={ticketUrl}
              onChange={e => setTicketUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              disabled={loading || !canScore}
              placeholder="https://yourcompany.gorgias.com/app/ticket/…"
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-colors g-input disabled:opacity-50"
              style={{ color: '#1A1E23' }}
            />
            {(() => {
              const disabled = loading || !ticketUrl.trim() || !!urlError || !canScore
              return (
            <button onClick={analyze} disabled={disabled}
              className="g-btn-primary text-sm px-6 py-3 rounded-xl whitespace-nowrap"
              style={disabled && !loading ? { background: '#FFD2C9', color: 'rgba(26,30,35,.5)' } : undefined}>
              {loading
                ? <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>Analyzing…
                  </span>
                : 'Analyze'}
            </button>
              )
            })()}
          </div>

          {urlError && <p className="text-xs mt-2 ml-1" style={{ color: '#C8841E' }}>⚠ {urlError}</p>}
          <ScoringProgress loading={loading} />
          {error && <p className="text-xs text-center mt-2" style={{ color: '#D14B3D' }}>{error}</p>}

          {scoreHistory.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider flex items-center" style={{ color: 'rgba(26,30,35,.5)', fontWeight: 600, letterSpacing: '0.06em' }}>
                  History<ScoreInfoPopover rubric={rubric} />
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>
                    Showing {Math.min(historyCount, filteredHistory.length)} of {filteredHistory.length}
                    {hasFilters && <span style={{ color: '#B84A2E' }}> · filtered</span>}
                  </span>
                  {hasFilters && (
                    <button onClick={() => setFilters({ agent: '', verdicts: [], dateFrom: '', dateTo: '', ticketSearch: '' })}
                      className="text-xs transition-colors" style={{ color: 'rgba(26,30,35,.5)' }}
                      onMouseEnter={e => e.target.style.color = '#D14B3D'}
                      onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.5)'}>
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end"
                style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Ticket URL or ID</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: filters.ticketSearch ? '#FF9780' : 'rgba(26,30,35,.45)' }}>
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      type="text"
                      value={filters.ticketSearch}
                      onChange={e => setF('ticketSearch', e.target.value)}
                      placeholder="Paste ticket URL or ID…"
                      className="w-full rounded-xl pl-9 pr-8 py-2 text-sm outline-none transition-all"
                      style={{
                        background: '#FFFFFF',
                        border: `1px solid ${filters.ticketSearch ? 'rgba(255,151,128,0.6)' : '#E1DCD7'}`,
                        color: '#1A1E23',
                      }}
                    />
                    {filters.ticketSearch && (
                      <button onClick={() => setF('ticketSearch', '')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors"
                        style={{ color: 'rgba(26,30,35,.5)', background: '#F1ECE8' }}
                        onMouseEnter={e => { e.currentTarget.style.color='#1A1E23'; e.currentTarget.style.background='#E7E3DF' }}
                        onMouseLeave={e => { e.currentTarget.style.color='rgba(26,30,35,.5)'; e.currentTarget.style.background='#F1ECE8' }}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                  <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Agent</label>
                  <Dropdown value={filters.agent} onChange={v => setF('agent', v)} width={180} avatars
                    options={[{ value: '', label: 'All agents' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>From</label>
                  <DatePicker value={filters.dateFrom} onChange={v => setF('dateFrom', v)} width={150} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>To</label>
                  <DatePicker value={filters.dateTo} onChange={v => setF('dateTo', v)} width={150} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Status</label>
                  <div className="flex gap-1.5">
                    {VERDICTS.map(v => {
                      const active = filters.verdicts.includes(v)
                      return (
                        <button key={v}
                          onClick={() => setF('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                          className="text-xs px-2.5 py-2 rounded-xl border transition-all font-medium"
                          style={active
                            ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                            : { color: 'rgba(26,30,35,.72)', borderColor: '#E1DCD7', background: '#FFFFFF' }}>
                          {VERDICT_LABEL[v]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'rgba(26,30,35,.5)' }}>No tickets match your filters.</p>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
                  {/* Column headers — classify each section, same as the dashboard table */}
                  <div className="grid px-4 py-3" style={{
                    gridTemplateColumns: historyGrid,
                    background: '#FBF7F3',
                    borderBottom: '1px solid #F0ECE9',
                    fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'rgba(26,30,35,.5)',
                  }}>
                    <span>Ticket</span><span>Subject</span><span className="text-center">Agents</span>
                    <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
                  </div>

                  {filteredHistory.slice(0, historyCount).map(item => (
                    <div key={item.id} className="grid items-center px-4 py-3 transition-colors"
                      style={{ gridTemplateColumns: historyGrid, borderBottom: '1px solid #EEEEEE' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FBF7F3'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                      <a href={gorgiasTicketUrl(item.ticketId)} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs" style={{ color: '#B84A2E' }}
                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.target.style.textDecoration = 'none'}>
                        #{item.ticketId}
                      </a>

                      <button onClick={() => openPanel({
                        ...item.fullScore,
                        scoreId: item.id,
                        reviewerNote: item.notes,
                        acknowledged: item.acknowledged,
                        acknowledgedAt: item.acknowledgedAt,
                      })}
                        className="text-sm text-left truncate pr-3 transition-colors"
                        style={{ color: '#1A1E23' }}
                        onMouseEnter={e => e.target.style.color = '#B84A2E'}
                        onMouseLeave={e => e.target.style.color = '#1A1E23'}>
                        {item.fullScore?.ticket_subject || item.fullScore?.summary?.split('.')[0] || '—'}
                      </button>

                      <div className="flex flex-wrap gap-1 justify-center">
                        {item.agentIds?.length > 0
                          ? item.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
                              style={{ background: '#FBF7F3', border: '1px solid #F0ECE9', color: 'rgba(26,30,35,.72)' }}>{name}</span>
                          ))
                          : <span style={{ color: 'rgba(26,30,35,.45)' }}>—</span>}
                      </div>

                      <span className="text-sm tabular-nums text-right" style={{ color: gradeColor(item.effectiveScore) }}>
                        {item.effectiveScore?.toFixed(0)}/100
                        {item.overrideVerdict && <span className="text-xs ml-0.5" style={{ color: '#818cf8' }}>*</span>}
                      </span>

                      <div className="flex justify-center">
                        <span className="flex items-center gap-1.5">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[item.effectiveVerdict], flexShrink: 0, opacity: 0.8 }} />
                          <span className="text-xs font-medium" style={{ color: 'rgba(26,30,35,.72)', letterSpacing: '0.04em' }}>
                            {VERDICT_LABEL[item.effectiveVerdict] || item.effectiveVerdict}
                          </span>
                        </span>
                      </div>

                      <span className="text-xs text-right" style={{ color: 'rgba(26,30,35,.5)' }}>
                        {new Date(item.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}

                  {historyCount < filteredHistory.length && (
                    <div className="flex items-center justify-center px-4 py-3" style={{ background: '#FBF7F3' }}>
                      <button onClick={() => setHistoryCount(c => c + HISTORY_PAGE_SIZE)}
                        className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                        style={{ color: '#1A1E23', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#D6CFC8' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E7E3DF' }}>
                        Show more · {Math.min(HISTORY_PAGE_SIZE, filteredHistory.length - historyCount)} of {filteredHistory.length - historyCount} remaining
                      </button>
                    </div>
                  )}
                </div>
              )}
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
                : `▶ Score ${ticketIds.length} ticket${ticketIds.length !== 1 ? 's' : ''}`}
            </button>
            {running && (
              <button onClick={() => { abortRef.current = true }}
                className="text-sm transition-colors" style={{ color: 'rgba(26,30,35,.5)' }}
                onMouseEnter={e => e.target.style.color = '#D14B3D'}
                onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.5)'}>
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
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(26,30,35,.5)' }}>
                  <span>{batchDone} / {ticketIds.length} scored</span>
                  <span>{Math.round(ticketIds.length > 0 ? (batchDone / ticketIds.length) * 100 : 0)}%</span>
                </div>
                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: '#F1ECE8' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${ticketIds.length > 0 ? (batchDone / ticketIds.length) * 100 : 0}%`, background: '#FF9780' }} />
                </div>
                {batchAvg && (
                  <div className="flex items-center gap-4 mt-3 text-xs">
                    <span style={{ color: 'rgba(26,30,35,.5)' }}>Average: <span className="font-medium" style={{ color: '#1A1E23' }}>{batchAvg}/100</span></span>
                    <span style={{ color: '#2F8F5B' }}>{results.filter(r => r.verdict === 'PASS').length} pass</span>
                    <span style={{ color: '#C8841E' }}>{results.filter(r => r.verdict === 'NEEDS_REVIEW').length} review</span>
                    <span style={{ color: '#D14B3D' }}>{results.filter(r => r.verdict === 'FAIL').length} fail</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {results.map((r, i) => <ResultRow key={i} result={r} onView={openPanel} />)}
                {running && batchDone < ticketIds.length && (
                  <div className="flex items-center gap-2 py-2 px-3">
                    <svg className="animate-spin h-3 w-3" style={{ color: '#FF9780' }} viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    <span className="text-xs" style={{ color: 'rgba(26,30,35,.5)' }}>Scoring next ticket…</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </>)}

      {method === 'manual' && <ScoreFormPage embedded />}

      </div>
    </div>
  )
}
