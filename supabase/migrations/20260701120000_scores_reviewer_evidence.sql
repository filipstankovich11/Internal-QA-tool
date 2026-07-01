-- Reviewer-tagged evidence: { [criterionId]: [messageId, ...] }, set while a
-- human reviewer overrides/edits a score. Separate from the AI's own
-- per-criterion `evidence` (stored inside full_score), so the AI's citations
-- stay untouched as an audit trail.
ALTER TABLE scores ADD COLUMN IF NOT EXISTS reviewer_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
