/**
 * GET /pulls/:id/smart-diff — files grouped by role, with inline finding
 * lines from the LATEST review only. Gated on Docker (needs Postgres to
 * resolve the PR/repo/files/reviews rows), matching the other integration
 * tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setupRepoAndPr(files: { path: string; additions: number; deletions: number }[]) {
    const name = `smart-diff-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + repoSeq,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: files.reduce((n, f) => n + f.additions, 0),
        deletions: files.reduce((n, f) => n + f.deletions, 0),
        filesCount: files.length,
        status: 'needs_review',
      })
      .returning();
    if (files.length > 0) {
      await pg.handle.db.insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f })));
    }
    return { repo: repo!, pr: pr! };
  }

  it('always returns all 5 role groups in fixed order, even when some are empty', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr([{ path: 'src/service.ts', additions: 10, deletions: 0 }]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    const roles = body.groups.map((g) => g.role);
    expect(roles).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const byRole = Object.fromEntries(body.groups.map((g) => [g.role, g.files])) as Record<
      SmartDiffRole,
      SmartDiff['groups'][number]['files']
    >;
    expect(byRole.core).toHaveLength(1);
    expect(byRole.core[0]!.path).toBe('src/service.ts');
    expect(byRole.tests).toEqual([]);
    expect(byRole.wiring).toEqual([]);
    expect(byRole.docs).toEqual([]);
    expect(byRole.boilerplate).toEqual([]);

    await app.close();
  });

  it('classifies files by role and reports sorted, deduped finding_lines from the LATEST review only', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr([
      { path: 'src/service.ts', additions: 10, deletions: 0 },
      { path: 'src/service.test.ts', additions: 5, deletions: 0 },
      { path: 'README.md', additions: 2, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 100, deletions: 0 },
    ]);

    // Older (superseded) review — its findings must NOT appear in the result.
    const oldReview = await app.container.reviewRepo.insertReview({
      workspaceId,
      prId: pr.id,
      agentId: null,
      runId: null,
      kind: 'review',
      verdict: 'comment',
      summary: 'old pass',
      score: 80,
      model: 'test-model',
    });
    await app.container.reviewRepo.insertFindings(oldReview.id, [
      {
        id: 'old-1',
        severity: 'WARNING',
        category: 'bug',
        title: 'Stale finding',
        file: 'src/service.ts',
        start_line: 1,
        end_line: 1,
        rationale: 'should not appear',
        confidence: 0.5,
        kind: 'finding',
      },
    ]);

    // Latest review — its findings (deduped/sorted) ARE the ones returned.
    const latestReview = await app.container.reviewRepo.insertReview({
      workspaceId,
      prId: pr.id,
      agentId: null,
      runId: null,
      kind: 'review',
      verdict: 'request_changes',
      summary: 'latest pass',
      score: 40,
      model: 'test-model',
    });
    await app.container.reviewRepo.insertFindings(latestReview.id, [
      {
        id: 'new-1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Finding A',
        file: 'src/service.ts',
        start_line: 12,
        end_line: 12,
        rationale: 'r',
        confidence: 0.9,
        kind: 'finding',
      },
      {
        id: 'new-2',
        severity: 'WARNING',
        category: 'bug',
        title: 'Finding B (duplicate line)',
        file: 'src/service.ts',
        start_line: 12,
        end_line: 12,
        rationale: 'r',
        confidence: 0.6,
        kind: 'finding',
      },
      {
        id: 'new-3',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Finding C',
        file: 'src/service.ts',
        start_line: 5,
        end_line: 5,
        rationale: 'r',
        confidence: 0.4,
        kind: 'finding',
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;
    const byRole = Object.fromEntries(body.groups.map((g) => [g.role, g.files])) as Record<
      SmartDiffRole,
      SmartDiff['groups'][number]['files']
    >;

    expect(byRole.core.map((f) => f.path)).toEqual(['src/service.ts']);
    // Sorted ascending + deduped (two findings share line 12).
    expect(byRole.core[0]!.finding_lines).toEqual([5, 12]);

    expect(byRole.tests.map((f) => f.path)).toEqual(['src/service.test.ts']);
    expect(byRole.docs.map((f) => f.path)).toEqual(['README.md']);
    expect(byRole.boilerplate.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);

    await app.close();
  });

  it('404s for a PR outside the caller workspace (workspace-scoping guard)', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const bogusId = '00000000-0000-0000-0000-000000000000';

    const res = await app.inject({ method: 'GET', url: `/pulls/${bogusId}/smart-diff` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
