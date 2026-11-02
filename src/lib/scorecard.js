// ── Scorecard rules — mirrors api/scorecard.py ───────────────────────────────
// Every surface that reads, edits, or totals a score goes through here so the
// in-app numbers match what the API stored. Supports the legacy 1–5 rubric and
// Support Scorecard V8 (0–5 scale, N/A questions, Q9 candidate-fail gate).
import SCORECARD_V8 from '../../api/scorecard_v8.json'

export { SCORECARD_V8 }

// The pre-V8 rubric — still needed to render and re-grade scores made with it.
export const LEGACY_RUBRIC_V7 = {
  dimensions: [
    {
      id: 'inquiry_resolution', name: 'Inquiry Resolution', weight: 50,
      criteria: [
        { id: 'core_inquiry_resolved',     name: 'Core Inquiry Resolution',   description: 'Does the agent fully address all customer questions, the root cause, and offer workarounds where applicable?\n- 5: All questions answered, root cause identified, limitations explained with workarounds offered, no roundabout answers\n- 4: Main inquiry resolved, minor gaps (e.g., one sub-question lightly addressed)\n- 3: Partially resolved — some questions unanswered or root cause not addressed\n- 2: Mostly missed the inquiry or provided incorrect/misleading info\n- 1: Failed to address the inquiry at all' },
        { id: 'troubleshooting_procedure', name: 'Troubleshooting Procedure', description: 'Did the agent follow proper troubleshooting steps and keep the client informed?\n- 5: Proper TS steps followed, client kept informed throughout, solution verified, all available tools used (KB, HC, Vitally, Loom, etc.)\n- 4: Good procedure with minor gaps (e.g., didn\'t share test ticket URL)\n- 3: Some steps followed but inconsistent or client left waiting without updates\n- 2: Poor procedure — jumped to conclusions, didn\'t verify solution, client uninformed\n- 1: No discernible troubleshooting procedure' },
        { id: 'forward_resolution',        name: 'Forward Resolution',        description: 'Did the agent empower the client to resolve future issues independently?\n- 5: Direct links to relevant HC articles/product pages, visual aids (screenshots/Loom), educational resources shared proactively\n- 4: Some resources shared but not fully tailored to the issue\n- 3: Minimal forward resolution — generic link or no link at all\n- 2: No educational value provided\n- 1: Agent left customer with no path forward' },
      ],
    },
    {
      id: 'internal_processes', name: 'Internal Processes', weight: 25,
      criteria: [
        { id: 'ticket_handling_procedure', name: 'Ticket Handling Procedure', description: 'Did the agent follow internal ticket handling guidelines?\n- 5: Proper escalation when needed, correct tagging/fields used, macros leveraged, documentation referenced, feedback passed on\n- 4: Mostly followed with minor gaps\n- 3: Some procedures followed but notable omissions\n- 2: Multiple procedural gaps — wrong escalation path, missing tags/fields\n- 1: Procedures not followed at all\n\nNote: If you cannot assess internal process adherence from the ticket content alone, score 3 (neutral) and note the limitation.' },
      ],
    },
    {
      id: 'customer_perception', name: 'Customer Perception', weight: 25,
      criteria: [
        { id: 'tone_professionalism',  name: 'Tone & Professionalism', description: 'How warm, empathetic, and professional was the agent throughout the interaction?\n- 5: Warm, empathetic, professional throughout — treats every interaction as an opportunity\n- 4: Generally professional with minor lapses\n- 3: Neutral — neither positive nor negative\n- 2: Somewhat cold, dismissive, or unprofessional\n- 1: Rude, disrespectful, or condescending' },
        { id: 'communication_clarity', name: 'Communication Clarity',  description: 'How clear, structured, and easy to follow were the agent\'s communications?\n- 5: Crystal clear, well-structured, easy to follow — instructions match the customer\'s level\n- 4: Generally clear with minor confusion\n- 3: Somewhat clear but could be significantly improved\n- 2: Confusing, poorly structured, or hard to follow\n- 1: Very unclear — customer would struggle to follow instructions' },
      ],
    },
  ],
  auto_fail_conditions: [
    { id: 'negative_account_billing_impact', name: 'Negative Account/Billing Impact', description: 'Changes/suggestions causing data loss, downtime, billing overages without warning (e.g., suggesting an auto-reply rule without warning about billing impact)' },
    { id: 'compliance_security_breach',      name: 'Compliance/Security Breach',      description: 'Sharing API keys, passwords, sensitive account info with unauthorized parties; not verifying customer identity before sharing account data; violating screen-recording protocols' },
    { id: 'harmful_incorrect_info',          name: 'Harmful/Incorrect Information',    description: 'Providing incorrect information that causes significant customer harm, financial loss, or public negative feedback (churn, public reviews)' },
    { id: 'communication_misconduct',        name: 'Communication Misconduct',         description: 'Profanity, discriminatory or offensive language, disclosing internal frustrations, blaming colleagues/the product to the customer' },
  ],
  verdict_thresholds: { pass: 80, needs_review: 60 },
  scoring_guidance: '',
}

export const scaleOf = rubric => ({ min: rubric?.scale?.min ?? 1, max: rubric?.scale?.max ?? 5 })
export const isCandidateGate = rubric => rubric?.fail_gate?.mode === 'candidate'

