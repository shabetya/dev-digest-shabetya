import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta } from '@devdigest/shared';

/**
 * F1 — polling data-access layer. The ONLY place this module touches
 * `repos` / `pull_requests`.
 */

export type RepoRow = typeof t.repos.$inferSelect;

export class PollingRepository {
  constructor(private db: Db) {}

  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Idempotent import/refresh of one PR from GitHub's list payload (unique
   *  repo_id+number). Deliberately narrower than pulls/repository.ts's
   *  upsert — this sync never sets `openedAt`, matching the pre-refactor
   *  poll-only behavior (only the PR-list endpoint backfills that field). */
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

  async bumpLastPolledAt(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }
}
