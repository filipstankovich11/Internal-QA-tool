import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { authFetchJson } from '../lib/api'
import { parseTicketId, gorgiasTicketUrl } from '../lib/gorgias'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MAX_TICKETS = 3
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'
const ink = '#1A1E23'
const muted = 'rgba(26,30,35,.62)'
const verdictLabel = { PASS: 'Pass', NEEDS_REVIEW: 'Needs review', FAIL: 'Fail' }

function ScoreResult({ label, result, error }) {
  return <div className="min-w-0 flex-1 rounded-xl p-3.5" style={{ background: '#FBF7F3', border: '1px solid #F0ECE9' }}>
    <p className="text-xs font-semibold mb-1" style={{ color: muted }}>{label}</p>
    {error ? <p className="text-xs leading-relaxed" style={{ color: '#D14B3D' }}>{error}</p>
      : result ? <>
        <div className="flex items-baseline gap-2 flex-wrap">
          <strong className="text-xl tabular-nums" style={{ fontFamily: "'Inter Tight'", color: ink }}>{result.weighted_score}<span className="text-xs font-normal" style={{ color: muted }}>/100</span></strong>
          <span className="text-xs" style={{ color: muted }}>{verdictLabel[result.verdict] || result.verdict}</span>
        </div>
        <p className="text-xs leading-relaxed mt-2" style={{ color: muted }}>{result.summary || 'No summary returned.'}</p>
      </> : <p className="text-xs" style={{ color: muted }}>Waiting for result</p>}
  </div>
}

function CriterionChanges({ published, draft, rubric }) {
  if (!published?.scores || !draft?.scores) return null
  const changes = (rubric?.dimensions || []).flatMap(dim => (dim.criteria || []).map(crit => {
    const before = Number(published.scores?.[dim.id]?.[crit.id]?.score)
    const after = Number(draft.scores?.[dim.id]?.[crit.id]?.score)
    return Number.isFinite(before) && Number.isFinite(after) && before !== after
      ? { id: `${dim.id}:${crit.id}`, name: crit.name, before, after,
          note: draft.scores?.[dim.id]?.[crit.id]?.notes }
      : null
  }).filter(Boolean))
  return <details className="mt-3 text-xs" style={{ color: muted }}>
    <summary className="cursor-pointer font-medium">{changes.length ? `${changes.length} criterion score change${changes.length === 1 ? '' : 's'}` : 'No criterion score changes'}</summary>
    {changes.length > 0 && <ul className="mt-2 space-y-2">
      {changes.map(change => <li key={change.id} className="rounded-lg p-2.5" style={{ background: '#FBF7F3' }}>
        <span className="font-medium" style={{ color: ink }}>{change.name}</span>
        <span className="tabular-nums ml-2">{change.before} → {change.after}</span>
        {change.note && <p className="mt-1 leading-relaxed">{change.note}</p>}
      </li>)}
    </ul>}
  </details>
}

