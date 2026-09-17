import type { Container } from '../../platform/container.js';
import type { GitHubClient, PrMeta, PrDetail, PrReviewComment, PrCommentInput } from '@devdigest/shared';
import { NotFoundError, AppError } from '../../platform/errors.js';
import { PullsRepository, type PullRow, type RepoRow } from './repository.js';
import { deriveReviewStatus } from './status.js';
import { DIFF_STAT_BACKFILL_LIMIT } from './constants.js';

/** Minimal structured logger (pino-compatible: (obj, msg)) — same shape as
 *  `ReviewRunExecutor`'s `Logger`, kept optional so unit tests can omit it. */
export type Logger = {
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * F1 — pulls service. Business logic for the Pull Requests feature:
 *   - idempotent GitHub PR-list import + diff-stat backfill (capped)
 *   - per-PR latest-review score / findings-severity aggregation
 *   - PR detail refresh (files/commits/body) with an offline fallback
 *   - inline review-comment proxying (GET/POST, no local persistence)
 *
 * No HTTP and no raw SQL live here — persistence goes through PullsRepository,
 * pure status derivation through status.ts, literals through constants.ts.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   * List PRs for a repo: local-first (never fails the read when GitHub is
   * unavailable), syncing + backfilling diff stats when a token IS configured,
   * then mapping in each PR's latest-review score + findings breakdown.
   */
  async listForRepo(workspaceId: string, repoId: string, logger?: Logger): Promise<PrMeta[]> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.tryGitHub(logger, 'serving persisted PRs');

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.repo.upsertFromList(workspaceId, repo.id, pr);
        }
      } catch (err) {
        logger?.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listForRepo(repo.id);

    if (gh) {
      await this.backfillDiffStats(gh, repo, rows, logger);
    }

    return this.toPrMetaList(rows);
  }

  /** Diff-stat backfill (capped) for PRs the list import couldn't size. */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: RepoRow,
    rows: PullRow[],
    logger?: Logger,
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, DIFF_STAT_BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        await this.repo.backfillDiffStats(r.id, {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
        r.additions = detail.additions;
        r.deletions = detail.deletions;
        r.filesCount = detail.files_count;
      } catch (err) {
        logger?.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /**
   * Latest-review SCORE per PR for the list's score ring, plus its per-
   * severity FINDINGS breakdown for the list's findings badges. Computed on
   * read from reviews (no FK denorm); the list is small, so one IN-query +
   * grouping is cheap per lookup.
   */
  private async toPrMetaList(rows: PullRow[]): Promise<PrMeta[]> {
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = await this.repo.latestReviewsForPulls(prIds);
    const reviewIds = [...latestReviewByPr.values()].map((v) => v.reviewId);
    const countsByReviewId = await this.repo.severityCountsForReviews(reviewIds);

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: review ? review.costUsd : null,
        findings: review
          ? (countsByReviewId.get(review.reviewId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 })
          : null,
      };
    });
  }

  /**
   * Full PR detail (diff/files, commits, body). Refreshes from GitHub when a
   * token is configured; otherwise (or on any GitHub error) serves the
   * persisted files/commits/body so PR detail works offline.
   */
  async getDetail(workspaceId: string, prId: string, logger?: Logger): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePullAndRepo(workspaceId, prId);

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.replaceDetail(pr.id, {
        files: detail.files,
        commits: detail.commits,
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // the detail fetch so the Pull Requests list shows real size/files.
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      logger?.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const [files, commits] = await Promise.all([
        this.repo.getPrFiles(pr.id),
        this.repo.getPrCommits(pr.id),
      ]);
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  /** Resolve a PR + its repo, workspace-scoped. Shared by the detail and
   *  inline-comments routes. */
  async resolvePullAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: RepoRow }> {
    const pr = await this.repo.getPullInWorkspace(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  // ---- Inline review comments (Files changed tab) --------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.

  async listComments(
    workspaceId: string,
    prId: string,
    logger?: Logger,
  ): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePullAndRepo(workspaceId, prId);
    const gh = await this.tryGitHub(logger, 'serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      logger?.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePullAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  /** Resolve the GitHub client, degrading to `null` (never throwing) when no
   *  token is configured / the client can't be built — every caller here is
   *  local-first and must keep working offline. */
  private async tryGitHub(logger: Logger | undefined, fallbackMsg: string): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      logger?.warn({ err }, `GitHub client unavailable (no token / offline); ${fallbackMsg}`);
      return null;
    }
  }
}
