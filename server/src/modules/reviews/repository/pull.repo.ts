import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentSource, PlanLinkStatus, PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';
import { isLowConfidence } from '../helpers.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db | Tx, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent (Intent Layer) -------------------------------------------------

/** Everything `IntentService` computes for one PR (`pr_id`/`computed_at` are
 *  assigned by the repository, not the caller). */
export type IntentUpsert = Omit<Intent, 'low_confidence'> & {
  model: string | null;
  computedForSha: string | null;
};

export async function upsertIntent(db: Db, prId: string, intent: IntentUpsert): Promise<void> {
  const values = {
    prId,
    summary: intent.summary,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    confidence: intent.confidence,
    sources: intent.sources,
    planLinkUrl: intent.plan_link_url,
    planLinkStatus: intent.plan_link_status,
    model: intent.model,
    computedForSha: intent.computedForSha,
    computedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: row.prId,
    summary: row.summary,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    low_confidence: isLowConfidence(row.confidence),
    sources: row.sources as IntentSource[],
    plan_link_url: row.planLinkUrl,
    plan_link_status: row.planLinkStatus as PlanLinkStatus,
    model: row.model,
    computed_for_sha: row.computedForSha,
    computed_at: row.computedAt.toISOString(),
  };
}
