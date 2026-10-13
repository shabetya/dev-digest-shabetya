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
 * Integration coverage for `GET /agents/estimates` (AC-22/23): the median is
 * computed from real persisted `agent_runs` rows, only `status='done'` rows
 * count, and an agent with zero completed runs reports "no history yet"
 * (null), never 0.
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

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'ok',
  score: 90,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `estimates-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 2000 + repoSeq,
      title: 'PR',
      author: 'a',
      branch: 'b',
      base: 'main',
      headSha: 'sha',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: '',
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

d('GET /agents/estimates (Testcontainers pg)', () => {
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

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
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

  it('reports "no history yet" for an agent with zero done runs, and a real median once it has some (AC-22/23)', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'EstimateAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    const before = (await app.inject({ method: 'GET', url: '/agents/estimates' })).json();
    const beforeEntry = before.estimates.find((e: { agent_id: string }) => e.agent_id === agent.id);
    expect(beforeEntry.median_duration_ms).toBeNull();
    expect(beforeEntry.median_cost_usd).toBeNull();
    expect(beforeEntry.sample_size).toBe(0);

    // Run it twice so there's a real 2-sample median to check.
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const { pr: pr2 } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await app.inject({ method: 'POST', url: `/pulls/${pr2.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr2.id, { expected: 1 });

    const runs = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.agentId, agent.id));
    expect(runs.every((r) => r.status === 'done')).toBe(true);

    const after = (await app.inject({ method: 'GET', url: '/agents/estimates' })).json();
    const afterEntry = after.estimates.find((e: { agent_id: string }) => e.agent_id === agent.id);
    expect(afterEntry.sample_size).toBe(2);
    expect(afterEntry.median_duration_ms).not.toBeNull();

    await app.close();
  });
});
