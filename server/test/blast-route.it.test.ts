/**
 * GET /pulls/:id/blast — read-only, pre-calculated blast-radius impact map.
 * All data comes from `container.repoIntel.getBlastRadius`; nothing here runs
 * fresh analysis or calls an LLM. Gated on Docker (needs Postgres to resolve
 * the PR/repo/files rows), matching the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import type {
  RepoIntel,
  IndexResult,
  IndexState,
  BlastResult,
  RepoMapResult,
  FileRankRow,
  SymbolRow,
  SignatureRow,
  RefRow,
} from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A repo-intel stub whose `getBlastRadius` returns a fixed, injected
 *  `BlastResult` — every other method is a trivial degraded stub, unused by
 *  this route. */
class StubRepoIntel implements RepoIntel {
  constructor(private result: BlastResult) {}
  async indexRepo(): Promise<IndexResult> {
    return { status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
  }
  async refreshIndex(): Promise<IndexResult> {
    return { status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      status: 'full',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      repoId,
      lastIndexedSha: '',
      indexerVersion: 1,
      updatedAt: new Date(),
    };
  }
  async getBlastRadius(): Promise<BlastResult> {
    return this.result;
  }
  async getRepoMap(): Promise<RepoMapResult> {
    return { text: '', tokens: 0, cached: false };
  }
  async getFileRank(): Promise<FileRankRow[]> {
    return [];
  }
  async getSymbolsInFiles(): Promise<SymbolRow[]> {
    return [];
  }
  async getCallerSignatures(): Promise<SignatureRow[]> {
    return [];
  }
  async getUnresolvedReferences(): Promise<RefRow[]> {
    return [];
  }
  async getConventionSamples(): Promise<string[]> {
    return [];
  }
  async getFileContents(): Promise<{ path: string; content: string }[]> {
    return [];
  }
  async getTopFilesByRank(): Promise<string[]> {
    return [];
  }
  async getCriticalPaths(): Promise<string[][]> {
    return [];
  }
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  async function setupRepoAndPr() {
    const name = `blast-${repoSeq++}`;
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
        title: 'Rework payments',
        author: 'marisa.koch',
        branch: 'feat/payments',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 10,
        deletions: 2,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  function makeApp(repoIntel: RepoIntel) {
    return buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel } });
  }

  it('returns a degraded response (never throws) when there is no repo-intel data', async () => {
    const app = await makeApp(
      new StubRepoIntel({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      }),
    );
    const { pr } = await setupRepoAndPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadiusResponse;
    expect(body.degraded).toBe(true);
    expect(body.degraded_reason).toBe('no_data');
    expect(body.changed_symbols).toEqual([]);
    expect(body.downstream).toEqual([]);

    await app.close();
  });

  it('treats "flag_off" (REPO_INTEL_ENABLED=false) as a normal degraded case, not a special error path', async () => {
    const app = await makeApp(
      new StubRepoIntel({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'flag_off',
      }),
    );
    const { pr } = await setupRepoAndPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadiusResponse;
    expect(body.degraded).toBe(true);
    expect(body.degraded_reason).toBe('flag_off');

    await app.close();
  });

  it('404s for a PR outside the caller workspace (workspace-scoping guard)', async () => {
    const app = await makeApp(
      new StubRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
    );
    const bogusId = '00000000-0000-0000-0000-000000000000';

    const res = await app.inject({ method: 'GET', url: `/pulls/${bogusId}/blast` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('groups callers by symbol, aggregates endpoints/crons per group, and includes a zero-caller symbol', async () => {
    const fakeResult: BlastResult = {
      changedSymbols: [
        { file: 'src/service.ts', name: 'chargeCard', kind: 'function' },
        { file: 'src/service.ts', name: 'refundCard', kind: 'function' },
        { file: 'src/service.ts', name: 'unusedHelper', kind: 'function' },
      ],
      callers: [
        { file: 'src/routes/payments.ts', symbol: 'handlePayment', viaSymbol: 'chargeCard', line: 10, rank: 5 },
        {
          file: 'src/jobs/retryJob.ts',
          symbol: 'retryFailedCharges',
          viaSymbol: 'chargeCard',
          line: 22,
          rank: 2,
        },
        { file: 'src/routes/refunds.ts', symbol: 'handleRefund', viaSymbol: 'refundCard', line: 8, rank: 5 },
      ],
      impactedEndpoints: ['POST /payments', 'POST /refunds'],
      factsByFile: {
        'src/routes/payments.ts': { endpoints: ['POST /payments'], crons: [] },
        'src/jobs/retryJob.ts': { endpoints: [], crons: ['retry-failed-charges'] },
        'src/routes/refunds.ts': { endpoints: ['POST /refunds'], crons: [] },
      },
      degraded: false,
    };
    const app = await makeApp(new StubRepoIntel(fakeResult));
    const { pr } = await setupRepoAndPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadiusResponse;

    expect(body.degraded).toBe(false);
    expect(body.degraded_reason).toBeNull();
    expect(body.changed_symbols).toEqual([
      { name: 'chargeCard', file: 'src/service.ts', kind: 'function' },
      { name: 'refundCard', file: 'src/service.ts', kind: 'function' },
      { name: 'unusedHelper', file: 'src/service.ts', kind: 'function' },
    ]);

    expect(body.downstream).toHaveLength(3);
    const bySymbol = Object.fromEntries(body.downstream.map((d) => [d.symbol, d]));

    expect(bySymbol.chargeCard!.callers).toEqual([
      { name: 'handlePayment', file: 'src/routes/payments.ts', line: 10 },
      { name: 'retryFailedCharges', file: 'src/jobs/retryJob.ts', line: 22 },
    ]);
    expect(bySymbol.chargeCard!.endpoints_affected).toEqual(['POST /payments']);
    expect(bySymbol.chargeCard!.crons_affected).toEqual(['retry-failed-charges']);

    expect(bySymbol.refundCard!.callers).toEqual([
      { name: 'handleRefund', file: 'src/routes/refunds.ts', line: 8 },
    ]);
    expect(bySymbol.refundCard!.endpoints_affected).toEqual(['POST /refunds']);
    expect(bySymbol.refundCard!.crons_affected).toEqual([]);

    // Zero-caller symbol is present, not omitted.
    expect(bySymbol.unusedHelper!.callers).toEqual([]);
    expect(bySymbol.unusedHelper!.endpoints_affected).toEqual([]);
    expect(bySymbol.unusedHelper!.crons_affected).toEqual([]);

    expect(body.summary).toBe('3 changed symbol(s), 3 caller(s), 2 endpoint(s)/1 cron(s) affected.');

    await app.close();
  });
});
