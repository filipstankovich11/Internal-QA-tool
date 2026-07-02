// Human-readable diff between two rubric configs. Returns one string per
// change, e.g. `"Inquiry Resolution" weight 50% → 45%` — used for the
// revision history on the QA Guidance page and for change notifications.

const byId = (list) => Object.fromEntries((list || []).map(x => [x.id, x]))

export function diffRubric(prev = {}, next = {}) {
  const changes = []

  // ── Dimensions (pillars) + their criteria ──
  const prevDims = byId(prev.dimensions)
  const nextDims = byId(next.dimensions)

  for (const d of next.dimensions || []) {
    const o = prevDims[d.id]
    if (!o) { changes.push(`Added pillar “${d.name}” (${d.weight}%)`); continue }
    if (o.name !== d.name) changes.push(`Renamed pillar “${o.name}” → “${d.name}”`)
    if (Number(o.weight) !== Number(d.weight)) changes.push(`“${d.name}” weight ${o.weight}% → ${d.weight}%`)

    const prevCrit = byId(o.criteria)
    for (const c of d.criteria || []) {
      const co = prevCrit[c.id]
      if (!co) { changes.push(`Added criterion “${c.name}” under ${d.name}`); continue }
      if (co.name !== c.name) changes.push(`Renamed criterion “${co.name}” → “${c.name}”`)
      if ((co.description || '') !== (c.description || '')) changes.push(`Edited scoring guide for “${c.name}”`)
    }
    for (const co of o.criteria || []) {
      if (!(d.criteria || []).some(c => c.id === co.id)) changes.push(`Removed criterion “${co.name}” from ${d.name}`)
    }
  }
  for (const o of prev.dimensions || []) {
    if (!nextDims[o.id]) changes.push(`Removed pillar “${o.name}”`)
  }

  // ── Auto-fail conditions ──
  const prevAf = byId(prev.auto_fail_conditions)
  const nextAf = byId(next.auto_fail_conditions)
  for (const c of next.auto_fail_conditions || []) {
    const co = prevAf[c.id]
    if (!co) { changes.push(`Added auto-fail condition “${c.name}”`); continue }
    if (co.name !== c.name) changes.push(`Renamed auto-fail “${co.name}” → “${c.name}”`)
    if ((co.description || '') !== (c.description || '')) changes.push(`Edited auto-fail “${c.name}”`)
  }
  for (const co of prev.auto_fail_conditions || []) {
    if (!nextAf[co.id]) changes.push(`Removed auto-fail condition “${co.name}”`)
  }

  // ── Verdict thresholds ──
  const pt = prev.verdict_thresholds || {}
  const nt = next.verdict_thresholds || {}
  if (Number(pt.pass) !== Number(nt.pass)) changes.push(`Pass threshold ${pt.pass} → ${nt.pass}`)
  if (Number(pt.needs_review) !== Number(nt.needs_review)) changes.push(`Review threshold ${pt.needs_review} → ${nt.needs_review}`)

  // ── Global scoring guidance free-text ──
  if ((prev.scoring_guidance || '') !== (next.scoring_guidance || '')) {
    changes.push('Edited the global scoring guidance')
  }

  return changes
}
