import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import ScoreModal from '../components/ScoreModal'
import { gorgiasTicketUrl } from '../lib/gorgias'
import { authFetch } from '../lib/api'

const VERDICT_STYLE = {
  PASS:         { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: 'PASS'   },
  NEEDS_REVIEW: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'REVIEW' },
  FAIL:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'FAIL'   },
}

function parseCSV(text) {
  const lines   = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')
  const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g,'').toLowerCase())
  const colIdx  = headers.findIndex(h => ['ticket_id','ticket_url','url','id','ticket'].includes(h))
  if (colIdx === -1) throw new Error('No ticket_id or ticket_url column found')
  return lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/['"]/g,'')).at(colIdx)).filter(Boolean)
}

function SourceToggle({ mode, setMode }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.07)' }}>
      {[['csv','📄 CSV Upload'],['view','🔗 Gorgias View']].map(([id, label]) => (
        <button key={id} onClick={() => setMode(id)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={mode === id ? { background: '#1e1e1e', color: '#fff' } : { color: '#777' }}
          onMouseEnter={e => { if (mode!==id) e.currentTarget.style.color='#ccc' }}
          onMouseLeave={e => { if (mode!==id) e.currentTarget.style.color='#555' }}
        >
          {label}
        </button>
      ))}
    </div>
  )
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
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => !disabled && inputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
        style={{ borderColor: dragging ? '#FF9780' : 'rgba(255,255,255,0.07)', background: dragging ? 'rgba(255,151,128,0.04)' : 'transparent' }}
      >
        <p className="text-3xl mb-3">📄</p>
        <p className="text-sm font-medium text-white">Drop your CSV here</p>
        <p className="text-xs mt-1" style={{ color: '#777' }}>or click to browse</p>
        <p className="text-xs mt-3" style={{ color: '#555' }}>Expected column: <code style={{ color: '#888' }}>ticket_id</code> or <code style={{ color: '#888' }}>ticket_url</code></p>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => onFile(e.target.files[0])} />
      </div>
      {err     && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{err}</p>}
      {preview && <p className="text-xs mt-2" style={{ color: '#10b981' }}>✓ Found {preview.length} ticket{preview.length!==1?'s':''} — ready to run</p>}
    </div>
  )
}

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
    authFetch('/api/views')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setViews(d.views || [])
      })
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
    } catch(e) { setErr(e.message); onTickets([]) }
    finally { setFetching(false) }
  }

  const inputStyle = { background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', outline: 'none' }
  const inputFocus = e => e.target.style.borderColor = '#FF9780'
  const inputBlur  = e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-xs mb-1.5 block" style={{ color: '#888' }}>Gorgias View</label>
          <select value={viewId} onChange={e=>{setViewId(e.target.value);setPreview(null);onTickets([])}} disabled={disabled||loading}
            className="w-full rounded-xl px-4 py-2.5 text-sm" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
            <option value="">{loading ? 'Loading views…' : 'Select a view…'}</option>
            {views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs mb-1.5 block" style={{ color: '#888' }}>Limit</label>
          <input type="number" min={1} max={100} value={limit}
            onChange={e=>setLimit(Math.min(100,Math.max(1,+e.target.value)))} disabled={disabled}
            className="w-full rounded-xl px-4 py-2.5 text-sm" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </div>
        <button onClick={load} disabled={!viewId||fetching||disabled}
          className="text-sm px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          style={{ background: '#1e1e1e', color: fetching?'#555':'#ccc', border:'1px solid rgba(255,255,255,0.07)' }}>
          {fetching ? 'Loading…' : 'Load Tickets'}
        </button>
      </div>
      {err && <p className="text-xs" style={{ color: '#ef4444' }}>{err}</p>}
      {preview && (
        <div className="rounded-xl p-3" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-2" style={{ color: '#10b981' }}>✓ {preview.length} tickets — ready to run</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {preview.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono" style={{ color: '#777' }}>#{t.id}</span>
                <span className="truncate" style={{ color: '#888' }}>{t.subject||'(no subject)'}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-xs" style={{ background:'#1a1a1a', color:'#666' }}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultRow({ result, onView }) {
  const vs = VERDICT_STYLE[result.verdict]
  if (result.error) return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.1)' }}>
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        className="font-mono text-xs w-24 shrink-0" style={{ color: '#FF9780' }}>#{result.ticketId}</a>
      <span className="text-xs flex-1 truncate" style={{ color: '#ef4444' }}>{result.error}</span>
    </div>
  )
  return (
    <button onClick={() => onView(result.fullScore)}
      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background='#0f0f0f'; e.currentTarget.style.borderColor='rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='transparent' }}
    >
      <a href={gorgiasTicketUrl(result.ticketId)} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="font-mono text-xs w-24 shrink-0 transition-colors"
        style={{ color: '#FF9780' }}
        onMouseEnter={e => e.target.style.textDecoration='underline'}
        onMouseLeave={e => e.target.style.textDecoration='none'}>
        #{result.ticketId}
      </a>
      <span className="text-xs flex-1 truncate" style={{ color: '#ccc' }}>{result.fullScore?.ticket_subject||'—'}</span>
      {result.agentName && <span className="text-xs shrink-0 hidden sm:block" style={{ color: '#777' }}>{result.agentName}</span>}
      <span className="text-xs shrink-0 tabular-nums" style={{ color: '#888' }}>{result.weightedScore?.toFixed(0)}/100</span>
      {vs && <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: vs.color, background: vs.bg }}>{vs.label}</span>}
    </button>
  )
}

