// Reviewer ticket claims. A claim auto-releases after this TTL so a ticket left
// claimed by someone who's away (e.g. on holiday) frees up on its own — enforced
// client-side, so no server cron is needed.
export const CLAIM_TTL_MS = 7 * 86400000 // 7 days

// A persisted claim only counts while it's within the TTL; stale claims are
// treated as released everywhere.
export function isClaimActive(score, now = Date.now()) {
  return !!score?.claimedBy && score.claimedAt != null && (now - score.claimedAt) < CLAIM_TTL_MS
}
