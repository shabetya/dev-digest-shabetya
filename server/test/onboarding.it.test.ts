import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  IndexStatus,
  BlastResult,
  RepoMapResult,
  FileRankRow,
  SymbolRow,
  SignatureRow,
  RefRow,
} from '../src/modules/repo-intel/types.js';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

class StubRepoIntel implements RepoIntel {
  constructor(private status: IndexStatus = 'full') {}
  async indexRepo(): Promise<IndexResult> {
    return { status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
  }
  async refreshIndex(): Promise<IndexResult> {
    return { status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      status: this.status,
      filesIndexed: 42,
      filesSkipped: 0,
      durationMs: 0,
      repoId,
      lastIndexedSha: 'abc',
      indexerVersion: 1,
      updatedAt: new Date(),
    };
  }
  async getBlastRadius(_repoId: string, files: string[]): Promise<BlastResult> {
    return {
      changedSymbols: [],
      callers: [
        { file: 'src/db.ts', symbol: 'x', viaSymbol: 'y', line: 1, rank: 0 },
        { file: 'src/db.ts', symbol: 'z', viaSymbol: 'y', line: 2, rank: 0 },
        { file: files[0]!, symbol: 'self', viaSymbol: 'y', line: 3, rank: 0 },
      ],
      impactedEndpoints: [],
    };
  }
  async getRepoMap(): Promise<RepoMapResult> {
    return { text: 'src/app.ts\nsrc/db.ts', tokens: 5, cached: true };
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
    return ['src/app.ts', 'src/db.ts', 'src/ghost.ts'];
  }
  async getCriticalPaths(): Promise<string[][]> {
    return [['src/app.ts', 'src/db.ts']];
  }
}

const TOUR = {
  architecture: {
    prose: 'Entry is `src/app.ts`; ignore `src/ghost.ts`.',
    nodes: [
      { id: 'web', label: 'Web', kind: 'client' as const },
      { id: 'api', label: 'API', kind: 'server' as const, file: 'src/app.ts' },
      { id: 'ghost', label: 'Ghost', kind: 'other' as const, file: 'src/ghost.ts' },
    ],
    edges: [
      { from: 'web', to: 'api', label: 'HTTP' },
      { from: 'api', to: 'ghost' },
    ],
  },
  critical_paths: [
    { path: 'src/app.ts', description: 'entry' },
    { path: 'src/invented.ts', description: 'not a seed' },
  ],
  run_locally: [
    { command: 'pnpm install', comment: 'deps' },
    { command: 'pnpm dev' },
    { command: 'pnpm run ghost' },
    { command: 'pnpm dev\nrm -rf /' },
  ],
  reading_path: [
    { path: 'src/app.ts', reason: 'start' },
    { path: 'src/ghost.ts', reason: 'nope' },
  ],
  first_tasks: [
    { title: 'Add tests', description: 'd', files: ['src/db.ts', 'src/ghost.ts'] },
    { title: 'Bad', description: 'd', files: ['src/ghost.ts'] },
  ],
};

/** LLM double: optional gate to hold a call open, optional forced failure. */
class ControlledLLM extends MockLLMProvider {
  public fail = false;
  public gate: Promise<void> | null = null;
  public startedCount = 0;
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.startedCount++;
    if (this.gate) await this.gate;
    if (this.fail) throw new Error('provider down');
    return super.completeStructured(req);
  }
}

