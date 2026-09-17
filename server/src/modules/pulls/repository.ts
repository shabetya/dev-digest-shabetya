import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta } from '@devdigest/shared';

/**
 * F1 — pulls data-access layer. The ONLY place that touches `pull_requests`,
 * `pr_files`, and `pr_commits` for this module. Queries that originate from a
 * repo/PR lookup are workspace-scoped via `pull_requests.workspace_id` /
 * `repos.workspace_id`.
 */

export type PullRow = typeof t.pullRequests.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;

export interface LatestReview {
  reviewId: string;
  score: number | null;
  costUsd: number | null;
}

export interface SeverityCounts {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

export interface PrDetailForPersist {
  files: { path: string; additions: number; deletions: number; patch?: string | null }[];
  commits: { sha: string; message: string; author: string; committed_at?: string | null }[];
  body: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
}

export class PullsRepository {
  constructor(private db: Db) {}

  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async getPullInWorkspace(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listForRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /** Idempotent import/refresh of one PR from GitHub's list payload (unique repo_id+number). */
  async upsertFromList(workspaceId: string, repoId: string, pr: PrMeta): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  async backfillDiffStats(
    prId: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  /** Latest 'review'-kind review (+ its run cost) per PR, for the list rollup. */
  async latestReviewsForPulls(prIds: string[]): Promise<Map<string, LatestReview>> {
    const out = new Map<string, LatestReview>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({
        prId: t.reviews.prId,
        reviewId: t.reviews.id,
        score: t.reviews.score,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.reviews)
      .leftJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    // Rows are newest-first → first seen per PR is the latest review.
    for (const rv of rows) {
      if (!out.has(rv.prId)) {
        out.set(rv.prId, { reviewId: rv.reviewId, score: rv.score, costUsd: rv.costUsd });
      }
    }
    return out;
  }

  /** Per-review severity counts for the given reviews (findings-badge rollup). */
  async severityCountsForReviews(reviewIds: string[]): Promise<Map<string, SeverityCounts>> {
    const out = new Map<string, SeverityCounts>();
    if (reviewIds.length === 0) return out;
    const rows = await this.db
      .select({ reviewId: t.findings.reviewId, severity: t.findings.severity })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
    for (const f of rows) {
      const counts = out.get(f.reviewId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
      if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
        counts[f.severity] += 1;
      }
      out.set(f.reviewId, counts);
    }
    return out;
  }

  async getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async getPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /**
   * Replace a PR's files + commits from a fresh GitHub detail fetch, and
   * update its body/diff-stat columns — one transaction so a failure partway
   * through can't leave stale files next to fresh commits (or vice versa).
   */
  async replaceDetail(prId: string, detail: PrDetailForPersist): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body,
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.filesCount,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }
}
