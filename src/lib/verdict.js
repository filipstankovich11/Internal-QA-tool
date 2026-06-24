// ── Verdict (status) color tokens — single source of truth ───────────────────
// The semantic layer for PASS / NEEDS_REVIEW / FAIL. Change the three core hexes
// below (e.g. to the Axiom success / warning / danger tokens) and every verdict
// color across the app updates from one place. Variants (bg / border / wash) are
// derived from the core hexes so they stay in sync automatically.
//
//   PASS → success   ·   NEEDS_REVIEW → warning   ·   FAIL → danger
//
// Gorgias chart palette (eyedropped — approximate until exact tokens are dropped
// in). Gorgias has no green in this set, so PASS uses the Gorgias primary blue.
const SUCCESS = '#4f90f5' // Gorgias blue   → PASS
const WARNING = '#e08f3c' // Gorgias orange → REVIEW
const DANGER  = '#e34d63' // Gorgias red    → FAIL

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export const VERDICT_COLOR  = { PASS: SUCCESS, NEEDS_REVIEW: WARNING, FAIL: DANGER }
export const VERDICT_BG     = { PASS: rgba(SUCCESS, 0.12), NEEDS_REVIEW: rgba(WARNING, 0.12), FAIL: rgba(DANGER, 0.12) }
export const VERDICT_BORDER = { PASS: rgba(SUCCESS, 0.25), NEEDS_REVIEW: rgba(WARNING, 0.25), FAIL: rgba(DANGER, 0.25) }
export const VERDICT_WASH   = { PASS: rgba(SUCCESS, 0.06), NEEDS_REVIEW: rgba(WARNING, 0.06), FAIL: rgba(DANGER, 0.06) }
export const VERDICT_LABEL  = { PASS: 'PASS', NEEDS_REVIEW: 'REVIEW', FAIL: 'FAIL' }
export const VERDICTS       = ['PASS', 'NEEDS_REVIEW', 'FAIL']

// ── Grade (traffic-light) colors ─────────────────────────────────────────────
// For a continuous 0–100 value (an agent's average, a pass rate). This is a
// deliberately DIFFERENT semantic from the categorical verdict palette above —
// a grade reads naturally as green→amber→red, so it stays visually distinct from
// the PASS/REVIEW/FAIL tokens. Bands default to 80/60 but callers pass the live
// rubric thresholds so the colors track however the rubric is configured.
export const GRADE = { good: '#2F8F5B', ok: '#C8841E', bad: '#D14B3D', none: 'rgba(26,30,35,.45)' }

export function gradeColor(value, thresholds) {
  if (value == null) return GRADE.none
  // Default per-field so a partial/empty thresholds object (e.g. mid-edit rubric)
  // never produces `value >= undefined` → wrong color.
  const pass        = thresholds?.pass ?? 80
  const needsReview = thresholds?.needs_review ?? 60
  return value >= pass ? GRADE.good : value >= needsReview ? GRADE.ok : GRADE.bad
}

// Plain-language verdict meanings — single source for the per-ticket status tooltips.
export const VERDICT_DESC = { PASS: 'Met the bar', NEEDS_REVIEW: 'Needs a human look', FAIL: 'Below standard or auto-fail' }
