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
