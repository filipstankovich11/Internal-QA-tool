import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useApp, DEFAULT_RUBRIC } from '../context/AppContext'
import { useToast } from '../components/Toast'

const deepCopy = obj => JSON.parse(JSON.stringify(obj))

function CriterionEditor({ crit, onChange, onRemove }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid #F0ECE9', background: '#FBF7F3' }}>
      <div className="w-full flex items-center justify-between gap-2" style={{ padding: '12px 14px' }}>
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-left flex-1 min-w-0">
          <span className="text-xs transition-transform shrink-0" style={{ color: 'rgba(26,30,35,.5)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span className="text-sm font-medium truncate" style={{ color: crit.name ? '#1A1E23' : 'rgba(26,30,35,.5)' }}>{crit.name || 'Unnamed criterion'}</span>
        </button>
        {onRemove && (
          <button onClick={onRemove}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors" style={{ color: 'rgba(26,30,35,.45)' }}
            onMouseEnter={e => e.currentTarget.style.color = '#D14B3D'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,30,35,.45)'}
            title="Remove criterion">
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5 border-t" style={{ borderColor: '#F0ECE9' }}>
          <div className="pt-3">
            <label className="text-xs mb-1.5 block" style={{ color: 'rgba(26,30,35,.6)' }}>Criterion name</label>
            <input value={crit.name} onChange={e => onChange({ ...crit, name: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm g-input" placeholder="e.g. Core Inquiry Resolution" />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'rgba(26,30,35,.6)' }}>Description & scoring guide (1–5)</label>
            <textarea value={crit.description} onChange={e => onChange({ ...crit, description: e.target.value })}
              rows={6}
              className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y g-input"
              style={{ minHeight: 120 }}
              placeholder="Describe what this criterion evaluates and what each score level (1–5) means." />
          </div>
        </div>
      )}
    </div>
  )
}

// memo + stable (index-based) callbacks: editing one dimension, the Scoring
// Guidance, or the thresholds won't re-render the other dimension editors.
const DimensionEditor = memo(function DimensionEditor({ dim, index, onChange, onRemove }) {
  const update  = updated => onChange(index, updated)
  const addCrit = () => update({ ...dim, criteria: [...dim.criteria, { id: `c_${Date.now()}`, name: '', description: '' }] })

  return (
    <div className="rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)', padding: '20px 24px' }}>
      <div className="flex items-center gap-3 mb-4">
        <input value={dim.name} onChange={e => update({ ...dim, name: e.target.value })}
          className="flex-1 rounded-lg px-3 py-2 g-input"
          style={{ fontFamily: "'Inter Tight'", fontSize: 15, fontWeight: 600 }}
          placeholder="Dimension name" />
        <div className="flex items-center gap-2 shrink-0">
          <input type="number" min="0" max="100" value={dim.weight}
            onChange={e => update({ ...dim, weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
            className="w-16 rounded-lg px-2 py-2 text-center g-input"
            style={{ color: '#B84A2E', fontFamily: "'Inter Tight'", fontSize: 16, fontWeight: 600 }} />
          <span className="text-sm" style={{ color: 'rgba(26,30,35,.5)' }}>%</span>
          <button onClick={() => onRemove(index)}
            className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-xs transition-colors" style={{ color: 'rgba(26,30,35,.45)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#D14B3D'; e.currentTarget.style.background = '#FEF6F4' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.45)'; e.currentTarget.style.background = 'transparent' }}
            title="Remove dimension">
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {dim.criteria.map((crit, ci) => (
          <CriterionEditor key={crit.id} crit={crit}
            onChange={updated => update({ ...dim, criteria: dim.criteria.map((c, i) => i === ci ? updated : c) })}
            onRemove={() => update({ ...dim, criteria: dim.criteria.filter((_, i) => i !== ci) })} />
        ))}
        {dim.criteria.length === 0 && (
          <p className="text-xs text-center py-3" style={{ color: 'rgba(26,30,35,.5)' }}>No criteria yet. Add one below.</p>
        )}
      </div>
      <button onClick={addCrit}
        className="mt-3 text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ color: 'rgba(26,30,35,.72)', background: '#FFFFFF', border: '1px solid #E7E3DF' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#B84A2E'; e.currentTarget.style.borderColor = '#FF9780' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.borderColor = '#E7E3DF' }}>
        + Add criterion
      </button>
    </div>
  )
})

function AutoFailEditor({ conditions, onChange }) {
  const add = () => onChange([...conditions, { id: `af_${Date.now()}`, name: '', description: '' }])
  const remove = (i) => onChange(conditions.filter((_, j) => j !== i))

  return (
    <div className="rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #F4DDD7', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)', padding: '20px 24px' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#D14B3D' }}><span aria-hidden>⛔</span>Auto-Fail Conditions</p>
        <button onClick={add}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: '#D14B3D', border: '1px solid #F4DDD7', background: '#FEF6F4' }}
          onMouseEnter={e => e.currentTarget.style.background = '#FBE9E4'}
          onMouseLeave={e => e.currentTarget.style.background = '#FEF6F4'}>
          + Add Condition
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {conditions.map((af, i) => (
          <div key={af.id} className="rounded-[10px] p-3" style={{ background: '#FEF6F4', border: '1px solid #F4DDD7' }}>
            <div className="flex items-center gap-2 mb-2">
              <span aria-hidden className="shrink-0 text-sm" style={{ color: '#D14B3D' }}>⊗</span>
              <input value={af.name} onChange={e => onChange(conditions.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium g-input"
                placeholder="Condition name" />
              <button onClick={() => remove(i)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors"
                style={{ color: 'rgba(26,30,35,.45)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#D14B3D'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,30,35,.45)'}
                title="Remove condition">
                ✕
              </button>
            </div>
            <textarea value={af.description} onChange={e => onChange(conditions.map((c, j) => j === i ? { ...c, description: e.target.value } : c))}
              rows={2} className="w-full rounded-lg px-3 py-2 text-sm g-input resize-none"
              placeholder="Describe what triggers this auto-fail." />
          </div>
        ))}
        {conditions.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'rgba(26,30,35,.5)' }}>No auto-fail conditions. Add one above.</p>
        )}
      </div>
    </div>
  )
}


export default function RubricPage() {
  const { rubric, updateRubric } = useApp()
  const toast = useToast()
  const [draft,        setDraft]        = useState(() => deepCopy(rubric))
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)

  // Resync the draft if the rubric loads/changes after mount (e.g. the page was
  // opened before the rubric finished loading) — but only when the user hasn't
  // started editing, so in-progress changes are never clobbered.
  const lastSynced = useRef(rubric)
  useEffect(() => {
    if (rubric === lastSynced.current) return
    const pristine = JSON.stringify(draft) === JSON.stringify(lastSynced.current)
    if (pristine) setDraft(deepCopy(rubric))
    lastSynced.current = rubric
  }, [rubric]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(rubric)

  // Warn before a browser close/refresh discards unsaved edits
  useEffect(() => {
    if (!dirty) return
    const handler = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const totalWeight  = draft.dimensions.reduce((s, d) => s + d.weight, 0)
  const weightOk     = totalWeight === 100
  const thresholdsOk = draft.verdict_thresholds.pass > draft.verdict_thresholds.needs_review
  const canSave      = weightOk && thresholdsOk

  // Stable identities so the memoized DimensionEditors don't re-render on every keystroke
  const setDim = useCallback((i, updated) =>
    setDraft(d => ({ ...d, dimensions: d.dimensions.map((dim, j) => j === i ? updated : dim) })), [])

  const removeDimension = useCallback((i) =>
    setDraft(d => ({ ...d, dimensions: d.dimensions.filter((_, j) => j !== i) })), [])

  const addDimension = () =>
    setDraft(d => ({ ...d, dimensions: [...d.dimensions, { id: `dim_${Date.now()}`, name: '', weight: 0, criteria: [] }] }))

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError(null)
    const ok = await updateRubric(draft)
    setSaving(false)
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); toast.success('QA Guidance saved') }
    else { setError('Failed to save. Check your permissions.'); toast.error('Failed to save rubric') }
  }

  const doReset = () => {
    setDraft(deepCopy(DEFAULT_RUBRIC))
    setError(null)
    setConfirmReset(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 style={{ fontFamily: "'Inter Tight'", fontSize: 30, fontWeight: 600, color: '#1A1E23' }}>QA guidance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(26,30,35,.6)' }}>
            Customise the scoring framework — changes apply to all future scorings.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: '#FFEAE6', color: '#B84A2E', border: '1px solid #F4DDD7' }}>
              Unsaved changes
            </span>
          )}
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#D14B3D' }}>Reset everything?</span>
              <button onClick={doReset} className="text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ background: '#FEF6F4', color: '#D14B3D', border: '1px solid #F4DDD7' }}>Yes, reset</button>
              <button onClick={() => setConfirmReset(false)} className="text-xs g-btn-ghost px-2.5 py-1.5 rounded-lg">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ background: '#FFFFFF', borderColor: '#E7E3DF', color: 'rgba(26,30,35,.72)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1A1E23'; e.currentTarget.style.background = '#F6F2EF' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.72)'; e.currentTarget.style.background = '#FFFFFF' }}>
              Reset to default
            </button>
          )}
          <button onClick={save} disabled={!canSave || saving}
            className="g-btn-primary text-sm px-5 py-2 rounded-lg"
            style={{ opacity: (!canSave || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : '✓ Save rubric'}
          </button>
        </div>
      </div>

      {/* Weight validator */}
      <div className="rounded-[10px] mb-6 flex items-center justify-between gap-4 flex-wrap"
        style={{ padding: '13px 18px', background: weightOk ? '#E6F4EC' : '#FEF6F4', border: `1px solid ${weightOk ? '#BFE3CD' : '#F4DDD7'}` }}>
        <p className="text-sm font-medium" style={{ color: weightOk ? '#2F8F5B' : '#D14B3D' }}>
          {weightOk ? '✓ Dimension weights sum to 100%' : `⚠ Weights must sum to 100% — currently ${totalWeight}%`}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {draft.dimensions.map(d => (
            <span key={d.id} className="text-xs" style={{ color: 'rgba(26,30,35,.6)' }}>{d.name || 'Untitled'} <span className="font-bold" style={{ color: '#B84A2E' }}>{d.weight}%</span></span>
          ))}
        </div>
      </div>

      {error && <p className="text-sm mb-4 text-center" style={{ color: '#D14B3D' }}>{error}</p>}

      {/* Verdict thresholds */}
      <div className="rounded-2xl mb-4" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)', padding: '20px 24px' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(26,30,35,.5)' }}>Verdict Thresholds</p>
        <div className="flex items-center flex-wrap" style={{ gap: 34 }}>
          {[
            { key: 'pass',         label: 'PASS ≥',         color: '#2F8F5B' },
            { key: 'needs_review', label: 'NEEDS REVIEW ≥', color: '#C8841E' },
          ].map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color }}>{label}</span>
              <input type="number" min="0" max="100"
                value={draft.verdict_thresholds[key]}
                onChange={e => setDraft(d => ({ ...d, verdict_thresholds: { ...d.verdict_thresholds, [key]: parseInt(e.target.value) || 0 } }))}
                className="text-center g-input"
                style={{ width: 62, height: 38, borderRadius: 8, fontFamily: "'Inter Tight'", fontSize: 16, fontWeight: 600, color: '#1A1E23' }} />
              <span className="text-sm" style={{ color: 'rgba(26,30,35,.5)' }}>pts</span>
            </div>
          ))}
        </div>
        <p className="text-xs mt-4 flex items-center gap-1.5" style={{ color: 'rgba(26,30,35,.6)' }}><span aria-hidden style={{ color: '#D14B3D' }}>⊘</span>Fail: below the needs-review threshold, or any auto-fail condition triggered.</p>
        {!thresholdsOk && (
          <p className="text-xs mt-3" style={{ color: '#D14B3D' }}>⚠ The PASS threshold must be higher than NEEDS REVIEW.</p>
        )}
      </div>

      {/* Dimensions */}
      <div className="flex flex-col gap-4 mb-4">
        {draft.dimensions.map((dim, i) => (
          <DimensionEditor key={dim.id} dim={dim} index={i}
            onChange={setDim}
            onRemove={removeDimension} />
        ))}
      </div>

      <button onClick={addDimension}
        className="w-full rounded-xl text-sm transition-colors mb-4"
        style={{ padding: 16, background: 'transparent', border: '1.5px dashed #DDD6CF', color: 'rgba(26,30,35,.6)' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#B84A2E'; e.currentTarget.style.borderColor = '#FF9780' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,30,35,.6)'; e.currentTarget.style.borderColor = '#DDD6CF' }}>
        + Add dimension
      </button>

      {/* Auto-fail conditions */}
      <AutoFailEditor
        conditions={draft.auto_fail_conditions}
        onChange={updated => setDraft(d => ({ ...d, auto_fail_conditions: updated }))} />

      {/* Scoring Guidance */}
      <div className="rounded-2xl mt-4" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)', padding: '20px 24px' }}>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(26,30,35,.5)' }}>Scoring Guidance</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(26,30,35,.6)' }}>
            Free-text instructions injected into every AI scoring prompt before the rubric. Use this to give Claude context it can't infer from the ticket alone — your product domain, internal tools agents are expected to use, escalation norms, or how to handle recurring edge cases. The more specific, the more consistent the scores.
          </p>
        </div>
        <textarea
          value={draft.scoring_guidance || ''}
          onChange={e => setDraft(d => ({ ...d, scoring_guidance: e.target.value }))}
          rows={6}
          className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-y g-input"
          style={{ minHeight: 120 }}
          placeholder={"e.g. Our product is a customer support platform. Agents often use Loom videos for walkthroughs — always treat a Loom link as a strong forward-resolution signal. Escalating to Tier 2 is correct when a bug is confirmed; do not penalise for this."}
        />
      </div>
    </div>
  )
}
