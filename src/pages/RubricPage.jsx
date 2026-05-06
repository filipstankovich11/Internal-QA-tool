import { useState } from 'react'
import { useApp, DEFAULT_RUBRIC } from '../context/AppContext'
import { useToast } from '../components/Toast'

function weightColor(w) {
  return w === 100 ? '#10b981' : '#ef4444'
}

function CriterionEditor({ crit, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)', background: '#111' }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-medium text-white">{crit.name || <span style={{ color: '#444' }}>Unnamed criterion</span>}</span>
        <span className="text-xs transition-transform shrink-0" style={{ color: '#444', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <div className="pt-3">
            <label className="text-xs mb-1.5 block" style={{ color: '#555' }}>Criterion name</label>
            <input value={crit.name} onChange={e => onChange({ ...crit, name: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm text-white g-input" placeholder="e.g. Core Inquiry Resolution" />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: '#555' }}>Description & scoring guide (1–5)</label>
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

function DimensionEditor({ dim, onChange }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 mb-4">
        <input value={dim.name} onChange={e => onChange({ ...dim, name: e.target.value })}
          className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white g-input"
          placeholder="Dimension name" />
        <div className="flex items-center gap-2 shrink-0">
          <input type="number" min="0" max="100" value={dim.weight}
            onChange={e => onChange({ ...dim, weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
            className="w-16 rounded-lg px-2 py-2 text-sm text-center font-bold g-input"
            style={{ color: '#FF9780' }} />
          <span className="text-sm" style={{ color: '#555' }}>%</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {dim.criteria.map((crit, ci) => (
          <CriterionEditor key={crit.id} crit={crit}
            onChange={updated => onChange({ ...dim, criteria: dim.criteria.map((c, i) => i === ci ? updated : c) })} />
        ))}
      </div>
    </div>
  )
}

function AutoFailEditor({ conditions, onChange }) {
  const add = () => onChange([...conditions, { id: `af_${Date.now()}`, name: '', description: '' }])
  const remove = (i) => onChange(conditions.filter((_, j) => j !== i))

  return (
    <div className="rounded-2xl p-5" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
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
          <div key={af.id} className="rounded-xl p-3" style={{ background: '#111', border: '1px solid rgba(239,68,68,0.1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <input value={af.name} onChange={e => onChange(conditions.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white g-input"
                placeholder="Condition name" />
              <button onClick={() => remove(i)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors"
                style={{ color: '#444' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#444'}
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
          <p className="text-xs text-center py-4" style={{ color: '#333' }}>No auto-fail conditions. Add one above.</p>
        )}
      </div>
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

export default function RubricPage() {
  const { rubric, updateRubric } = useApp()
  const toast = useToast()
  const [draft,       setDraft]       = useState(() => JSON.parse(JSON.stringify(rubric)))
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState(null)
  const [testingHook, setTestingHook] = useState(false)

  const totalWeight = draft.dimensions.reduce((s, d) => s + d.weight, 0)
  const weightOk    = totalWeight === 100

  const setDim = (i, updated) =>
    setDraft(d => ({ ...d, dimensions: d.dimensions.map((dim, j) => j === i ? updated : dim) }))

  const save = async () => {
    if (!weightOk) return
    setSaving(true); setError(null)
    const ok = await updateRubric(draft)
    setSaving(false)
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); toast.success('QA Guidance saved') }
    else { setError('Failed to save. Check your permissions.'); toast.error('Failed to save rubric') }
  }

  const reset = () => {
    setDraft(JSON.parse(JSON.stringify(DEFAULT_RUBRIC)))
    setError(null)
  }

  const testWebhook = async () => {
    const url = (draft.slack_webhook_url || '').trim()
    if (!url) return
    setTestingHook(true)
    try {
      const res = await fetch(`${API_BASE}/api/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: url }),
      })
      const data = await res.json()
      if (res.ok) toast.success('Test message sent to Slack')
      else toast.error(data.error || 'Webhook test failed')
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setTestingHook(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">QA Guidance</h1>
          <p className="text-sm mt-0.5" style={{ color: '#666' }}>
            Customise the scoring framework — changes apply to all future scorings
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={reset}
            className="text-sm px-4 py-2 rounded-xl border transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#666' }}
            onMouseEnter={e => { e.currentTarget.style.color='#ccc'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.color='#666'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}>
            Reset to default
          </button>
          <button onClick={save} disabled={!weightOk || saving}
            className="g-btn-primary text-sm px-5 py-2 rounded-xl"
            style={{ opacity: (!weightOk || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Rubric'}
          </button>
        </div>
      </div>

      {/* Weight validator */}
      <div className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
        style={{ background: weightOk ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${weightOk ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
        <p className="text-sm" style={{ color: weightOk ? '#10b981' : '#ef4444' }}>
          {weightOk ? '✓ Dimension weights sum to 100%' : `⚠ Weights sum to ${totalWeight}% — must equal 100% to save`}
        </p>
        <div className="flex items-center gap-3">
          {draft.dimensions.map(d => (
            <span key={d.id} className="text-xs" style={{ color: '#666' }}>{d.name}: <span style={{ color: '#FF9780' }}>{d.weight}%</span></span>
          ))}
        </div>
      </div>

      {error && <p className="text-sm mb-4 text-center" style={{ color: '#ef4444' }}>{error}</p>}

      {/* Verdict thresholds */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#555' }}>Verdict Thresholds</p>
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
              <span className="text-sm" style={{ color: '#555' }}>pts</span>
            </div>
          ))}
          <p className="text-xs" style={{ color: '#444' }}>FAIL: below NEEDS REVIEW threshold or any auto-fail triggered</p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="flex flex-col gap-4 mb-4">
        {draft.dimensions.map((dim, i) => (
          <DimensionEditor key={dim.id} dim={dim} onChange={updated => setDim(i, updated)} />
        ))}
      </div>

      {/* Auto-fail conditions */}
      <AutoFailEditor
        conditions={draft.auto_fail_conditions}
        onChange={updated => setDraft(d => ({ ...d, auto_fail_conditions: updated }))} />

      {/* Notifications */}
      <div className="rounded-2xl p-5 mt-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#555' }}>Notifications</p>
          <p className="text-xs mt-1" style={{ color: '#444' }}>
            Post a Slack message every time a ticket is scored. Paste an incoming webhook URL from your Slack app settings.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={draft.slack_webhook_url || ''}
            onChange={e => setDraft(d => ({ ...d, slack_webhook_url: e.target.value }))}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm g-input"
            style={{ color: '#ccc' }}
            placeholder="https://hooks.slack.com/services/…"
          />
          <button
            onClick={testWebhook}
            disabled={testingHook || !(draft.slack_webhook_url || '').trim()}
            className="shrink-0 text-sm px-4 py-2.5 rounded-xl border transition-colors"
            style={{ color: '#888', borderColor: 'rgba(255,255,255,0.1)', opacity: testingHook || !(draft.slack_webhook_url || '').trim() ? 0.4 : 1 }}
            onMouseEnter={e => { if (!testingHook) { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='rgba(255,255,255,0.25)' }}}
            onMouseLeave={e => { e.currentTarget.style.color='#888'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}>
            {testingHook ? 'Sending…' : 'Test'}
          </button>
        </div>
      </div>

      {/* Scoring Guidance */}
      <div className="rounded-2xl p-5 mt-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#555' }}>Scoring Guidance</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#444' }}>
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
