// A score belongs in the Review Queue when it needs human attention: it's
// disputed, or (not yet overridden) it's a NEEDS_REVIEW, or an unacknowledged FAIL.
// Once a reviewer marks it reviewed, it leaves the queue regardless of verdict.
// Single source of truth shared by the Review Queue, My Queue, and the sidebar badge.
export function isInReviewQueue(s) {
  if (s.reviewedAt) return false
  return s.disputed || (!s.overrideVerdict && (
    s.effectiveVerdict === 'NEEDS_REVIEW' ||
    (s.effectiveVerdict === 'FAIL' && !s.acknowledged)
  ))
}
