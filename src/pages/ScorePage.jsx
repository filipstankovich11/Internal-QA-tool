import { useMemo, useState, useEffect, useRef, useId } from 'react'
import { ArrowRight, Check, CheckCircle2, LoaderCircle, Minus, Play, Plus, Search, TriangleAlert, Upload, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetchJson, buildFewShotExamples } from '../lib/api'
import { useToast } from '../components/Toast'
import { VERDICT_COLOR, VERDICT_BG, VERDICT_LABEL, VERDICTS, gradeColor } from '../lib/verdict'
import { ScoreInfoPopover } from '../components/ScoreInfo'
import ScoringProgress from '../components/ScoringProgress'
import DatePicker from '../components/DatePicker'
import Segmented from '../components/Segmented'
import Dropdown from '../components/Dropdown'
import { parseScoreCSV } from '../lib/scoreCsv'
import './ScorePage.css'

const HISTORY_PAGE_SIZE = 10 // history rows shown before "Show more"

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
  return <Segmented options={modes} value={mode} onChange={setMode} fontPx={14} padY={10} fluid ariaLabel="Scoring method" />
}

// ── Batch — CSV upload zone ───────────────────────────────────────────────────

function CSVUploadZone({ onTickets, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [hover,    setHover]    = useState(false)
  const [preview,  setPreview]  = useState(null)
  const [fileName, setFileName] = useState(null)
  const [err,      setErr]      = useState(null)
  const inputRef = useRef()

  const process = text => {
    try   { const ids = parseScoreCSV(text); setPreview(ids); setErr(null); onTickets(ids) }
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
        onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) onFile(e.dataTransfer.files[0]) }}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={e => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={loaded ? `Replace ${fileName} CSV file` : 'Choose a CSV file to upload'}
        className="score-csv-zone border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
        style={{ borderColor, background: bg, transform: dragging ? 'scale(1.005)' : 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .65 : 1 }}>
        {loaded ? (
          <>
            <div className="mx-auto mb-3 w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(47,143,91,0.12)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{fileName}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>{preview.length} ticket{preview.length !== 1 ? 's' : ''} ready</p>
          </>
        ) : (
          <>
            <Upload aria-hidden="true" size={34} strokeWidth={1.5} className="mx-auto mb-3"
              style={{ color: dragging || hover ? 'var(--coral)' : 'var(--ink-72)', transition: 'color 150ms' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Drop your CSV here</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-72)' }}>or click to browse</p>
            <p className="text-xs mt-3" style={{ color: 'var(--ink-72)' }}>Expected column: <code>ticket_id</code> or <code>ticket_url</code></p>
          </>
        )}
        <input ref={inputRef} type="file" accept=".csv" className="hidden" disabled={disabled} onChange={e => onFile(e.target.files[0])} />
      </div>
      {loaded && (
        <button type="button" onClick={clear} disabled={disabled}
          className="text-xs mt-3 px-3 py-2 min-h-11 rounded-lg transition-colors"
          style={{ color: 'var(--ink-72)', border: '1px solid var(--btn-border)' }}>
          Remove CSV
        </button>
      )}
      {err && <p role="alert" className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{err}</p>}
    </div>
  )
}

// ── Searchable view combobox ──────────────────────────────────────────────────

