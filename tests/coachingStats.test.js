import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STRENGTH_MIN_EVIDENCE,
  STRENGTH_MIN_SCORE,
  finiteScore,
  isMeaningfulStrength,
} from '../src/lib/coachingStats.js'

test('finiteScore excludes missing and blank criterion values', () => {
  for (const value of [null, undefined, '', '   ', 'not scored']) {
    assert.equal(finiteScore(value), null)
  }
})

test('finiteScore preserves real numeric scores, including zero', () => {
  assert.equal(finiteScore(0), 0)
  assert.equal(finiteScore('4.5'), 4.5)
})

test('strengths require both a meaningful score and enough evidence', () => {
  assert.equal(isMeaningfulStrength({ avg: STRENGTH_MIN_SCORE, n: STRENGTH_MIN_EVIDENCE }), true)
  assert.equal(isMeaningfulStrength({ avg: STRENGTH_MIN_SCORE - 0.1, n: STRENGTH_MIN_EVIDENCE }), false)
  assert.equal(isMeaningfulStrength({ avg: STRENGTH_MIN_SCORE + 0.5, n: STRENGTH_MIN_EVIDENCE - 1 }), false)
})
