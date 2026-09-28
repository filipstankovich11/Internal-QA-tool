import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'
import { supabase } from '../lib/supabase'
import { authFetchJson } from '../lib/api'
import GuidancePreview from './GuidancePreview'
import AccessibleTabs from './AccessibleTabs'

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
  const [view, setView] = useState('write')

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

  useEffect(() => {
    if (!draftDirty && !mappingDirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draftDirty, mappingDirty])

  const selectTeam = event => {
    if ((draftDirty || mappingDirty) && !window.confirm('Discard unsaved changes for this team?')) {
      event.target.value = selected
      return
    }
    setSelected(event.target.value)
    setView('write')
  }

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
      setView('versions')
    }
    setBusy(false)
  }

  return (
    <section className="rounded-2xl" style={card} aria-labelledby="team-guidance-heading">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 id="team-guidance-heading" className="text-base font-semibold" style={{ color: '#1A1E23', fontFamily: "'Inter Tight'" }}>Team guidance</h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(26,30,35,.6)', maxWidth: 560 }}>
            Add team-specific scoring instructions on top of the shared rubric. Only published text is used for scheduled grading.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(draftDirty || mappingDirty) && <span className="text-xs px-2.5 py-1 rounded-full" style={{ color: '#B84A2E', background: '#FFEAE6' }}>Unsaved changes</span>}
          {record?.published_version > 0 && <span className="text-xs px-2.5 py-1 rounded-full" style={{ color: '#2F8F5B', background: '#E6F4EC' }}>Published v{record.published_version}</span>}
        </div>
      </div>

      {teams.length === 0 ? <p className="text-sm" style={{ color: 'rgba(26,30,35,.6)' }}>Create a team first, then add its guidance here.</p> : <>
        <label className="text-xs font-medium block mb-1.5" htmlFor="guidance-team">Team</label>
        <select id="guidance-team" value={selected} onChange={selectTeam} className="g-input w-full rounded-lg px-3 py-2 text-sm mb-4">
          {teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <AccessibleTabs idPrefix="team-guidance" label="Team guidance tasks" value={view} onChange={setView}
          tabs={[{ id: 'write', label: 'Write draft' }, { id: 'test', label: 'Test & publish' }, { id: 'versions', label: 'Versions' }]} />
        {error && <p role="alert" className="text-xs mb-4" style={{ color: '#D14B3D' }}>{error}</p>}

        <div id="team-guidance-panel-write" role="tabpanel" aria-labelledby="team-guidance-tab-write" tabIndex={0} hidden={view !== 'write'}>
          <label className="text-xs font-medium block mb-1.5" htmlFor="gorgias-team-id">Gorgias team ID</label>
          {gorgiasTeams.length > 0 && <select aria-label="Choose a Gorgias team" value={gorgiasTeams.some(item => String(item.id) === mapping) ? mapping : ''}
            onChange={event => setMapping(event.target.value)} className="g-input w-full rounded-lg px-3 py-2 text-sm mb-2">
            <option value="">Choose from Gorgias teams</option>
            {gorgiasTeams.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
          </select>}
          <input id="gorgias-team-id" inputMode="numeric" value={mapping} onChange={event => setMapping(event.target.value)}
            className="g-input w-full rounded-lg px-3 py-2 text-sm mb-1" placeholder="e.g. 123456" />
          <p className="text-xs mb-4" style={{ color: 'rgba(26,30,35,.62)' }}>Use the ID of the assigned team in Gorgias. Each ID can map to one QA team.</p>
          <label className="text-xs font-medium block mb-1.5" htmlFor="team-guidance-draft">Guidance draft</label>
          <textarea id="team-guidance-draft" value={draft} onChange={event => setDraft(event.target.value)} rows={9}
            className="g-input w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-y"
            placeholder="Describe this team's escalation rules, tools, exceptions, and examples of a strong response." />
          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <p className="text-xs" style={{ color: 'rgba(26,30,35,.62)' }}>Save your draft, then test it on existing tickets.</p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={save} disabled={busy || (!draftDirty && !mappingDirty)}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40" style={{ border: '1px solid #DDD6CF', color: '#1A1E23' }}>Save draft</button>
              <button type="button" onClick={() => setView('test')} disabled={busy || draftDirty || mappingDirty || !draft.trim()}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40" style={{ background: '#FEF6F4', color: '#B84A2E', border: '1px solid #F4DDD7' }}>Continue to test</button>
            </div>
          </div>
        </div>

        <div id="team-guidance-panel-test" role="tabpanel" aria-labelledby="team-guidance-tab-test" tabIndex={0} hidden={view !== 'test'}>
          <GuidancePreview team={team} record={record} draft={draft} draftDirty={draftDirty} mappingDirty={mappingDirty} />
          <div className="mt-5 pt-5 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: '1px solid #F0ECE9' }}>
            <p className="text-xs" style={{ color: 'rgba(26,30,35,.62)' }}>Publishing applies this saved draft to future scheduled grades.</p>
            <button type="button" onClick={publish} disabled={busy || !publishable}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: '#B84A2E' }}>Publish guidance</button>
          </div>
        </div>

        <div id="team-guidance-panel-versions" role="tabpanel" aria-labelledby="team-guidance-tab-versions" tabIndex={0} hidden={view !== 'versions'}>
          {record?.published_text ? <details className="rounded-xl p-4 mb-4" style={{ background: '#FBF7F3' }}>
            <summary className="text-sm font-semibold cursor-pointer" style={{ color: '#1A1E23' }}>Currently published · v{record.published_version}</summary>
            <p className="text-sm whitespace-pre-wrap leading-relaxed mt-3" style={{ color: 'rgba(26,30,35,.72)' }}>{record.published_text}</p>
          </details> : <p className="text-sm" style={{ color: 'rgba(26,30,35,.62)' }}>No guidance has been published for this team yet.</p>}
          {history.length > 0 && <div>
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'rgba(26,30,35,.72)' }}>Published versions</h3>
            {history.map(item => <details key={item.version} className="text-xs py-2" style={{ borderTop: '1px solid #F0ECE9' }}>
              <summary className="cursor-pointer">Version {item.version} · {new Date(item.published_at).toLocaleString()}</summary>
              <p className="whitespace-pre-wrap mt-2 rounded-lg p-3" style={{ background: '#FBF7F3' }}>{item.content}</p>
            </details>)}
          </div>}
        </div>
      </>}
    </section>
  )
}
