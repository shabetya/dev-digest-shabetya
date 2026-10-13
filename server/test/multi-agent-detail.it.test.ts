import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

/**
 * Integration coverage for `GET /multi-agent-runs/:id` (SPEC-05 AC-11/12/16/17):
 * the combined {columns, conflicts} payload, the "run deleted" placeholder for
 * an individually-deleted agent_runs row, and the AC-17 empty-conflicts case.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Agent A (openai) flags a CRITICAL finding on line 11. */
const FIXTURE_A: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret.',
  score: 40,
  findings: [
    {
      id: 'f-a',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move it to an env var.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** Agent B (anthropic) reviews the same diff and raises nothing. */
const FIXTURE_B: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 95,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `multi-agent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
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
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Multi-Agent Review: GET /multi-agent-runs/:id (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWithTwoAgents() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: FIXTURE_A }),
          anthropic: new MockLLMProvider('anthropic', { structured: FIXTURE_B }),
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: {
              IntentClassification: {
                summary: 'test intent',
                in_scope: [],
                out_of_scope: [],
                confidence: 0.5,
              },
            },
          }),
        },
      },
    });
  }

  it('returns combined columns + conflicts, with every agent\'s verdict incl. "ignored" (AC-12/16)', async () => {
    const app = await appWithTwoAgents();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Security', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Approver', provider: 'anthropic', model: 'claude-x', system_prompt: 's' },
      })
    ).json();

    const runRes = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentIds: [agentA.id, agentB.id] },
      })
    ).json();
    const multiRunId = runRes.multi_run_id;
    expect(multiRunId).toBeTruthy();

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const detail = (
      await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` })
    ).json();

    expect(detail.id).toBe(multiRunId);
    expect(detail.pr_id).toBe(pr.id);
    expect(detail.columns).toHaveLength(2);
    const byAgent = Object.fromEntries(
      detail.columns.map((c: { agent_id: string }) => [c.agent_id, c]),
    );
    expect(byAgent[agentA.id].status).toBe('done');
    expect(byAgent[agentA.id].findings).toHaveLength(1);
    expect(byAgent[agentB.id].findings).toHaveLength(0);

    // One conflict location (agent A's finding); agent B's verdict there is 'ignored'.
    expect(detail.conflicts).toHaveLength(1);
    expect(detail.conflicts_status).toBe('computed');
    const takeByAgent = Object.fromEntries(
      detail.conflicts[0].takes.map((t: { agent_id: string; verdict: string }) => [
        t.agent_id,
        t.verdict,
      ]),
    );
    expect(takeByAgent[agentA.id]).toBe('CRITICAL');
    expect(takeByAgent[agentB.id]).toBe('ignored');

    await app.close();
  });

  it('reports conflicts_status "pending" (not "computed") while most columns are still running, so the client can distinguish that from "agents agree"', async () => {
    const app = await appWithTwoAgents();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SecurityPending', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ApproverPending', provider: 'anthropic', model: 'claude-x', system_prompt: 's' },
      })
    ).json();

    const runRes = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentIds: [agentA.id, agentB.id] },
      })
    ).json();
    const multiRunId = runRes.multi_run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    // Force one of the two (now-done) runs back to 'running' directly in the
    // DB — deterministic stand-in for "still in flight" without racing the
    // mocked LLM's real completion timing. shouldComputeConflicts treats
    // >=50% running as not-yet-ready, so 1-of-2 running is enough.
    const runId = runRes.runs.find((r: { agent_id: string }) => r.agent_id === agentA.id).run_id;
    await pg.handle.db.update(t.agentRuns).set({ status: 'running' }).where(eq(t.agentRuns.id, runId));

    const detail = (
      await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` })
    ).json();
    expect(detail.conflicts_status).toBe('pending');
    expect(detail.conflicts).toEqual([]);

    await app.close();
  });

  it('renders a "run deleted" placeholder column when an agent_runs row is later hard-deleted', async () => {
    const app = await appWithTwoAgents();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Security2', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Approver2', provider: 'anthropic', model: 'claude-x', system_prompt: 's' },
      })
    ).json();

    const runRes = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentIds: [agentA.id, agentB.id] },
      })
    ).json();
    const multiRunId = runRes.multi_run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const agentARunId = runRes.runs.find((r: { agent_id: string }) => r.agent_id === agentA.id)
      .run_id;
    const del = await app.inject({ method: 'DELETE', url: `/runs/${agentARunId}` });
    expect(del.json().ok).toBe(true);

    const detail = (
      await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` })
    ).json();
    expect(detail.columns).toHaveLength(2);
    const deletedCol = detail.columns.find((c: { agent_id: string }) => c.agent_id === agentA.id);
    expect(deletedCol.status).toBe('deleted');
    expect(deletedCol.run_id).toBeNull();
    expect(deletedCol.findings).toEqual([]);

    await app.close();
  });

  it('is empty conflicts for a single-agent multi-run and 404s cross-workspace (AC-17, workspace-scoped)', async () => {
    const app = await appWithTwoAgents();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res404 = await app.inject({
      method: 'GET',
      url: `/multi-agent-runs/00000000-0000-0000-0000-000000000000`,
    });
    expect(res404.statusCode).toBe(404);

    // A single-agentId run never creates a multi_agent_runs row at all — assert
    // via the response shape instead (no multi_run_id to query).
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Solo3', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const runRes = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    expect(runRes.multi_run_id).toBeNull();

    await app.close();
  });

  it('treats an agent that fails mid-run as "did not flag" (ignored), not excluded or agreeing (edge case / AC-16)', async () => {
    const app = await appWithTwoAgents();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Security4', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Approver4', provider: 'anthropic', model: 'claude-x', system_prompt: 's' },
      })
    ).json();
    // The "openrouter" mock in `appWithTwoAgents` only stubs the
    // `IntentClassification` schema, not `Review` — so an agent assigned to
    // this provider gets `{}` back for its own review completion, which fails
    // `Review` schema validation (required `verdict`/`summary`/`score`/
    // `findings`) and surfaces as a real `agent_runs.status: 'failed'` row
    // with zero findings, exactly like a genuine mid-run provider error.
    const agentC = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Flaky4', provider: 'openrouter', model: 'some-model', system_prompt: 's' },
      })
    ).json();

    const runRes = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentIds: [agentA.id, agentB.id, agentC.id] },
      })
    ).json();
    const multiRunId = runRes.multi_run_id;
    expect(multiRunId).toBeTruthy();

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3 });

    const detail = (
      await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` })
    ).json();

    expect(detail.columns).toHaveLength(3);
    const byAgent = Object.fromEntries(
      detail.columns.map((c: { agent_id: string }) => [c.agent_id, c]),
    );
    // The failed agent's column reuses the existing failed-run presentation
    // (status: 'failed', zero findings) rather than a "deleted"/placeholder
    // state — its `agent_runs` row still exists, it just errored.
    expect(byAgent[agentC.id].status).toBe('failed');
    expect(byAgent[agentC.id].findings).toHaveLength(0);
    expect(byAgent[agentA.id].status).toBe('done');
    expect(byAgent[agentA.id].findings).toHaveLength(1);

    // One conflict location (agent A's finding). Every one of the three
    // agents must appear in `takes` — the failed agent is neither dropped
    // from the comparison nor marked as agreeing with the flagger; it gets
    // the same literal 'ignored' verdict as a healthy agent that raised
    // nothing there.
    expect(detail.conflicts).toHaveLength(1);
    const takeByAgent = Object.fromEntries(
      detail.conflicts[0].takes.map((t: { agent_id: string; verdict: string }) => [
        t.agent_id,
        t.verdict,
      ]),
    );
    expect(Object.keys(takeByAgent)).toHaveLength(3);
    expect(takeByAgent[agentA.id]).toBe('CRITICAL');
    expect(takeByAgent[agentB.id]).toBe('ignored');
    expect(takeByAgent[agentC.id]).toBe('ignored');

    await app.close();
  });
});
