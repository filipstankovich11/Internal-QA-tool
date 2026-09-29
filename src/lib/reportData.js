const DAY = 86400000

export function latestScoresByTicket(scores) {
  const latest = new Map()
  for (const score of scores) {
    const key = score.ticketId == null ? score.id : String(score.ticketId)
    const previous = latest.get(key)
    if (!previous || score.scoredAt > previous.scoredAt) latest.set(key, score)
  }
  return [...latest.values()]
}

export function filterReportScores(scores, agents, { days, teamId, dateField = 'scoredAt' }, now = Date.now()) {
  const teamAgentIds = teamId === 'all'
    ? null
    : new Set(agents.filter(agent => String(agent.team_id) === String(teamId)).map(agent => agent.id))
  const cutoff = days === 'all' ? null : now - Number(days) * DAY
  return scores.filter(score => {
    if (teamAgentIds && !score.agentIds?.some(id => teamAgentIds.has(id))) return false
    const timestamp = score[dateField]
    return cutoff === null || (Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now)
  })
}

export function scorecardSummary(scores) {
  const valid = scores.map(s => s.effectiveScore == null ? null : Number(s.effectiveScore))
    .filter(value => value !== null && Number.isFinite(value))
  const verdicts = { PASS: 0, NEEDS_REVIEW: 0, FAIL: 0 }
  for (const score of scores) {
    if (Object.hasOwn(verdicts, score.effectiveVerdict)) verdicts[score.effectiveVerdict]++
  }
  return {
    count: scores.length,
    average: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null,
    verdicts,
    passRate: scores.length ? verdicts.PASS / scores.length * 100 : null,
  }
}

export function questionRows(scores, rubric) {
  return (rubric?.dimensions || []).flatMap(dimension =>
    (dimension.criteria || []).map(criterion => {
      const entries = scores.map(score => {
        const raw = score.fullScore?.scores?.[dimension.id]?.[criterion.id]?.score
        return raw == null ? null : Number(raw)
      }).filter(value => value !== null && Number.isFinite(value) && value >= 1 && value <= 5)
      return {
        id: `${dimension.id}:${criterion.id}`,
        dimensionId: dimension.id,
        criterionId: criterion.id,
        name: criterion.name,
        dimension: dimension.name,
        count: entries.length,
        average: entries.length ? entries.reduce((sum, value) => sum + value, 0) / entries.length : null,
        belowStandard: entries.filter(value => value <= 2).length,
      }
    })
  )
}
