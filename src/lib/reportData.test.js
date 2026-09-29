import test from 'node:test'
import assert from 'node:assert/strict'
import { filterReportScores, latestScoresByTicket, questionRows, scorecardSummary } from './reportData.js'

const now = Date.UTC(2026, 8, 29)
const base = { id: 'one', ticketId: 42, scoredAt: now - 10 * 86400000, agentIds: ['a'], effectiveScore: 80, effectiveVerdict: 'PASS' }

test('reports use the latest score for each ticket', () => {
  const older = { ...base, id: 'older', scoredAt: now - 20 * 86400000 }
  assert.deepEqual(latestScoresByTicket([older, base]), [base])
})

test('date and team filters use the requested event date', () => {
  const agents = [{ id: 'a', team_id: 1 }, { id: 'b', team_id: 2 }]
  const disputed = { ...base, disputeAt: now - 2 * 86400000 }
  assert.deepEqual(filterReportScores([disputed], agents, { days: '7', teamId: 1, dateField: 'disputeAt' }, now), [disputed])
  assert.deepEqual(filterReportScores([disputed], agents, { days: '7', teamId: 1 }, now), [])
  assert.deepEqual(filterReportScores([disputed], agents, { days: '7', teamId: 2, dateField: 'disputeAt' }, now), [])
})

test('missing ratings do not become zeroes', () => {
  const rubric = { dimensions: [{ id: 'resolution', name: 'Resolution', criteria: [{ id: 'answered', name: 'Answered' }] }] }
  const scores = [{ ...base, effectiveScore: null, fullScore: { scores: { resolution: { answered: { score: null } } } } }]
  assert.equal(scorecardSummary(scores).average, null)
  assert.equal(questionRows(scores, rubric)[0].count, 0)
})

test('question report counts valid rubric ratings', () => {
  const rubric = { dimensions: [{ id: 'resolution', name: 'Resolution', criteria: [{ id: 'answered', name: 'Answered' }] }] }
  const scores = [1, 2, 5].map((value, index) => ({ ...base, id: String(index), fullScore: { scores: { resolution: { answered: { score: value } } } } }))
  const [row] = questionRows(scores, rubric)
  assert.equal(row.count, 3)
  assert.equal(row.belowStandard, 2)
  assert.equal(row.average, 8 / 3)
})
