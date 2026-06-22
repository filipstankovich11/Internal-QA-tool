import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useApp, DEFAULT_RUBRIC } from '../context/AppContext'
import { useToast } from '../components/Toast'

const deepCopy = obj => JSON.parse(JSON.stringify(obj))

function CriterionEditor({ crit, onChange, onRemove }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#1c1c1e' }}>
      <div className="w-full flex items-center justify-between px-4 py-3 gap-2">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-left flex-1 min-w-0">
          <span className="text-xs transition-transform shrink-0" style={{ color: '#888', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span className="text-sm font-medium truncate" style={{ color: crit.name ? '#fff' : '#888' }}>{crit.name || 'Unnamed criterion'}</span>
        </button>
        {onRemove && (
          <button onClick={onRemove}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors" style={{ color: '#888' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#888'}
            title="Remove criterion">
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="pt-3">
            <label className="text-xs mb-1.5 block" style={{ color: '#c8c8c8' }}>Criterion name</label>
            <input value={crit.name} onChange={e => onChange({ ...crit, name: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm text-white g-input" placeholder="e.g. Core Inquiry Resolution" />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: '#c8c8c8' }}>Description & scoring guide (1–5)</label>
            <textarea value={crit.description} onChange={e => onChange({ ...crit, description: e.target.value })}
              rows={6}
              className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y g-input"
              style={{ color: '#ccc', minHeight: 120 }}
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
    <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      <div className="flex items-center gap-3 mb-4">
        <input value={dim.name} onChange={e => update({ ...dim, name: e.target.value })}
          className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white g-input"
          placeholder="Dimension name" />
        <div className="flex items-center gap-2 shrink-0">
          <input type="number" min="0" max="100" value={dim.weight}
            onChange={e => update({ ...dim, weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
            className="w-16 rounded-lg px-2 py-2 text-sm text-center font-bold g-input"
            style={{ color: '#FF9780' }} />
          <span className="text-sm" style={{ color: '#888' }}>%</span>
          <button onClick={() => onRemove(index)}
            className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-xs transition-colors" style={{ color: '#888' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent' }}
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
          <p className="text-xs text-center py-3" style={{ color: '#888' }}>No criteria yet. Add one below.</p>
        )}
      </div>
      <button onClick={addCrit}
        className="mt-3 text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ color: '#c8c8c8', border: '1px solid rgba(255,255,255,0.10)' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#FF9780'; e.currentTarget.style.borderColor = 'rgba(255,151,128,0.3)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
        + Add criterion
      </button>
    </div>
  )
})

function AutoFailEditor({ conditions, onChange }) {
  const add = () => onChange([...conditions, { id: `af_${Date.now()}`, name: '', description: '' }])
  const remove = (i) => onChange(conditions.filter((_, j) => j !== i))

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#ef4444' }}>Auto-Fail Conditions</p>
        <button onClick={add}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}>
          + Add Condition
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {conditions.map((af, i) => (
          <div key={af.id} className="rounded-xl p-3" style={{ background: '#1c1c1e', border: '1px solid rgba(239,68,68,0.1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <input value={af.name} onChange={e => onChange(conditions.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white g-input"
                placeholder="Condition name" />
              <button onClick={() => remove(i)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors"
                style={{ color: '#888' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#888'}
                title="Remove condition">
                ✕
              </button>
            </div>
            <textarea value={af.description} onChange={e => onChange(conditions.map((c, j) => j === i ? { ...c, description: e.target.value } : c))}
              rows={2} className="w-full rounded-lg px-3 py-2 text-sm g-input resize-none"
              style={{ color: '#aaa' }} placeholder="Describe what triggers this auto-fail." />
          </div>
        ))}
        {conditions.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: '#888' }}>No auto-fail conditions. Add one above.</p>
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
          <h1 className="text-2xl font-bold text-white">QA Guidance</h1>
          <p className="text-sm mt-0.5" style={{ color: '#c8c8c8' }}>
            Customise the scoring framework — changes apply to all future scorings
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
              Unsaved changes
            </span>
          )}
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#ef4444' }}>Reset everything?</span>
              <button onClick={doReset} className="text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Yes, reset</button>
              <button onClick={() => setConfirmReset(false)} className="text-xs g-btn-ghost px-2.5 py-1.5">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)}
              className="text-sm px-4 py-2 rounded-xl border transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#c8c8c8' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}>
              Reset to default
            </button>
          )}
          <button onClick={save} disabled={!canSave || saving}
            className="g-btn-primary text-sm px-5 py-2 rounded-xl"
            style={{ opacity: (!canSave || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Rubric'}
          </button>
        </div>
      </div>

      {/* Weight validator */}
      <div className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: weightOk ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${weightOk ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
        <p className="text-sm" style={{ color: weightOk ? '#10b981' : '#ef4444' }}>
          {weightOk ? '✓ Dimension weights sum to 100%' : `⚠ Weights sum to ${totalWeight}% — must equal 100% to save`}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {draft.dimensions.map(d => (
            <span key={d.id} className="text-xs" style={{ color: '#c8c8c8' }}>{d.name || 'Untitled'}: <span style={{ color: '#FF9780' }}>{d.weight}%</span></span>
          ))}
        </div>
      </div>

      {error && <p className="text-sm mb-4 text-center" style={{ color: '#ef4444' }}>{error}</p>}

      {/* Verdict thresholds */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#c8c8c8' }}>Verdict Thresholds</p>
        <div className="flex items-center gap-6 flex-wrap">
          {[
            { key: 'pass',         label: 'PASS ≥',         color: '#10b981' },
            { key: 'needs_review', label: 'NEEDS REVIEW ≥', color: '#f59e0b' },
          ].map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color }}>{label}</span>
              <input type="number" min="0" max="100"
                value={draft.verdict_thresholds[key]}
                onChange={e => setDraft(d => ({ ...d, verdict_thresholds: { ...d.verdict_thresholds, [key]: parseInt(e.target.value) || 0 } }))}
                className="w-16 rounded-lg px-2 py-1.5 text-sm text-center font-bold g-input"
                style={{ color }} />
              <span className="text-sm" style={{ color: '#888' }}>pts</span>
            </div>
          ))}
          <p className="text-xs" style={{ color: '#888' }}>FAIL: below NEEDS REVIEW threshold or any auto-fail triggered</p>
        </div>
        {!thresholdsOk && (
          <p className="text-xs mt-3" style={{ color: '#ef4444' }}>⚠ The PASS threshold must be higher than NEEDS REVIEW.</p>
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
        className="w-full rounded-2xl py-3 text-sm transition-colors mb-4"
        style={{ border: '1px dashed rgba(255,255,255,0.15)', color: '#c8c8c8' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#FF9780'; e.currentTarget.style.borderColor = 'rgba(255,151,128,0.4)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#c8c8c8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}>
        + Add dimension
      </button>

      {/* Auto-fail conditions */}
      <AutoFailEditor
        conditions={draft.auto_fail_conditions}
        onChange={updated => setDraft(d => ({ ...d, auto_fail_conditions: updated }))} />

      {/* Scoring Guidance */}
      <div className="rounded-2xl p-5 mt-4" style={{ background: '#1e1e20', border: '1px solid rgba(255,255,255,0.10)' }}>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#c8c8c8' }}>Scoring Guidance</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#888' }}>
            Free-text instructions injected into every AI scoring prompt before the rubric. Use this to give Claude context it can't infer from the ticket alone — your product domain, internal tools agents are expected to use, escalation norms, or how to handle recurring edge cases. The more specific, the more consistent the scores.
          </p>
        </div>
        <textarea
          value={draft.scoring_guidance || ''}
          onChange={e => setDraft(d => ({ ...d, scoring_guidance: e.target.value }))}
          rows={6}
          className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-y g-input"
          style={{ color: '#ccc', minHeight: 120 }}
          placeholder={"e.g. Our product is a customer support platform. Agents often use Loom videos for walkthroughs — always treat a Loom link as a strong forward-resolution signal. Escalating to Tier 2 is correct when a bug is confirmed; do not penalise for this."}
        />
      </div>
    </div>
  )
}
