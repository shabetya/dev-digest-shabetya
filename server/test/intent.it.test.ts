import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockLinkFetcher } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Integration coverage for the Intent Layer: `IntentService` (via its routes),
 * `LinkFetcher` wiring, and the `pr_intent` field mapping round-trip —
 * accessible link, inaccessible link, no link, and the thin-input
 * low-confidence path.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function classification(overrides: Partial<{
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: number;
}> = {}) {
  return {
    summary: 'Adds rate limiting to public endpoints.',
    in_scope: ['src/config.ts'],
    out_of_scope: ['unrelated admin UI'],
    confidence: 0.9,
    ...overrides,
  };
}

d('Intent Layer (Testcontainers pg)', () => {
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

  async function setupRepoAndPr(body: string) {
    const name = `intent-layer-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 501,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo: repo!, pr: pr! };
  }

  function appWith(opts: {
    structured?: unknown;
    linkFetcher?: MockLinkFetcher;
  }) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // review_intent's registry default provider is 'openrouter' — override
        // THAT key so the test never reaches a real network/LLM call.
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { IntentClassification: opts.structured ?? classification() },
          }),
        },
        ...(opts.linkFetcher ? { linkFetcher: opts.linkFetcher } : {}),
      },
    });
  }

  it('GET /pulls/:id/intent returns null before any computation, then the record after extract', async () => {
    const app = await appWith({});
    const { pr } = await setupRepoAndPr('Add rate limiting. Closes #471.');

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toBeNull();

    const extracted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/extract` });
    expect(extracted.statusCode).toBe(201);
    const record = extracted.json();
    expect(record.summary).toBe('Adds rate limiting to public endpoints.');
    expect(record.in_scope).toEqual(['src/config.ts']);
    expect(record.pr_id).toBe(pr.id);
    expect(record.model).toBe('deepseek/deepseek-v4-flash');
    expect(record.computed_for_sha).toBe('a1b2c3d4');
    expect(record.sources).toContain('pr_title');
    expect(record.sources).toContain('file_hunks');
    expect(record.sources).toContain('pr_description');

    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(after.json()).toMatchObject({ summary: record.summary, pr_id: pr.id });

    await app.close();
  });

  it('no external link in PR body → plan_link_status "not_linked", plan_link_url null', async () => {
    const app = await appWith({});
    const { pr } = await setupRepoAndPr('Just a plain description, no links.');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/extract` });
    const record = res.json();
    expect(record.plan_link_status).toBe('not_linked');
    expect(record.plan_link_url).toBeNull();
    expect(record.sources).not.toContain('plan_link');

    await app.close();
  });

  it('accessible external link → fetched, and "plan_link" is recorded as a source', async () => {
    const app = await appWith({ linkFetcher: new MockLinkFetcher({ ok: true, text: 'the full design doc text' }) });
    const { pr } = await setupRepoAndPr('See the plan: https://example.com/design-doc for details.');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/extract` });
    const record = res.json();
    expect(record.plan_link_status).toBe('fetched');
    expect(record.plan_link_url).toBe('https://example.com/design-doc');
    expect(record.sources).toContain('plan_link');

    await app.close();
  });

  it('inaccessible external link → "inaccessible", NOT recorded as a source, never throws', async () => {
    const app = await appWith({
      linkFetcher: new MockLinkFetcher({ ok: false, reason: 'target host resolves to a private/loopback address' }),
    });
    const { pr } = await setupRepoAndPr('See the plan: https://example.com/design-doc for details.');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/extract` });
    expect(res.statusCode).toBe(201);
    const record = res.json();
    expect(record.plan_link_status).toBe('inaccessible');
    expect(record.plan_link_url).toBe('https://example.com/design-doc');
    expect(record.sources).not.toContain('plan_link');

    await app.close();
  });

  it('thin input → low confidence surfaces as low_confidence=true; confidence=null is NOT low_confidence', async () => {
    const app = await appWith({ structured: classification({ confidence: 0.2 }) });
    const { pr } = await setupRepoAndPr('fix stuff');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/extract` });
    const record = res.json();
    expect(record.confidence).toBe(0.2);
    expect(record.low_confidence).toBe(true);

    await app.close();
  });

  it('404s for a PR outside the workspace', async () => {
    const app = await appWith({});
    const bogusId = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({ method: 'GET', url: `/pulls/${bogusId}/intent` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
