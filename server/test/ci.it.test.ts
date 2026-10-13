import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { CiRepository } from '../src/modules/ci/repository.js';

/**
 * SPEC-05 Export to CI — DB-backed coverage: tenant-scoping join, re-export
 * upsert idempotency (AC-7), and Refresh-ingestion dedupe + rejection
 * (AC-15/AC-16/AC-16a). Real Postgres via Testcontainers — see
 * `onion-architecture`'s "integration tests through the API with a real
 * Postgres" and `server/AGENTS.md`'s `*.it.test.ts` naming rule.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci] Docker not available — skipping integration tests.');
}

function zippedArtifact(json: unknown): Buffer {
  const zip = new AdmZip();
  zip.addFile('devdigest-result.json', Buffer.from(JSON.stringify(json)));
  return zip.toBuffer();
}

d('Export to CI (SPEC-05)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(github: MockGitHubClient) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Security Reviewer',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        system_prompt: 'Review for security issues.',
        ci_fail_on: 'critical',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('export-ci opens a PR, installs the agent, and re-export is idempotent (AC-7)', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(github);
    const agentId = await createAgent(app);

    const first = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'open_pr' },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();
    expect(firstBody.pr_url).toBeTruthy();
    expect(firstBody.files.map((f: { path: string }) => f.path)).toContain(
      '.github/workflows/devdigest-review.yml',
    );
    expect(firstBody.installation.repo).toBe('acme/payments-api');

    // Re-export: same (agent, repo) → same installation row, no duplicate.
    const second = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'open_pr' },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().installation.id).toBe(firstBody.installation.id);

    const repo = new CiRepository(pg.handle.db);
    const installations = await repo.listInstallationsForAgent(await resolveDefaultWorkspaceId(), agentId);
    expect(installations).toHaveLength(1);

    // commitFiles was called twice (both exports), but only ONE open PR exists
    // (findOpenPr reused it the second time — no duplicate PR opened).
    expect(github.committed).toHaveLength(2);
    expect(github.openedPrs).toHaveLength(1);

    await app.close();
  });

  it('a "files"-only preview call generates files but does NOT install the repo (no PR, no ci_installations row)', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(github);
    const agentId = await createAgent(app);

    const preview = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'files' },
    });
    expect(preview.statusCode).toBe(201);
    const body = preview.json();
    expect(body.pr_url).toBeNull();
    expect(body.installation).toBeNull();
    expect(github.committed).toHaveLength(0);
    expect(github.openedPrs).toHaveLength(0);

    const tab = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci` });
    expect(tab.json().installations).toHaveLength(0);

    await app.close();
  });

  it("the agent's CI tab is workspace-scoped: a different workspace's agent 404s", async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(github);
    const { db } = pg.handle;

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-ci-ws' }).returning();
    const agentsRepo = new AgentsRepository(db);
    const foreign = await agentsRepo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${foreign.id}/ci` });
    expect(res.statusCode).toBe(404);

    const exportRes = await app.inject({
      method: 'POST',
      url: `/agents/${foreign.id}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'files' },
    });
    expect(exportRes.statusCode).toBe(404);

    await app.close();
  });

  it('refreshRuns ingests a valid artifact once and is idempotent on a second refresh (AC-15/AC-16a)', async () => {
    const workflowRun = {
      id: 123456,
      name: 'DevDigest Review',
      headSha: 'headsha1',
      headBranch: 'feat/x',
      event: 'pull_request',
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-06-01T00:00:00Z',
      htmlUrl: 'https://github.com/acme/payments-api/actions/runs/123456',
      pullRequests: [7],
    };
    const artifactJson = {
      findings_count: 1,
      critical: 1,
      warning: 0,
      suggestion: 0,
      cost_usd: 0.01,
      duration_ms: 42500,
      agent: 'Security Reviewer',
      pr_number: 7,
    };
    const github = new MockGitHubClient({
      workflowRuns: [workflowRun],
      artifactsByRunId: { 123456: [{ id: 1, name: 'devdigest-result', sizeInBytes: 100, expired: false }] },
      artifactZipById: { 1: zippedArtifact(artifactJson) },
    });
    const app = await makeApp(github);
    const agentId = await createAgent(app);
    // Refresh only scans ACTUALLY installed repos — install via `open_pr`,
    // not a `files`-only preview call (that must not create the installation).
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'open_pr' },
    });

    const refresh1 = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/refresh` });
    expect(refresh1.statusCode).toBe(200);
    expect(refresh1.json()).toEqual({ ingested: 1, rejected: 0 });

    const tab = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci` });
    const runs = tab.json().runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ pr_number: 7, status: 'failed', findings_count: 1 });
    // Fix B / AC-17: duration_ms from the artifact round-trips into the API
    // response as duration_s (seconds).
    expect(runs[0].duration_s).toBe(42.5);

    // Second refresh for the SAME github_run_id must not duplicate the row.
    const refresh2 = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/refresh` });
    expect(refresh2.statusCode).toBe(200);
    expect(refresh2.json()).toEqual({ ingested: 0, rejected: 0 });
    const tab2 = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci` });
    expect(tab2.json().runs).toHaveLength(1);

    await app.close();
  });

  it('refreshRuns discards an artifact that fails CiResultArtifact validation (AC-16) without writing a ci_runs row', async () => {
    const workflowRun = {
      id: 999,
      name: 'DevDigest Review',
      headSha: 'headsha2',
      headBranch: 'feat/y',
      event: 'pull_request',
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-06-02T00:00:00Z',
      htmlUrl: 'https://github.com/acme/payments-api/actions/runs/999',
      pullRequests: [8],
    };
    // Missing required `findings_count` / `agent` fields — fails the schema.
    const invalidArtifact = { cost_usd: 0.01 };
    const github = new MockGitHubClient({
      workflowRuns: [workflowRun],
      artifactsByRunId: { 999: [{ id: 2, name: 'devdigest-result', sizeInBytes: 10, expired: false }] },
      artifactZipById: { 2: zippedArtifact(invalidArtifact) },
    });
    const app = await makeApp(github);
    const agentId = await createAgent(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'open_pr' },
    });

    const refresh = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/refresh` });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ ingested: 0, rejected: 1 });

    const tab = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci` });
    expect(tab.json().runs).toHaveLength(0);

    await app.close();
  });

  async function resolveDefaultWorkspaceId(): Promise<string> {
    const [row] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    return row!.id;
  }
});