function ViewCombobox({ views, value, onChange, loading, disabled }) {
  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef  = useRef(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef  = useRef(null)
  const listboxId = useId()

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

  const closeAndRestoreFocus = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const choose = (v) => {
    onChange(String(v.id))
    closeAndRestoreFocus()
  }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight]) }
    else if (e.key === 'Escape')    { e.preventDefault(); closeAndRestoreFocus() }
  }

  return (
    <div ref={rootRef} className="relative">
      <button ref={triggerRef} type="button" disabled={disabled || loading} onClick={() => setOpen(o => !o)}
        onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) } }}
        aria-label="Choose a Gorgias view" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined}
        className="w-full min-h-11 rounded-xl px-4 py-2.5 text-sm flex items-center justify-between gap-2 text-left transition-colors"
        style={{ background: 'var(--white)', border: `1px solid ${open ? 'var(--coral)' : 'var(--input-border)'}`, color: selected ? 'var(--ink)' : 'var(--ink-72)', outline: 'none', opacity: disabled ? 0.5 : 1 }}>
        <span className="truncate">{loading ? 'Loading views…' : selected ? selected.name : 'Select a view…'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--ink-72)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl overflow-hidden"
          style={{ background: 'var(--white)', border: '1px solid var(--input-border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', animation: 'fadeIn 120ms ease' }}>
          {/* Search */}
          <div className="p-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <div className="relative">
              <Search aria-hidden="true" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-72)' }} />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
                role="combobox" aria-label="Search Gorgias views" aria-autocomplete="list" aria-expanded="true"
                aria-controls={listboxId} aria-activedescendant={filtered[highlight] ? `${listboxId}-option-${filtered[highlight].id}` : undefined}
                placeholder="Search views…" className="g-input w-full min-h-11 rounded-lg pl-8 pr-2 py-2 text-sm outline-none" />
            </div>
          </div>
          {/* List */}
          <div ref={listRef} id={listboxId} role="listbox" aria-label="Gorgias views" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-4 px-3" style={{ color: 'var(--ink-72)' }}>No views match “{query}”</p>
            ) : filtered.map((v, i) => {
              const isSel = String(v.id) === String(value)
              return (
                <button key={v.id} id={`${listboxId}-option-${v.id}`} type="button" role="option" aria-selected={isSel}
                  onClick={() => choose(v)} onMouseEnter={() => setHighlight(i)}
                  className="w-full min-h-11 text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                  style={{ background: i === highlight ? 'var(--warm-surface)' : 'transparent', color: isSel ? 'var(--coral-text)' : 'var(--ink)' }}>
                  <span className="flex items-center" style={{ width: 14, flexShrink: 0, color: 'var(--coral-text)' }}>{isSel && <Check aria-hidden="true" size={14} />}</span>
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
      <div className="score-view-grid flex items-end gap-3">
        <div className="score-view-select flex-1 min-w-0">
          <span className="text-xs mb-1.5 block" style={{ color: 'var(--ink-72)' }}>Gorgias View</span>
          <ViewCombobox
            views={views}
            value={viewId}
            onChange={id => { setViewId(id); setPreview(null); onTickets([]) }}
            loading={loading}
            disabled={disabled}
          />
        </div>
        <div className="score-view-limit w-28 shrink-0">
          <label htmlFor="score-view-limit" className="text-xs mb-1.5 block" style={{ color: 'var(--ink-72)' }}>Ticket limit</label>
          <div className="flex items-center min-h-11 rounded-xl overflow-hidden" style={{ background: 'var(--white)', border: '1px solid var(--input-border)' }}>
            <button type="button" aria-label="Decrease ticket limit"
              onClick={() => setLimit(l => String(Math.max(1, (parseInt(l) || 30) - 5)))}
              disabled={disabled || (parseInt(limit) || 0) <= 1}
              className="stepper-btn shrink-0 w-11 h-11 flex items-center justify-center"><Minus aria-hidden="true" size={16} /></button>
            <input id="score-view-limit" type="number" min={1} max={100} value={limit}
              onChange={e => setLimit(e.target.value)}
              onBlur={e => setLimit(String(Math.min(100, Math.max(1, parseInt(e.target.value) || 30))))}
              onFocus={e => e.target.select()}
              disabled={disabled}
              className="no-spinner w-full h-11 text-center text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)' }} />
            <button type="button" aria-label="Increase ticket limit"
              onClick={() => setLimit(l => String(Math.min(100, (parseInt(l) || 30) + 5)))}
              disabled={disabled || (parseInt(limit) || 0) >= 100}
              className="stepper-btn shrink-0 w-11 h-11 flex items-center justify-center"><Plus aria-hidden="true" size={16} /></button>
          </div>
        </div>
        {(() => {
          const hot = viewId && !fetching && !disabled && btnHover
          return (
            <button onClick={load} disabled={!viewId || fetching || disabled}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              className="score-load-button g-btn-primary min-h-11 text-sm px-5 py-2.5 rounded-xl whitespace-nowrap shrink-0 flex items-center gap-1.5">
              {fetching
                ? <><LoaderCircle aria-hidden="true" size={15} className="animate-spin" />Loading…</>
                : <>Load Tickets <ArrowRight aria-hidden="true" size={15} style={{ transform: hot ? 'translateX(3px)' : 'none', transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1)' }} /></>}
            </button>
          )
        })()}
      </div>
      {err && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
      {preview && (
        <div className="rounded-xl p-3" style={{ background: 'var(--warm-surface)', border: '1px solid var(--hairline-2)' }}>
          <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--success)' }}><CheckCircle2 aria-hidden="true" size={14} />{preview.length} tickets ready to run</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {preview.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono" style={{ color: 'var(--coral-text)' }}>#{t.id}</span>
                <span className="truncate" style={{ color: 'var(--ink-72)' }}>{t.subject || '(no subject)'}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded" style={{ background: 'var(--white)', border: '1px solid var(--hairline)', color: 'var(--ink-72)' }}>{t.status}</span>
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
    <div className="score-result-row flex items-center gap-3 py-2.5 px-3 rounded-xl stagger-item"
      style={{ background: 'rgba(209,75,61,0.06)', border: '1px solid rgba(209,75,61,0.15)' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        className="font-mono text-xs w-24 shrink-0" style={{ color: 'var(--coral-text)' }}>#{result.ticketId}</a>
      <span className="text-xs flex-1 truncate" style={{ color: 'var(--danger)' }}>{result.error}</span>
    </div>
  )
  return (
    <div className="score-result-row w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all stagger-item"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#FBF7F3'; e.currentTarget.style.borderColor = '#F0ECE9' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        className="font-mono text-xs w-24 shrink-0" style={{ color: 'var(--coral-text)' }}
        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
        onMouseLeave={e => e.target.style.textDecoration = 'none'}>
        #{result.ticketId}
      </a>
      <button type="button" onClick={() => onView(result.fullScore)}
        className="min-w-0 flex-1 flex items-center gap-3 text-left rounded-lg">
        <span className="text-xs flex-1 truncate" style={{ color: 'var(--ink)' }}>{result.fullScore?.ticket_subject || '—'}</span>
        {result.agentName && <span className="text-xs shrink-0 hidden sm:block" style={{ color: 'var(--ink-72)' }}>{result.agentName}</span>}
        <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--ink-72)' }}>{Number(result.weightedScore ?? 0).toFixed(0)}/100</span>
        {color && <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, background: bg }}>{VERDICT_LABEL[result.verdict]}</span>}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScorePage() {
  const { scoreHistory, addScore, agents, rubric, openScore, notifyUsers } = useApp()
  const { canScore, user } = useAuth()
  const toast = useToast()

  const [mode,        setMode]        = useState('single')

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
      setTicketUrl('')
      // Announce completion with a clickable toast rather than yanking the reviewer
      // into the scorecard — they may have moved on while Claude was grading.
      const verdictWord = { PASS: 'Pass', NEEDS_REVIEW: 'Needs review', FAIL: 'Fail' }[data.verdict] || 'Done'
      toast.action(`AI review complete · #${data.ticket_id} — ${verdictWord}`, {
        label: 'View scorecard',
        onClick: () => openPanel(data),
      })
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const runBatch = async () => {
    if (!ticketIds.length || running) return
    setRunning(true); setResults([]); abortRef.current = false
    let okCount = 0, failCount = 0
    for (const raw of ticketIds) {
      if (abortRef.current) break
      const ticketId = String(raw).replace(/.*\/ticket\//, '').trim()
      try {
        const { ok, data } = await authFetchJson('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket_url: ticketId, rubric, few_shot_examples: fewShotExamples }) })
        if (!ok) { failCount++; setResults(p => [...p, { ticketId, error: data.error || 'Failed' }]); continue }
        const saved = await addScore(data)
        if (saved?.error) { failCount++; setResults(p => [...p, { ticketId, error: `Scored but not saved: ${saved.error.message || 'database error'}` }]); continue }
        const agentName = (data.agent_senders || []).map(s => s.name).filter(Boolean).join(', ') || null
        okCount++
        setResults(p => [...p, { ticketId: data.ticket_id, verdict: data.verdict, weightedScore: Number(data.weighted_score) || 0, agentName, fullScore: data }])
      } catch (e) { failCount++; setResults(p => [...p, { ticketId, error: e.message || 'Network error' }]) }
    }
    setRunning(false)
    if (user?.id && (okCount || failCount)) {
      notifyUsers([user.id], 'batch_complete',
        `Batch finished — ${okCount} scored${failCount ? `, ${failCount} failed` : ''} of ${ticketIds.length} ticket${ticketIds.length !== 1 ? 's' : ''}`)
    }
  }

  const switchMode = m => { setMode(m); setTicketIds([]); setResults([]) }

  const batchDone    = results.length
  const batchSuccess = results.filter(r => !r.error)
  const batchAvg     = batchSuccess.length
    ? (batchSuccess.reduce((s, r) => s + (r.weightedScore || 0), 0) / batchSuccess.length).toFixed(1)
    : null

  return (
    <div className="panel-push">
    <div className="score-page-content max-w-6xl mx-auto px-8 pt-8 pb-14">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-1" style={{ fontSize: 30, color: 'var(--ink)', fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>Score</h1>
        <p className="text-sm" style={{ color: 'var(--ink-72)' }}>Score a single ticket, upload a CSV, or pull from a Gorgias view</p>
      </div>

      {/* Mode toggle */}
      <div className="score-mode-toggle mb-6">
        <ModeToggle mode={mode} setMode={switchMode} />
      </div>

      {/* ── Single mode ── */}
      {mode === 'single' && (
        <>
          {!canScore && (
            <div className="rounded-xl px-4 py-3 mb-4 text-sm text-center"
              style={{ background: 'var(--coral-tint)', border: '1px solid #FFD2C9', color: 'var(--ink-72)' }}>
              Your role is <strong style={{ color: 'var(--coral-text)' }}>read-only</strong>. Contact an admin to score tickets.
            </div>
          )}

          <div className="score-single-form flex gap-2 mb-3 max-w-2xl">
            <label htmlFor="score-ticket-url" className="sr-only">Gorgias ticket URL or ID</label>
            <input
              id="score-ticket-url" type="text" value={ticketUrl}
              onChange={e => setTicketUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              disabled={loading || !canScore}
              aria-invalid={Boolean(urlError)}
              aria-describedby={urlError ? 'score-ticket-url-error' : undefined}
              placeholder="https://yourcompany.gorgias.com/app/ticket/…"
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-colors g-input disabled:opacity-50"
              style={{ color: 'var(--ink)' }}
            />
            {(() => {
              const disabled = loading || !ticketUrl.trim() || !!urlError || !canScore
              return (
            <button onClick={analyze} disabled={disabled}
              className="g-btn-primary text-sm px-6 py-3 rounded-xl whitespace-nowrap"
              style={disabled && !loading ? { background: '#FFD2C9', color: 'var(--ink-50)' } : undefined}>
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

          {urlError && <p id="score-ticket-url-error" role="alert" className="text-xs mt-2 ml-1 flex items-center gap-1.5" style={{ color: 'var(--amber)' }}><TriangleAlert aria-hidden="true" size={14} />{urlError}</p>}
          <ScoringProgress loading={loading} />
          {error && <p role="alert" className="text-xs text-center mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}

          {scoreHistory.length > 0 && (
            <div className="mt-10">
              <div className="score-history-heading flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wider flex items-center" style={{ color: 'var(--ink-72)', fontWeight: 600, letterSpacing: '0.06em' }}>
                  History<ScoreInfoPopover rubric={rubric} />
                </div>
                <div className="score-history-meta flex items-center gap-3">
                  <span className="text-xs" style={{ color: 'var(--ink-72)' }}>
                    Showing {Math.min(historyCount, filteredHistory.length)} of {filteredHistory.length}
                    {hasFilters && <span style={{ color: 'var(--coral-text)' }}> · filtered</span>}
                  </span>
                  {hasFilters && (
                    <button onClick={() => setFilters({ agent: '', verdicts: [], dateFrom: '', dateTo: '', ticketSearch: '' })}
                      className="text-xs min-h-11 px-2 rounded-lg transition-colors" style={{ color: 'var(--ink-72)' }}
                      onMouseEnter={e => e.target.style.color = '#D14B3D'}
                      onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.72)'}>
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              <div className="score-filter-bar rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end"
                style={{ background: 'var(--white)', border: '1px solid var(--hairline)', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
                <div className="flex flex-col gap-1.5 w-full">
                  <label htmlFor="history-ticket-search" className="text-xs" style={{ color: 'var(--ink-72)' }}>Ticket URL or ID</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: filters.ticketSearch ? 'var(--coral)' : 'var(--ink-72)' }}>
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      id="history-ticket-search"
                      type="text"
                      value={filters.ticketSearch}
                      onChange={e => setF('ticketSearch', e.target.value)}
                      placeholder="Paste ticket URL or ID…"
                      className="w-full rounded-xl pl-9 pr-12 py-2 min-h-11 text-sm outline-none transition-all"
                      style={{
                        background: 'var(--white)',
                        border: `1px solid ${filters.ticketSearch ? 'rgba(255,151,128,0.6)' : 'var(--input-border)'}`,
                        color: 'var(--ink)',
                      }}
                    />
                    {filters.ticketSearch && (
                      <button onClick={() => setF('ticketSearch', '')}
                        type="button" aria-label="Clear ticket search"
                        className="absolute right-0 top-0 w-11 h-11 rounded-xl flex items-center justify-center text-base transition-colors"
                        style={{ color: 'var(--ink-72)', background: 'var(--segmented)' }}
                        onMouseEnter={e => { e.currentTarget.style.color='#1A1E23'; e.currentTarget.style.background='#E7E3DF' }}
                        onMouseLeave={e => { e.currentTarget.style.color='rgba(26,30,35,.72)'; e.currentTarget.style.background='#F1ECE8' }}>
                        <X aria-hidden="true" size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="score-agent-filter flex flex-col gap-1.5 flex-1 min-w-[140px]">
                  <span className="text-xs" style={{ color: 'var(--ink-72)' }}>Agent</span>
                  <Dropdown value={filters.agent} onChange={v => setF('agent', v)} width="100%" height={44} ariaLabel="Filter by agent" avatars
                    options={[{ value: '', label: 'All agents' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} />
                </div>
                <div className="score-date-filter flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--ink-72)' }}>From</span>
                  <DatePicker value={filters.dateFrom} onChange={v => setF('dateFrom', v)} width="100%" height={44} ariaLabel="Filter from date" />
                </div>
                <div className="score-date-filter flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--ink-72)' }}>To</span>
                  <DatePicker value={filters.dateTo} onChange={v => setF('dateTo', v)} width="100%" height={44} ariaLabel="Filter to date" />
                </div>
                <div className="score-status-filter flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--ink-72)' }}>Status</span>
                  <div className="score-status-options flex gap-1.5">
                    {VERDICTS.map(v => {
                      const active = filters.verdicts.includes(v)
                      return (
                        <button key={v}
                          onClick={() => setF('verdicts', active ? filters.verdicts.filter(x => x !== v) : [...filters.verdicts, v])}
                          aria-pressed={active}
                          className="text-xs min-h-11 px-2.5 py-2 rounded-xl border transition-all font-medium inline-flex items-center justify-center gap-1.5"
                          style={active
                            ? { color: VERDICT_COLOR[v], background: VERDICT_BG[v], borderColor: VERDICT_COLOR[v] + '66' }
                            : { color: 'var(--ink-72)', borderColor: 'var(--input-border)', background: 'var(--white)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[v], flexShrink: 0, opacity: active ? 1 : 0.5 }} />
                          {VERDICT_LABEL[v]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'var(--warm-surface)', border: '1px solid var(--hairline-2)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-72)' }}>
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ink-72)' }}>No tickets match your filters.</p>
                  <p className="text-xs" style={{ color: 'var(--ink-72)' }}>Try adjusting or clearing the filters above.</p>
                </div>
              ) : (
                <div className="score-history-list rounded-2xl overflow-x-auto" style={{ background: 'var(--white)', border: '1px solid var(--hairline)', boxShadow: '0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04)' }}>
                  {/* Column headers — classify each section, same as the dashboard table */}
                  <div className="score-history-header grid px-4 py-3" style={{
                    gridTemplateColumns: historyGrid, minWidth: 620,
                    background: 'var(--warm-surface)',
                    borderBottom: '1px solid var(--hairline-2)',
                    fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--ink-72)',
                  }}>
                    <span>Ticket</span><span>Subject</span><span className="text-center">Agents</span>
                    <span className="text-right">Score</span><span className="text-center">Status</span><span className="text-right">Date</span>
                  </div>

                  {filteredHistory.slice(0, historyCount).map((item, i) => (
                    <div key={item.id} className="score-history-row grid items-center px-4 py-3 stagger-item"
                      style={{ gridTemplateColumns: historyGrid, minWidth: 620, borderBottom: '1px solid var(--hairline)', '--i': i % HISTORY_PAGE_SIZE, transition: 'background-color .15s ease' }}>

                      <a href={gorgiasTicketUrl(item.ticketId)} target="_blank" rel="noopener noreferrer"
                        className="score-history-ticket font-mono text-xs min-h-11 inline-flex items-center" style={{ color: 'var(--coral-text)' }}
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
                        className="score-history-subject text-sm text-left truncate pr-3 min-h-11 rounded-lg transition-colors"
                        style={{ color: 'var(--ink)' }}
                        onMouseEnter={e => e.target.style.color = '#B84A2E'}
                        onMouseLeave={e => e.target.style.color = '#1A1E23'}>
                        {item.fullScore?.ticket_subject || item.fullScore?.summary?.split('.')[0] || '—'}
                      </button>

                      <div className="score-history-agents flex flex-wrap gap-1 justify-center">
                        {item.agentIds?.length > 0
                          ? item.agentIds.map(id => agentName(id)).filter(Boolean).map((name, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
                              style={{ background: 'var(--warm-surface)', border: '1px solid var(--hairline-2)', color: 'var(--ink-72)' }}>{name}</span>
                          ))
                          : <span style={{ color: 'var(--ink-72)' }}>—</span>}
                      </div>

                      <span className="score-history-score text-sm tabular-nums text-right" style={{ color: gradeColor(item.effectiveScore) }}>
                        {item.effectiveScore?.toFixed(0)}/100
                        {item.overrideVerdict && <span className="text-xs ml-0.5" style={{ color: '#818cf8' }}>*</span>}
                      </span>

                      <div className="score-history-status flex justify-center">
                        <span className="flex items-center gap-1.5">
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: VERDICT_COLOR[item.effectiveVerdict], flexShrink: 0, opacity: 0.8 }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ink-72)', letterSpacing: '0.04em' }}>
                            {VERDICT_LABEL[item.effectiveVerdict] || item.effectiveVerdict}
                          </span>
                        </span>
                      </div>

                      <span className="score-history-date text-xs text-right" style={{ color: 'var(--ink-72)' }}>
                        {new Date(item.scoredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}

                  {historyCount < filteredHistory.length && (
                    <div className="score-history-more flex items-center justify-center px-4 py-3" style={{ background: 'var(--warm-surface)', minWidth: 620 }}>
                      <button onClick={() => setHistoryCount(c => c + HISTORY_PAGE_SIZE)}
                        className="text-xs min-h-11 px-4 py-2 rounded-lg transition-colors"
                        style={{ color: 'var(--ink)', background: 'var(--white)', border: '1px solid var(--btn-border)' }}
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

          {ticketIds.length > 0 && <div className="score-batch-actions flex items-center gap-3 mb-8">
            <button onClick={runBatch} disabled={!ticketIds.length || running}
              className="g-btn-primary min-h-11 text-sm px-6 py-3 rounded-xl flex items-center justify-center gap-2"
              style={{ opacity: !ticketIds.length || running ? 0.5 : 1 }}>
              {running
                ? <><LoaderCircle aria-hidden="true" size={16} className="animate-spin" />Scoring…</>
                : <><Play aria-hidden="true" size={15} fill="currentColor" />Score {ticketIds.length} ticket{ticketIds.length !== 1 ? 's' : ''}</>}
            </button>
            {running && (
              <button onClick={() => { abortRef.current = true }}
                className="text-sm min-h-11 px-3 rounded-lg transition-colors" style={{ color: 'var(--ink-72)' }}
                onMouseEnter={e => e.target.style.color = '#D14B3D'}
                onMouseLeave={e => e.target.style.color = 'rgba(26,30,35,.72)'}>
                Stop
              </button>
            )}
            {!running && results.length > 0 && (
              <button onClick={() => setResults([])} className="text-sm min-h-11 px-3 rounded-lg g-btn-ghost">Clear</button>
            )}
          </div>}

          {(running || results.length > 0) && (
            <div>
              <div className="mb-5">
                <div aria-live="polite" className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--ink-72)' }}>
                  <span>{batchDone} / {ticketIds.length} scored</span>
                  <span>{Math.round(ticketIds.length > 0 ? (batchDone / ticketIds.length) * 100 : 0)}%</span>
                </div>
                <div role="progressbar" aria-label="Batch scoring progress" aria-valuemin={0} aria-valuemax={ticketIds.length}
                  aria-valuenow={batchDone} aria-valuetext={`${batchDone} of ${ticketIds.length} tickets scored`}
                  className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--segmented)' }}>
                  <div className="h-full rounded-full transition-all duration-300 relative overflow-hidden"
                    style={{ width: `${ticketIds.length > 0 ? (batchDone / ticketIds.length) * 100 : 0}%`, background: 'var(--coral)' }}>
                    {running && <span className="progress-shimmer" />}
                  </div>
                </div>
                {batchAvg !== null && (
                  <div className="score-batch-summary flex items-center gap-4 mt-3 text-xs">
                    <span style={{ color: 'var(--ink-72)' }}>Average: <span className="font-medium" style={{ color: 'var(--ink)' }}>{batchAvg}/100</span></span>
                    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                      {results.filter(r => r.verdict === 'PASS').length} pass
                    </span>
                    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--amber)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                      {results.filter(r => r.verdict === 'NEEDS_REVIEW').length} review
                    </span>
                    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                      {results.filter(r => r.verdict === 'FAIL').length} fail
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {results.map((r, i) => <ResultRow key={i} result={r} onView={openPanel} />)}
                {running && batchDone < ticketIds.length && (
                  <div className="flex items-center gap-2 py-2 px-3">
                    <LoaderCircle aria-hidden="true" size={13} className="animate-spin" style={{ color: 'var(--coral)' }} />
                    <span className="text-xs" style={{ color: 'var(--ink-72)' }}>Scoring next ticket…</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      </div>
    </div>
  )
}
