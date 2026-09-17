/**
 * F1 — pulls module constants.
 */

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 * with zeroed size/diff. The list endpoint backfills them once from the detail
 * endpoint (capped per request — each backfill is a detail fetch); the
 * periodic refetch (POST /repos/:id/poll) chips away at any remainder.
 */
export const DIFF_STAT_BACKFILL_LIMIT = 10;