export default function GuidancePreview({ team, record, draftDirty, mappingDirty, draft }) {
  const { scoreHistory, agents, rubric } = useApp()
  const { user } = useAuth()
  const [selected, setSelected] = useState([])
  const [manualId, setManualId] = useState('')
  const [results, setResults] = useState({})
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState({})
  const [feedbackError, setFeedbackError] = useState('')
  const [savingPreference, setSavingPreference] = useState(null)
  const runRef = useRef(0)

  const candidates = useMemo(() => {
    if (!team) return []
    const memberIds = new Set(agents.filter(agent => agent.team_id === team.id).map(agent => agent.id))
    const seen = new Set()
    return scoreHistory.filter(score => {
      const belongs = score.fullScore?.scoring_context?.team_id === team.id ||
        score.agentIds?.some(id => memberIds.has(id))
      const ticketId = Number(score.ticketId)
      if (!belongs || !Number.isSafeInteger(ticketId) || ticketId <= 0 || seen.has(ticketId)) return false
      seen.add(ticketId)
      return true
    }).slice(0, 12)
  }, [team, agents, scoreHistory])

  useEffect(() => {
    runRef.current += 1
    setSelected([])
    setManualId('')
  }, [team?.id])

  useEffect(() => {
    runRef.current += 1
    setResults({})
    setFeedback({})
    setWorking(false)
    setProgress('')
    setError('')
    setFeedbackError('')
  }, [team?.id, record?.draft_text, record?.published_version, draft, team?.gorgias_team_id, rubric])

  const ready = Boolean(team?.gorgias_team_id && record?.draft_text?.trim() && !draftDirty && !mappingDirty)
  const toggle = id => setSelected(previous => previous.includes(id)
    ? previous.filter(item => item !== id)
    : previous.length < MAX_TICKETS ? [...previous, id] : previous)

  const addManual = () => {
    const id = Number(parseTicketId(manualId))
    if (!Number.isSafeInteger(id) || id <= 0) { setError('Enter a valid Gorgias ticket ID or URL.'); return }
    if (!selected.includes(id) && selected.length >= MAX_TICKETS) { setError(`Select at most ${MAX_TICKETS} tickets.`); return }
    if (!selected.includes(id)) setSelected(previous => [...previous, id])
    setManualId('')
    setError('')
  }

  const requestVariant = async (ticketId, variant) => {
    const response = await authFetchJson(`${API_BASE}/api/guidance-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, team_id: team.id, variant }),
    })
    if (!response.ok) throw new Error(response.data?.error || `HTTP ${response.status}`)
    return response.data
  }

  const run = async () => {
    if (!ready || selected.length === 0) return
    const runId = ++runRef.current
    setWorking(true); setError(''); setResults({}); setFeedback({}); setFeedbackError('')
    for (let index = 0; index < selected.length; index++) {
      if (runRef.current !== runId) return
      const ticketId = selected[index]
      setProgress(`Testing ticket ${index + 1} of ${selected.length}…`)
      const [published, candidate] = await Promise.allSettled([
        requestVariant(ticketId, 'published'), requestVariant(ticketId, 'draft'),
      ])
      if (runRef.current !== runId) return
      setResults(previous => ({ ...previous, [ticketId]: {
        published: published.status === 'fulfilled' ? published.value : null,
        draft: candidate.status === 'fulfilled' ? candidate.value : null,
        publishedError: published.status === 'rejected' ? published.reason.message : null,
        draftError: candidate.status === 'rejected' ? candidate.reason.message : null,
      } }))
    }
    setWorking(false)
    setProgress('')
  }

  const markPreference = async (ticketId, preferred) => {
    const comparison = results[ticketId]
    if (!comparison?.published || !comparison?.draft || !user ||
      comparison.published.rubric_hash !== comparison.draft.rubric_hash ||
      comparison.draft.guidance_text !== record.draft_text) return
    setSavingPreference(ticketId)
    setFeedbackError('')
    const previous = feedback[ticketId]
    const payload = {
      team_id: team.id, ticket_id: String(ticketId), draft_text: comparison.draft.guidance_text,
      published_version: comparison.published.guidance_version,
      published_result: comparison.published, draft_result: comparison.draft,
      preferred, created_by: user.id,
    }
    const query = previous?.id
      ? supabase.from('team_guidance_test_feedback').update({ preferred }).eq('id', previous.id)
      : supabase.from('team_guidance_test_feedback').insert(payload)
    const { data, error: saveError } = await query.select('id,preferred').single()
    if (saveError) setFeedbackError(`Could not save judgment for ticket #${ticketId}. Apply the guidance test feedback migration and try again.`)
    else setFeedback(current => ({ ...current, [ticketId]: data }))
    setSavingPreference(null)
  }

  const completed = Object.values(results).filter(item => item.published && item.draft).length
  const judged = Object.keys(feedback).length
  const votes = Object.values(feedback).reduce((count, item) => {
    count[item.preferred] = (count[item.preferred] || 0) + 1
    return count
  }, {})

  return <div className="mt-5 pt-5" style={{ borderTop: '1px solid #F0ECE9' }}>
    <h3 className="text-sm font-semibold" style={{ color: ink }}>Test saved draft</h3>
    <p className="text-xs leading-relaxed mt-1 mb-4" style={{ color: muted }}>
      Compare published guidance with the saved draft on up to {MAX_TICKETS} tickets. Each ticket uses two new AI runs. Grades do not change saved scores or notify agents; your judgments are saved for the QA team.
    </p>

    {candidates.length > 0 && <div className="space-y-1 mb-3" role="group" aria-label="Recent team tickets">
      {candidates.map(score => {
        const id = Number(score.ticketId)
        return <label key={score.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-[#FBF7F3]">
          <input type="checkbox" checked={selected.includes(id)} disabled={!selected.includes(id) && selected.length >= MAX_TICKETS || working}
            onChange={() => toggle(id)} className="accent-[#B84A2E]" />
          <span className="text-xs font-medium shrink-0" style={{ color: '#B84A2E' }}>#{id}</span>
          <span className="text-xs truncate flex-1" style={{ color: ink }}>{score.fullScore?.ticket_subject || 'Untitled ticket'}</span>
          <span className="text-xs tabular-nums shrink-0" style={{ color: muted }}>{Math.round(score.effectiveScore)}/100 saved</span>
        </label>
      })}
    </div>}

    <div className="flex gap-2 mb-3">
      <input aria-label="Add a Gorgias ticket ID or URL" value={manualId} onChange={event => setManualId(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addManual() } }}
        disabled={working} className="g-input rounded-lg px-3 py-2 text-xs flex-1 min-w-0" placeholder="Or paste a ticket ID or URL" />
      <button type="button" onClick={addManual} disabled={working || !manualId.trim()}
        className="rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40" style={{ border: '1px solid #DDD6CF', color: ink }}>Add</button>
    </div>
    {selected.length > 0 && <p className="text-xs mb-3" style={{ color: muted }}>Selected: {selected.map(id => `#${id}`).join(', ')}</p>}
    {error && <p role="alert" className="text-xs mb-3" style={{ color: '#D14B3D' }}>{error}</p>}
    {!ready && <p className="text-xs mb-3" style={{ color: '#C8841E' }}>Save a nonempty draft and a Gorgias team mapping to test.</p>}
    <button type="button" onClick={run} disabled={!ready || selected.length === 0 || working}
      className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40" style={{ color: '#B84A2E', border: '1px solid #F4DDD7', background: '#FEF6F4' }}>
      {working ? progress : `Compare guidance on ${selected.length} ticket${selected.length === 1 ? '' : 's'}`}
    </button>

    {Object.keys(results).length > 0 && <div className="mt-5 space-y-4" aria-live="polite">
      <p className="text-xs font-medium" style={{ color: ink }}>
        {judged} of {completed} completed comparisons judged
        {judged > 0 && ` · Draft preferred ${votes.draft || 0} · Published preferred ${votes.published || 0} · About the same ${votes.same || 0}`}
      </p>
      {feedbackError && <p role="alert" className="text-xs" style={{ color: '#D14B3D' }}>{feedbackError}</p>}
      {selected.filter(id => results[id]).map(id => {
        const item = results[id]
        const before = item.published
        const after = item.draft
        const comparable = before && after && before.rubric_hash === after.rubric_hash &&
          after.guidance_text === record?.draft_text &&
          before.guidance_version === (record?.published_text ? record.published_version : null)
        const delta = comparable ? Math.round((after.weighted_score - before.weighted_score) * 10) / 10 : null
        return <div key={id} className="rounded-xl p-4" style={{ border: '1px solid #E7E3DF' }}>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <strong className="text-sm" style={{ color: ink }}>Ticket #{id}</strong>
            <a href={gorgiasTicketUrl(id)} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-2" style={{ color: '#B84A2E' }}>Open in Gorgias</a>
            {delta !== null && <span className="text-xs tabular-nums px-2 py-0.5 rounded-full" style={{ background: delta === 0 ? '#F1ECE8' : delta > 0 ? '#E6F4EC' : '#FEF6F4', color: delta === 0 ? muted : delta > 0 ? '#2F8F5B' : '#D14B3D' }}>
              {delta > 0 ? '+' : ''}{delta} points with draft
            </span>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <ScoreResult label={record?.published_version ? `Published v${record.published_version}` : 'Shared rubric (no published team guidance)'} result={before} error={item.publishedError} />
            <ScoreResult label="Saved draft" result={after} error={item.draftError} />
          </div>
          {before && after && !comparable && <p role="alert" className="text-xs mt-3" style={{ color: '#D14B3D' }}>
            Guidance or the shared rubric changed during this test. Run the comparison again before judging it.
          </p>}
          <CriterionChanges published={before} draft={after} rubric={rubric} />
          {comparable && <div className="mt-4 pt-3" style={{ borderTop: '1px solid #F0ECE9' }}>
            <p className="text-xs font-medium mb-2" style={{ color: ink }}>Which grade better matches the ticket?</p>
            <div className="flex gap-2 flex-wrap" role="group" aria-label={`Preferred guidance result for ticket ${id}`}>
              {[
                ['published', 'Published'], ['draft', 'Draft'], ['same', 'About the same'],
              ].map(([value, label]) => <button key={value} type="button" onClick={() => markPreference(id, value)}
                disabled={savingPreference === id}
                aria-pressed={feedback[id]?.preferred === value}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                style={{ border: `1px solid ${feedback[id]?.preferred === value ? '#B84A2E' : '#E7E3DF'}`,
                  background: feedback[id]?.preferred === value ? '#FFF4F1' : '#FFFFFF',
                  color: feedback[id]?.preferred === value ? '#B84A2E' : ink }}>{label}</button>)}
            </div>
          </div>}
          {candidates.find(score => Number(score.ticketId) === id)?.overrideVerdict && <p className="text-xs mt-3" style={{ color: muted }}>
            Human-adjusted saved grade: {Math.round(candidates.find(score => Number(score.ticketId) === id).effectiveScore)}/100 · {verdictLabel[candidates.find(score => Number(score.ticketId) === id).effectiveVerdict]}
          </p>}
        </div>
      })}
      <p className="text-xs leading-relaxed" style={{ color: muted }}>AI runs can vary. Review the criterion notes and ticket evidence before deciding whether the draft improves grading.</p>
    </div>}
  </div>
}