export function isNA(cell) {
  if (typeof cell === 'string') return ['N/A', 'NA', 'NOT APPLICABLE'].includes(cell.trim().toUpperCase())
  if (!cell || typeof cell !== 'object') return false
  return cell.na === true || (typeof cell.score === 'string' && isNA(cell.score))
}

// Label a criterion the way the scorecard does: "Q1 · Core inquiry" (V8) or just the name.
export const critLabel = crit => (crit.code ? `${crit.code} · ${crit.name}` : crit.name)

// The rubric a stored score was graded with. V8 scores are stamped with
// `scorecard.version`; unstamped scores predate V8 and use the 1–5 rubric.
export function scorecardFor(fullScore, rubric) {
  const version = fullScore?.scorecard?.version
  if (version === 'v8') return rubric?.version === 'v8' ? rubric : SCORECARD_V8
  if (!version && rubric?.version) return LEGACY_RUBRIC_V7
  return rubric
}

// Total from per-criterion values — `valueOf(criterion)` returns a number, 'NA',
// or null (unscored). N/A drops out of its section's average, redistributing its
// points within the section; an all-N/A section redistributes across sections.
export function computeTotal(rubric, valueOf) {
  const { min, max } = scaleOf(rubric)
  const sections = {}
  let earned = 0, applicable = 0
  for (const dim of rubric?.dimensions || []) {
    const vals = (dim.criteria || []).map(valueOf)
      .filter(v => v !== 'NA' && v != null && Number.isFinite(Number(v)))
      .map(v => Math.max(min, Math.min(max, Math.round(Number(v)))))
    if (!vals.length) { sections[dim.id] = { avg: null, points: null }; continue }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const points = avg / max * (dim.weight || 0)
    sections[dim.id] = { avg, points }
    earned += points
    applicable += dim.weight || 0
  }
  return { total: applicable ? earned / applicable * 100 : 0, sections }
}

// Verdict for a total. Under the V8 gate a triggered Q9 is a *candidate* fail
// (NEEDS_REVIEW) unless a human has confirmed it.
export function deriveVerdict(total, rubric, { gateTriggered = false, gateConfirmed = false } = {}) {
  const t = rubric?.verdict_thresholds || {}
  const pass = t.pass ?? 80
  const review = t.needs_review ?? 60
  if (gateTriggered && isCandidateGate(rubric)) return gateConfirmed ? 'FAIL' : 'NEEDS_REVIEW'
  if (gateTriggered || total < review) return 'FAIL'
  return total >= pass ? 'PASS' : 'NEEDS_REVIEW'
}

// A stored score whose Q9 was answered Yes and still awaits Quality + manager
// review (a human override — confirm or dismiss — resolves it).
export const isCandidateFail = (fullScore, record) =>
  !!fullScore?.auto_fail?.triggered && fullScore.auto_fail.status === 'candidate' &&
  !(record?.overrideVerdict ?? fullScore?.overrideVerdict)

// Normalized breakdown for display: sections in rubric order with their rows.
// Falls back to the score's own keys for anything the rubric doesn't describe.
export function breakdownSections(scores, rubric) {
  if (!scores || typeof scores !== 'object') return []
  const humanize = key => key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
  const rowOf = (id, cell, crit) => ({
    id, code: crit?.code || null, label: crit?.name || humanize(id),
    na: isNA(cell), score: isNA(cell) ? null : (cell?.score ?? null),
    notes: cell?.notes || '', confidence: cell?.confidence, evidence: cell?.evidence || [],
  })
  const isCell = (key, value) => !['dimension_average', 'weight', 'points'].includes(key) && value && typeof value === 'object'
  const known = new Map((rubric?.dimensions || []).map(d => [d.id, d]))
  const order = [...known.keys(), ...Object.keys(scores).filter(k => !known.has(k))]
  return order.filter(id => scores[id] && typeof scores[id] === 'object').map(id => {
    const block = scores[id]
    const dim = known.get(id)
    const crits = new Map((dim?.criteria || []).map(c => [c.id, c]))
    const keys = [...crits.keys(), ...Object.keys(block).filter(k => !crits.has(k))]
    const rows = keys.filter(k => isCell(k, block[k])).map(k => rowOf(k, block[k], crits.get(k)))
    const avg = Number(block.dimension_average)
    return {
      id, name: dim?.name || humanize(id),
      weight: dim?.weight ?? (Number.isFinite(Number(block.weight)) ? Math.round(Number(block.weight) * 100) : null),
      average: block.dimension_average != null && Number.isFinite(avg) ? avg : null,
      points: block.points != null ? Number(block.points) : null,
      rows,
    }
  }).filter(section => section.rows.length)
}

// Plain-language verdict bands for the live rubric (tooltips, legends).
export function verdictRanges(rubric) {
  const t = rubric?.verdict_thresholds || { pass: 80, needs_review: 60 }
  if (isCandidateGate(rubric)) {
    const gate = rubric.fail_gate?.code || 'Q9'
    return {
      PASS: `≥${t.pass}${t.pass_training ? ` (${t.pass_training} in training)` : ''}`,
      NEEDS_REVIEW: `<${t.pass} or ${gate} candidate`,
      FAIL: `${gate} confirmed`,
    }
  }
  return { PASS: `≥${t.pass}`, NEEDS_REVIEW: `${t.needs_review}–${t.pass - 1}`, FAIL: `<${t.needs_review}` }
}