export default function BatchPage() {
  const { addScore, rubric } = useApp()
  const [mode,        setMode]        = useState('csv')
  const [ticketIds,   setTicketIds]   = useState([])
  const [running,     setRunning]     = useState(false)
  const [results,     setResults]     = useState([])
  const [activeScore, setActiveScore] = useState(null)
  const abortRef = useRef(false)

  const done    = results.length
  const success = results.filter(r => !r.error)
  const avg     = success.length ? (success.reduce((s,r)=>s+(r.weightedScore||0),0)/success.length).toFixed(1) : null

  const runBatch = async () => {
    if (!ticketIds.length||running) return
    setRunning(true); setResults([]); abortRef.current=false

    for (const raw of ticketIds) {
      if (abortRef.current) break
      const ticketId = String(raw).replace(/.*\/ticket\//,'').trim()
      try {
        const res  = await authFetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ticket_url: ticketId, rubric }) })
        const data = await res.json()
        if (!res.ok) { setResults(p=>[...p,{ticketId, error:data.error||'Failed'}]); continue }
        addScore(data)
        const agentNames = (data.agent_senders||[]).map(s=>s.name).filter(Boolean)
        setResults(p=>[...p,{ ticketId:data.ticket_id, verdict:data.verdict, weightedScore:data.weighted_score, agentName:agentNames.join(', ')||null, fullScore:data }])
      } catch { setResults(p=>[...p,{ticketId,error:'Network error'}]) }
    }
    setRunning(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Batch Run</h1>
        <p className="text-sm mt-0.5" style={{ color: '#888' }}>Score multiple tickets at once from a CSV or a Gorgias view</p>
      </div>

      <div className="mb-6"><SourceToggle mode={mode} setMode={m=>{setMode(m);setTicketIds([]);setResults([])}} /></div>

      <div className="mb-6">
        {mode==='csv'
          ? <CSVUploadZone onTickets={setTicketIds} disabled={running} />
          : <ViewPicker    onTickets={setTicketIds} disabled={running} />}
      </div>

      <div className="flex items-center gap-3 mb-8">
        <button onClick={runBatch} disabled={!ticketIds.length||running}
          className="g-btn-primary text-sm px-6 py-3 rounded-xl flex items-center gap-2">
          {running ? (
            <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Scoring…</>
          ) : `▶ Run Batch (${ticketIds.length} ticket${ticketIds.length!==1?'s':''})`}
        </button>
        {running && <button onClick={()=>abortRef.current=true} className="text-sm transition-colors" style={{ color:'#555' }}
          onMouseEnter={e=>e.target.style.color='#ef4444'} onMouseLeave={e=>e.target.style.color='#555'}>Stop</button>}
        {!running&&results.length>0 && <button onClick={()=>setResults([])} className="text-sm g-btn-ghost">Clear</button>}
      </div>

      {(running||results.length>0) && (
        <div>
          {/* Progress */}
          <div className="mb-5">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: '#888' }}>
              <span>{done} / {ticketIds.length} scored</span>
              <span>{Math.round(ticketIds.length>0?(done/ticketIds.length)*100:0)}%</span>
            </div>
            <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: '#1a1a1a' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width:`${ticketIds.length>0?(done/ticketIds.length)*100:0}%`, background:'#FF9780' }} />
            </div>
            {avg && (
              <div className="flex items-center gap-4 mt-3 text-xs">
                <span style={{ color:'#888' }}>Average: <span className="text-white font-medium">{avg}/100</span></span>
                <span style={{ color:'#10b981' }}>{results.filter(r=>r.verdict==='PASS').length} pass</span>
                <span style={{ color:'#f59e0b' }}>{results.filter(r=>r.verdict==='NEEDS_REVIEW').length} review</span>
                <span style={{ color:'#ef4444' }}>{results.filter(r=>r.verdict==='FAIL').length} fail</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {results.map((r,i) => <ResultRow key={i} result={r} onView={setActiveScore} />)}
            {running && done < ticketIds.length && (
              <div className="flex items-center gap-2 py-2 px-3">
                <svg className="animate-spin h-3 w-3" style={{ color:'#333' }} viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-xs" style={{ color:'#444' }}>Scoring next ticket…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeScore && <ScoreModal score={activeScore} onClose={() => setActiveScore(null)} />}
    </div>
  )
}
