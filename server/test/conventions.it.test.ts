import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
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
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * A repo-intel stub whose `getFileContents`/`getConventionSamples` serve a
 * fixed in-memory file map — no git clone needed. Every other method is a
 * trivial degraded stub; extract() only touches the two above.
 */
class StubRepoIntel implements RepoIntel {
  constructor(private files: Record<string, string>) {}
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
    return { changedSymbols: [], callers: [], impactedEndpoints: [] };
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
    return Object.keys(this.files);
  }
  async getFileContents(
    _repoId: string,
    paths: string[],
  ): Promise<{ path: string; content: string }[]> {
    return paths
      .filter((p) => this.files[p] !== undefined)
      .map((p) => ({ path: p, content: this.files[p]! }));
  }
  async getTopFilesByRank(): Promise<string[]> {
    return Object.keys(this.files);
  }
  async getCriticalPaths(): Promise<string[][]> {
    return [];
  }
}

const USERS_FILE = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
  '',
].join('\n'); // 7 lines

d('Conventions extractor', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        repoIntel: new StubRepoIntel({ 'src/api/users.ts': USERS_FILE }),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: {
              ConventionExtraction: {
                candidates: [
                  // valid: file exists, line range fits inside it
                  {
                    category: 'async-await',
                    rule: 'Always use async/await instead of .then() chains.',
                    evidence_path: 'src/api/users.ts',
                    evidence_line_start: 3,
                    evidence_line_end: 6,
                    evidence_snippet:
                      'export async function getUser(id: string) {\n  const user = await db.users.find(id);\n  return user;\n}',
                    confidence: 0.91,
                  },
                  // invalid: cites a file that was never in the sample
                  {
                    category: 'naming',
                    rule: 'Use camelCase for variables.',
                    evidence_path: 'src/api/missing.ts',
                    evidence_line_start: 1,
                    evidence_line_end: 2,
                    evidence_snippet: 'const x = 1;',
                    confidence: 0.5,
                  },
                  // invalid: line range exceeds the real file's length (7 lines)
                  {
                    category: 'error-handling',
                    rule: 'Always wrap awaits in try/catch.',
                    evidence_path: 'src/api/users.ts',
                    evidence_line_start: 10,
                    evidence_line_end: 20,
                    evidence_snippet: 'nonexistent',
                    confidence: 0.4,
                  },
                ],
              },
            },
          }),
        },
      },
    });
  }

  it('discards candidates whose evidence does not check out, persists the rest', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(201);
    const candidates = res.json();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      category: 'async-await',
      evidence_path: 'src/api/users.ts',
      evidence_line_start: 3,
      evidence_line_end: 6,
      status: 'pending',
    });
    await app.close();
  });

  it('lists persisted candidates and accept/reject flips status', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.statusCode).toBe(200);
    const rows = list.json();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const candidateId = rows[0].id as string;

    const accepted = await app.inject({
      method: 'POST',
      url: `/conventions/${candidateId}/accept`,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('accepted');

    const rejected = await app.inject({
      method: 'POST',
      url: `/conventions/${candidateId}/reject`,
    });
    expect(rejected.json().status).toBe('rejected');
    await app.close();
  });

  it('404s extract/list for a repo outside the workspace', async () => {
    const app = await makeApp();
    const bogusId = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${bogusId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