d('Onboarding tour', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let cloneDir: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    cloneDir = await mkdtemp(join(tmpdir(), 'onb-clone-'));
    await mkdir(join(cloneDir, 'src'), { recursive: true });
    await writeFile(join(cloneDir, 'src/app.ts'), '// TODO: wire up\nexport {};\n');
    await writeFile(join(cloneDir, 'src/db.ts'), 'export {};\n');
    await writeFile(join(cloneDir, 'README.md'), '# demo\nRun `pnpm dev`.\n');
    await writeFile(join(cloneDir, 'package.json'), JSON.stringify({ scripts: { dev: 'x' } }));
    await pg.handle.db.update(t.repos).set({ clonePath: cloneDir }).where(eq(t.repos.id, repoId));
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  async function makeApp(opts: { llm?: ControlledLLM; status?: IndexStatus; env?: Record<string, string> } = {}) {
    const llm = opts.llm ?? new ControlledLLM('openai', { structured: TOUR });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', ...opts.env } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        repoIntel: new StubRepoIntel(opts.status),
        // the onboarding feature model defaults to the openrouter provider
        llm: { openrouter: llm, openai: llm },
      },
    });
    return { app, llm };
  }

  const rowCount = async () =>
    (await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId))).length;

  it('GET is null before generation; generate validates + persists; regenerate keeps one row', async () => {
    await pg.handle.db.delete(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    const { app } = await makeApp();

    const empty = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toBeNull();

    const gen = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(gen.statusCode).toBe(201);
    const tour = gen.json();
    expect(tour.version).toBe(1);
    expect(tour.index_files).toBe(42);
    const s = tour.sections;
    // hallucinated file: prose loses code formatting; the node stays but loses its file reference
    expect(s.architecture.prose).toBe('Entry is `src/app.ts`; ignore src/ghost.ts.');
    expect(s.architecture.nodes.map((n: { id: string }) => n.id)).toEqual(['web', 'api', 'ghost']);
    expect(s.architecture.nodes.find((n: { id: string }) => n.id === 'ghost')).not.toHaveProperty('file');
    expect(s.architecture.edges).toEqual([
      { from: 'web', to: 'api', label: 'HTTP' },
      { from: 'api', to: 'ghost' },
    ]);
    // critical paths seeded by repo-intel; ghost seed filtered; callers = distinct caller files
    expect(s.critical_paths).toEqual([
      { path: 'src/app.ts', description: 'entry', callers: 1 },
      { path: 'src/db.ts', description: '', callers: 0 }, // its only callers are itself
    ]);
    // dropped: missing script, multi-line command
    expect(s.run_locally).toEqual([{ command: 'pnpm install', comment: 'deps' }, { command: 'pnpm dev' }]);
    expect(s.reading_path).toEqual([{ path: 'src/app.ts', reason: 'start' }]);
    expect(s.first_tasks).toEqual([{ title: 'Add tests', description: 'd', files: ['src/db.ts'] }]);

    const got = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(got.json()).toEqual(tour);

    const again = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(again.statusCode).toBe(201);
    expect(await rowCount()).toBe(1);
    await app.close();
  });

  it('a failed regenerate leaves the previous tour untouched and reports llm_unavailable', async () => {
    const ok = await makeApp();
    await ok.app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    const before = (await ok.app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json();
    await ok.app.close();

    const llm = new ControlledLLM('openai', { structured: TOUR });
    llm.fail = true;
    const { app } = await makeApp({ llm });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.details.reason).toBe('llm_unavailable');
    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json();
    expect(after).toEqual(before);
    await app.close();
  });

  it('maps no_clone and index_unavailable to 422 with a machine-readable reason', async () => {
    const degraded = await makeApp({ status: 'degraded' });
    const r1 = await degraded.app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(r1.statusCode).toBe(422);
    expect(r1.json().error.details.reason).toBe('index_unavailable');
    await degraded.app.close();

    const flagOff = await makeApp({ env: { REPO_INTEL_ENABLED: 'false' } });
    const r2 = await flagOff.app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(r2.statusCode).toBe(422);
    expect(r2.json().error.details.reason).toBe('index_unavailable');
    await flagOff.app.close();

    await pg.handle.db.update(t.repos).set({ clonePath: null }).where(eq(t.repos.id, repoId));
    const noClone = await makeApp();
    const r3 = await noClone.app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(r3.statusCode).toBe(422);
    expect(r3.json().error.details.reason).toBe('no_clone');
    await noClone.app.close();
    await pg.handle.db.update(t.repos).set({ clonePath: cloneDir }).where(eq(t.repos.id, repoId));
  });

  it('rejects a concurrent generate with 409 and makes only one LLM call', async () => {
    let release!: () => void;
    const llm = new ControlledLLM('openai', { structured: TOUR });
    llm.gate = new Promise<void>((r) => (release = r));
    const { app } = await makeApp({ llm });

    const first = app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    await new Promise((r) => setTimeout(r, 200)); // let the first request reach the LLM
    const second = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.details.reason).toBe('generation_in_progress');
    release();
    expect((await first).statusCode).toBe(201);
    expect(llm.startedCount).toBe(1);

    // lock released: a later call proceeds
    llm.gate = null;
    const third = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(third.statusCode).toBe(201);
    await app.close();
  });

  it('treats a stored row with an unknown version as no tour; 404s outside the workspace', async () => {
    await pg.handle.db
      .insert(t.onboarding)
      .values({ repoId, json: { version: 99, junk: true } })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: { version: 99, junk: true } } });
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();

    const bogus = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/repos/${bogus}/onboarding` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/repos/${bogus}/onboarding/generate` })).statusCode,
    ).toBe(404);
    await app.close();
  });
});
