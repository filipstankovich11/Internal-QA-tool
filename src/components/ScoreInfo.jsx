import { useState } from 'react'
import { VERDICT_COLOR } from '../lib/verdict'

// Plain-language definition of the QA score, derived from the live rubric so it
// stays accurate if weights/thresholds are edited on the Rubric page.
export function scoreExplanation(rubric) {
  const dims = (rubric?.dimensions || []).map(d => `${d.name} ${d.weight}%`).join(' · ')
  const t = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  return `Weighted QA score, 0–100${dims ? `, combining ${dims}` : ''}. ≥${t.pass} = pass · ${t.needs_review}–${t.pass - 1} = needs review · <${t.needs_review} = fail.`
}

// "How the QA score works" — full rubric breakdown, shown on hover (and on
// keyboard focus). The popover sits flush under the button (padding, not a
// margin gap) so moving the pointer onto it doesn't dismiss it.
export function ScoreInfoPopover({ rubric }) {
  const [open, setOpen] = useState(false)

  const dims = rubric?.dimensions || []
  const t = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  const autoFails = rubric?.auto_fail_conditions || []
  const verdicts = [
    { c: VERDICT_COLOR.PASS,         label: `≥${t.pass} — Pass` },
    { c: VERDICT_COLOR.NEEDS_REVIEW, label: `${t.needs_review}–${t.pass - 1} — Needs review` },
    { c: VERDICT_COLOR.FAIL,         label: `<${t.needs_review} — Fail` },
  ]

  return (
    <span className="relative inline-block align-middle ml-1"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="How the QA score works"
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center transition-colors"
        style={{
          width: 18, height: 18, borderRadius: 5,
          border: `1px solid ${open ? '#FF9780' : '#E1DCD7'}`,
          background: open ? '#FFEAE6' : 'transparent',
          color: open ? '#B84A2E' : 'rgba(26,30,35,.6)',
          cursor: 'help',
        }}>
        <svg height="13" width="13" viewBox="0 -960 960 960" fill="currentColor">
          <path d="M423.5-703.5Q400-727 400-760t23.5-56.5Q447-840 480-840t56.5 23.5Q560-793 560-760t-23.5 56.5Q513-680 480-680t-56.5-23.5ZM420-120v-480h120v480H420Z"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 left-0" style={{ top: '100%', paddingTop: 8 }}>
          <div className="rounded-xl p-4 text-left"
            style={{ width: 300, background: '#FFFFFF', border: '1px solid #EEEEEE', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', animation: 'fadeIn 120ms ease' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#1A1E23' }}>How the QA score works</p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(26,30,35,.6)' }}>
              Each ticket gets a 0–100 score — a weighted blend of the rubric dimensions:
            </p>
            <div className="flex flex-col gap-1.5 mb-3">
              {dims.map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span style={{ color: 'rgba(26,30,35,.72)' }}>{d.name}</span>
                  <span className="tabular-nums font-semibold" style={{ color: '#B84A2E' }}>{d.weight}%</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 pt-2" style={{ borderTop: '1px solid #F0ECE9' }}>
              {verdicts.map(v => (
                <div key={v.label} className="flex items-center gap-2 text-xs">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.c, flexShrink: 0 }} />
                  <span style={{ color: 'rgba(26,30,35,.6)' }}>{v.label}</span>
                </div>
              ))}
            </div>
            {autoFails.length > 0 && (
              <p className="text-xs mt-3 pt-2 leading-relaxed" style={{ color: 'rgba(26,30,35,.5)', borderTop: '1px solid #F0ECE9' }}>
                Any of the {autoFails.length} auto-fail conditions forces a FAIL regardless of score.
              </p>
            )}
          </div>
        </div>
      )}
    </span>
  )
}
