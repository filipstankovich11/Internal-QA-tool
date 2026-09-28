import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'
import { supabase } from '../lib/supabase'
import { authFetchJson } from '../lib/api'
import GuidancePreview from './GuidancePreview'

const card = { background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05)', padding: '20px 24px' }

export default function TeamGuidanceEditor() {
  const { teams, updateTeam } = useApp()
  const toast = useToast()
  const [selected, setSelected] = useState('')
  const [records, setRecords] = useState({})
  const [draft, setDraft] = useState('')
  const [mapping, setMapping] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [gorgiasTeams, setGorgiasTeams] = useState([])

  useEffect(() => {
    let active = true
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001'
    authFetchJson(`${apiBase}/api/gorgias-teams`).then(({ ok, data }) => {
      if (active && ok && Array.isArray(data)) setGorgiasTeams(data)
    }).catch(() => {}) // Numeric ID entry remains available when the API is offline.
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selected && teams.length) setSelected(teams[0].id)
  }, [teams, selected])

  useEffect(() => {
    let active = true
    supabase.from('team_guidance').select('*').then(({ data, error: fetchError }) => {
      if (!active) return
      if (fetchError) setError('Team guidance is unavailable. Apply the team guidance migration first.')
      else setRecords(Object.fromEntries((data || []).map(row => [row.team_id, row])))
    })
    return () => { active = false }
  }, [])

  const team = teams.find(t => t.id === selected)
  const record = records[selected]
  useEffect(() => {
    setDraft(record?.draft_text || '')
    setMapping(team?.gorgias_team_id?.toString() || '')
    setError('')
  }, [selected, record?.draft_text, team?.gorgias_team_id])

  useEffect(() => {
    if (!selected) return
    let active = true
    supabase.from('team_guidance_versions').select('version,published_at,content')
      .eq('team_id', selected).order('version', { ascending: false }).limit(5)
      .then(({ data }) => { if (active) setHistory(data || []) })
    return () => { active = false }
  }, [selected, record?.published_version])

  const draftDirty = draft !== (record?.draft_text || '')
  const mappingDirty = mapping !== (team?.gorgias_team_id?.toString() || '')
  const publishable = !!draft.trim() && !draftDirty && !mappingDirty && !!team?.gorgias_team_id &&
    draft !== (record?.published_text || '')

  const save = async () => {
    if (!team) return
    const id = mapping.trim()
    if (id && (!/^\d+$/.test(id) || Number(id) <= 0 || !Number.isSafeInteger(Number(id)))) {
      setError('Enter a positive numeric Gorgias team ID.')
      return
    }
    setBusy(true); setError('')
    try {
      if (mappingDirty) await updateTeam(team.id, { gorgias_team_id: id ? Number(id) : null })
      const { data, error: saveError } = await supabase.from('team_guidance')
        .upsert({ team_id: team.id, draft_text: draft, updated_at: new Date().toISOString() }, { onConflict: 'team_id' })
        .select().single()
      if (saveError) throw saveError
      setRecords(previous => ({ ...previous, [team.id]: data }))
      toast.success('Team guidance draft saved')
    } catch (saveError) {
      setError(saveError.message || 'Could not save team guidance.')
    } finally { setBusy(false) }
  }

  const publish = async () => {
    if (!publishable || !team) return
    setBusy(true); setError('')
    const { data, error: publishError } = await supabase.rpc('publish_team_guidance', { p_team_id: team.id })
    if (publishError) setError(publishError.message || 'Could not publish team guidance.')
    else {
      setRecords(previous => ({ ...previous, [team.id]: data }))
      toast.success(`Published ${team.name} guidance v${data.published_version}`)
    }
    setBusy(false)
  }

  return (
    <section className="rounded-2xl mt-4" style={card} aria-labelledby="team-guidance-heading">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 id="team-guidance-heading" className="text-base font-semibold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>Team guidance</h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(26,30,35,.6)', maxWidth: 560 }}>
            Add team-specific scoring instructions on top of the shared rubric. Only published text is used for scheduled grading.
          </p>
        </div>
        {record?.published_version > 0 && <span className="text-xs px-2.5 py-1 rounded-full" style={{ color: '#2F8F5B', background: '#E6F4EC' }}>Published v{record.published_version}</span>}
      </div>

      {teams.length === 0 ? <p className="text-sm" style={{ color: 'rgba(26,30,35,.6)' }}>Create a team first, then add its guidance here.</p> : <>
        <label className="text-xs font-medium block mb-1.5" htmlFor="guidance-team">Team</label>
        <select id="guidance-team" value={selected} onChange={event => setSelected(event.target.value)} className="g-input w-full rounded-lg px-3 py-2 text-sm mb-4">
          {teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <label className="text-xs font-medium block mb-1.5" htmlFor="gorgias-team-id">Gorgias team ID</label>
        {gorgiasTeams.length > 0 && <select aria-label="Choose a Gorgias team" value={gorgiasTeams.some(item => String(item.id) === mapping) ? mapping : ''}
          onChange={event => setMapping(event.target.value)} className="g-input w-full rounded-lg px-3 py-2 text-sm mb-2">
          <option value="">Choose from Gorgias teams</option>
          {gorgiasTeams.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
        </select>}
        <input id="gorgias-team-id" inputMode="numeric" value={mapping} onChange={event => setMapping(event.target.value)}
          className="g-input w-full rounded-lg px-3 py-2 text-sm mb-1" placeholder="e.g. 123456" />
        <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.55)' }}>Use the ID of the assigned team in Gorgias. Each ID can map to one QA team.</p>
        <label className="text-xs font-medium block mb-1.5" htmlFor="team-guidance-draft">Guidance draft</label>
        <textarea id="team-guidance-draft" value={draft} onChange={event => setDraft(event.target.value)} rows={8}
          className="g-input w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-y"
          placeholder="Describe this team's escalation rules, tools, exceptions, and examples of a strong response." />
        {record?.published_text && <details className="mt-3 text-xs" style={{ color: 'rgba(26,30,35,.7)' }}>
          <summary className="cursor-pointer font-medium">View currently published guidance</summary>
          <p className="whitespace-pre-wrap mt-2 rounded-lg p-3" style={{ background: '#FBF7F3' }}>{record.published_text}</p>
        </details>}
        {error && <p role="alert" className="text-xs mt-3" style={{ color: '#D14B3D' }}>{error}</p>}
        <div className="flex gap-2 mt-4 flex-wrap">
          <button type="button" onClick={save} disabled={busy || (!draftDirty && !mappingDirty)}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40" style={{ border: '1px solid #DDD6CF', color: '#1A1E23' }}>Save draft</button>
        </div>
        <GuidancePreview team={team} record={record} draft={draft} draftDirty={draftDirty} mappingDirty={mappingDirty} />
        <div className="mt-5 pt-5 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: '1px solid #F0ECE9' }}>
          <p className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>Publishing applies this saved draft to future scheduled grades.</p>
          <button type="button" onClick={publish} disabled={busy || !publishable}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: '#B84A2E' }}>Publish guidance</button>
        </div>
        {history.length > 0 && <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F0ECE9' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(26,30,35,.55)' }}>Published versions</p>
          {history.map(item => <details key={item.version} className="text-xs py-1.5">
            <summary className="cursor-pointer">Version {item.version} · {new Date(item.published_at).toLocaleString()}</summary>
            <p className="whitespace-pre-wrap mt-2 rounded-lg p-3" style={{ background: '#FBF7F3' }}>{item.content}</p>
          </details>)}
        </div>}
      </>}
    </section>
  )
}
