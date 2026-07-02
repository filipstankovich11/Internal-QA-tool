// Diff between two rubric configs.
// diffRubricDetailed → [{ label, before, after }] with the old/new values
// (before/after are null for pure adds/removes with nothing to compare).
// diffRubric → just the labels; stored as the revision summary and used in
// notifications.

const byId = (list) => Object.fromEntries((list || []).map(x => [x.id, x]))

export function diffRubricDetailed(prev = {}, next = {}) {
  const changes = []
  const push = (label, before = null, after = null) => changes.push({ label, before, after })

  // ── Dimensions (pillars) + their criteria ──
  const prevDims = byId(prev.dimensions)
  const nextDims = byId(next.dimensions)

  for (const d of next.dimensions || []) {
    const o = prevDims[d.id]
    if (!o) { push(`Added pillar “${d.name}” (${d.weight}%)`); continue }
    if (o.name !== d.name) push(`Renamed pillar “${o.name}” → “${d.name}”`, o.name, d.name)
    if (Number(o.weight) !== Number(d.weight)) push(`“${d.name}” weight ${o.weight}% → ${d.weight}%`, `${o.weight}%`, `${d.weight}%`)

    const prevCrit = byId(o.criteria)
    for (const c of d.criteria || []) {
      const co = prevCrit[c.id]
      if (!co) { push(`Added criterion “${c.name}” under ${d.name}`, null, c.description || null); continue }
      if (co.name !== c.name) push(`Renamed criterion “${co.name}” → “${c.name}”`, co.name, c.name)
      if ((co.description || '') !== (c.description || '')) {
        push(`Edited scoring guide for “${c.name}”`, co.description || '', c.description || '')
      }
    }
    for (const co of o.criteria || []) {
      if (!(d.criteria || []).some(c => c.id === co.id)) {
        push(`Removed criterion “${co.name}” from ${d.name}`, co.description || null, null)
      }
    }
  }
  for (const o of prev.dimensions || []) {
    if (!nextDims[o.id]) push(`Removed pillar “${o.name}”`)
  }

  // ── Auto-fail conditions ──
  const prevAf = byId(prev.auto_fail_conditions)
  const nextAf = byId(next.auto_fail_conditions)
  for (const c of next.auto_fail_conditions || []) {
    const co = prevAf[c.id]
    if (!co) { push(`Added auto-fail condition “${c.name}”`, null, c.description || null); continue }
    if (co.name !== c.name) push(`Renamed auto-fail “${co.name}” → “${c.name}”`, co.name, c.name)
    if ((co.description || '') !== (c.description || '')) {
      push(`Edited auto-fail “${c.name}”`, co.description || '', c.description || '')
    }
  }
  for (const co of prev.auto_fail_conditions || []) {
    if (!nextAf[co.id]) push(`Removed auto-fail condition “${co.name}”`, co.description || null, null)
  }

  // ── Verdict thresholds ──
  const pt = prev.verdict_thresholds || {}
  const nt = next.verdict_thresholds || {}
  if (Number(pt.pass) !== Number(nt.pass)) push(`Pass threshold ${pt.pass} → ${nt.pass}`, String(pt.pass), String(nt.pass))
  if (Number(pt.needs_review) !== Number(nt.needs_review)) push(`Review threshold ${pt.needs_review} → ${nt.needs_review}`, String(pt.needs_review), String(nt.needs_review))

  // ── Global scoring guidance free-text ──
  if ((prev.scoring_guidance || '') !== (next.scoring_guidance || '')) {
    push('Edited the global scoring guidance', prev.scoring_guidance || '', next.scoring_guidance || '')
  }

  return changes
}

export function diffRubric(prev = {}, next = {}) {
  return diffRubricDetailed(prev, next).map(c => c.label)
}
