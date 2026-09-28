import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PriorPr } from '@devdigest/shared';

/**
 * Prior PRs (in the same repo) that touched one of the current PR's files —
 * cross-PR history for Blast Radius's "Prior PRs touching these files" panel.
 * `blast/service.ts` already reaches `pull_requests`/`pr_files` through
 * `container.reviewRepo` (see `getPull`/`getPrFiles`), so this query lives
 * alongside its sibling `*.repo.ts` files and is exposed through that same
 * container-wired facade, rather than standing up a second, independently
 * constructed repository the caller would have to reach for instead.
 */
export async function priorPrsTouchingFiles(
  db: Db,
  args: { repoId: string; excludePrId: string; filePaths: string[]; limit: number },
): Promise<PriorPr[]> {
  const { repoId, excludePrId, filePaths, limit } = args;
  if (filePaths.length === 0) return [];

  const rows = await db
    .select({
      id: t.pullRequests.id,
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      author: t.pullRequests.author,
      updatedAt: t.pullRequests.updatedAt,
    })
    .from(t.pullRequests)
    .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
    .where(
      and(
        eq(t.pullRequests.repoId, repoId),
        ne(t.pullRequests.id, excludePrId),
        inArray(t.prFiles.path, filePaths),
      ),
    )
    // A nullable column defaults to NULLS FIRST under DESC in Postgres —
    // push nulls (pre-sync seed data with no `updated_at`) to the end instead.
    .orderBy(sql`${t.pullRequests.updatedAt} DESC NULLS LAST`);

  // A PR can appear once per matched file path — dedupe to one row per PR.
  // Rows are already newest-first, so first-seen-per-id wins. Mirrors the
  // pattern in `pulls/repository.ts`'s `latestReviewsForPulls` (re-implemented
  // locally; that method isn't importable across modules).
  const byPr = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byPr.has(row.id)) byPr.set(row.id, row);
  }
  const matched = [...byPr.values()].slice(0, limit);
  if (matched.length === 0) return [];

  const prIds = matched.map((r) => r.id);
  const reviewRows = await db
    .select({ prId: t.reviews.prId, summary: t.reviews.summary })
    .from(t.reviews)
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt));
  // Newest-first rows → first-seen-per-PR wins (its latest completed review).
  const takeawayByPr = new Map<string, string | null>();
  for (const r of reviewRows) {
    if (!takeawayByPr.has(r.prId)) takeawayByPr.set(r.prId, r.summary);
  }

  return matched.map((r) => ({
    number: r.number,
    title: r.title,
    author: r.author,
    date: r.updatedAt ? r.updatedAt.toISOString() : null,
    takeaway: takeawayByPr.get(r.id) ?? null,
  }));
}
