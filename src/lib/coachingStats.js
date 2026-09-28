export const STRENGTH_MIN_SCORE = 4
export const STRENGTH_MIN_EVIDENCE = 3

export function finiteScore(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function isMeaningfulStrength(stat) {
  return stat?.avg >= STRENGTH_MIN_SCORE && stat?.n >= STRENGTH_MIN_EVIDENCE
}
