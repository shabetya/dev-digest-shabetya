import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { DIFF_AB, createAgent, defaultWorkspaceId, seedFinding } from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-create-case] Docker not available — skipping integration tests.');

/** SPEC-04 AC-1..9: turn a decided finding into a frozen eval case + case CRUD. */
d('eval: create case from finding + case CRUD', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = (diff: string = DIFF_AB) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff }), github: new MockGitHubClient() },
    });

  const post = (app: Awaited<ReturnType<typeof makeApp>>, findingId: string) =>
    app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });

  it('accepted → must_find with a frozen single-file diff and expectation built from the finding (201)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const { finding, pr } = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted' });

    const res = await post(app, finding.id);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created).toBe(true);
    expect(body.agent_id).toBe(agent.id);
    expect(body.case).toMatchObject({
      owner_kind: 'agent',
      owner_id: agent.id,
      expectation: 'must_find',
      source_finding_id: finding.id,
      name: 'hardcoded-stripe-key',
      input_files: ['src/a.ts'],
      expected_output: [
        { file: 'src/a.ts', start_line: 11, end_line: 11, severity: 'WARNING', category: 'bug', title: 'Hardcoded Stripe key' },
      ],
      input_meta: { pr_title: 'Add stripe config', pr_description: 'Adds the stripe key config.', agent_id: agent.id, agent_version: 1 },
    });
    // only the finding's file is frozen
    expect(body.case.input_diff).toContain('stripeKey');
    expect(body.case.input_diff).not.toContain('src/other.ts');
    expect(pr.id).toBeTruthy();
  });

  it('dismissed → must_not_flag', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const { finding } = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'dismissed' });
    const res = await post(app, finding.id);
    expect(res.statusCode).toBe(201);
    expect(res.json().case.expectation).toBe('must_not_flag');
  });

  it('undecided finding → 409 finding_undecided and nothing is created', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const { finding } = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: null });
    const res = await post(app, finding.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_undecided');
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(0);
  });

  it('is idempotent: a second click returns the existing case (200) and no duplicate row', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const { finding } = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted' });
    const first = await post(app, finding.id);
    const second = await post(app, finding.id);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().created).toBe(false);
    expect(second.json().case.id).toBe(first.json().case.id);
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(1);
  });

  it("another workspace's finding is a 404 and an unknown id is a 404", async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other WS' }).returning();
    const { finding } = await seedFinding(pg.handle.db, otherWs!.id, { agentId: agent.id, decision: 'accepted' });
    expect((await post(app, finding.id)).statusCode).toBe(404);
    expect((await post(app, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('no_agent when the review has no agent (agent deleted)', async () => {
    const app = await makeApp();
    const { finding } = await seedFinding(pg.handle.db, workspaceId, { agentId: null, decision: 'accepted' });
    const res = await post(app, finding.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('no_agent');
  });

  it('diff_unavailable when the PR diff cannot be loaded or lacks the file; diff_too_large over the cap', async () => {
    const agent = await createAgent(await makeApp());
    // empty git diff and no pr_files → nothing to freeze
    const noDiff = await makeApp('');
    const a = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted' });
    const r1 = await post(noDiff, a.finding.id);
    expect(r1.statusCode).toBe(422);
    expect(r1.json().error.code).toBe('diff_unavailable');

    // diff exists but not for the finding's file
    const b = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted', file: 'src/missing.ts' });
    const r2 = await post(await makeApp(), b.finding.id);
    expect(r2.json().error.code).toBe('diff_unavailable');

    // > EVAL_DIFF_CAP_BYTES in one hunk
    const big = [
      'diff --git a/src/big.ts b/src/big.ts',
      '--- a/src/big.ts',
      '+++ b/src/big.ts',
      '@@ -1,1 +1,3001 @@',
      ' x',
      ...Array.from({ length: 3000 }, (_, i) => `+const line${i} = ${'y'.repeat(30)};`),
    ].join('\n');
    const c = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted', file: 'src/big.ts', start: 5 });
    const r3 = await post(await makeApp(big), c.finding.id);
    expect(r3.statusCode).toBe(422);
    expect(r3.json().error.code).toBe('diff_too_large');
    const created = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, c.finding.id));
    expect(created).toHaveLength(0);
  });

  it('cascades: deleting the finding or PR keeps the case; deleting the agent removes its cases', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const f1 = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted' });
    const f2 = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'dismissed' });
    const c1 = (await post(app, f1.finding.id)).json().case.id as string;
    const c2 = (await post(app, f2.finding.id)).json().case.id as string;

    await pg.handle.db.delete(t.findings).where(eq(t.findings.id, f1.finding.id));
    const [afterFinding] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, c1));
    expect(afterFinding).toBeTruthy();
    expect(afterFinding!.sourceFindingId).toBeNull();
    expect(afterFinding!.inputDiff).toContain('stripeKey'); // frozen copy survives

    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, f2.pr.id));
    const [afterPr] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, c2));
    expect(afterPr).toBeTruthy();

    // eval_cases.owner_id is polymorphic (skill|agent) → no FK; deleting an agent
    // must still clear its suite runs (FK cascade), which carry the case runs.
    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
    expect(del.statusCode).toBeLessThan(300);
    const suites = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id));
    expect(suites).toHaveLength(0);
  });

  it('case CRUD: validates bodies, lists with never_run, edits, deletes, is workspace-scoped', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const base = { name: 'manual', input_diff: DIFF_AB };

    // invalid: must_find with an empty list; malformed item; unknown expectation
    for (const bad of [
      { ...base, expectation: 'must_find', expected_output: [] },
      { ...base, expectation: 'must_find', expected_output: [{ file: 'a.ts' }] },
      { ...base, expectation: 'nope', expected_output: [] },
    ]) {
      const r = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: bad });
      expect(r.statusCode).toBe(422);
    }

    // must_not_flag + empty array is the one valid empty shape
    const ok = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: { ...base, expectation: 'must_not_flag', expected_output: [] },
    });
    expect(ok.statusCode).toBe(201);
    const id = ok.json().id as string;

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toMatchObject({ id, invalid: false, last_run: { status: 'never_run' } });

    // PATCH re-validates the merged pair: flipping to must_find with [] is rejected
    const badPatch = await app.inject({ method: 'PATCH', url: `/eval-cases/${id}`, payload: { expectation: 'must_find' } });
    expect(badPatch.statusCode).toBe(422);
    const goodPatch = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${id}`,
      payload: { name: 'renamed', expectation: 'must_find', expected_output: [{ file: 'src/a.ts', start_line: 11 }] },
    });
    expect(goodPatch.statusCode).toBe(200);
    expect(goodPatch.json()).toMatchObject({ name: 'renamed', expectation: 'must_find' });

    // a stored row that fails the schema is surfaced as invalid, never a 5xx
    await pg.handle.db.update(t.evalCases).set({ expectedOutput: 'garbage' }).where(eq(t.evalCases.id, id));
    const listBad = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(listBad.statusCode).toBe(200);
    expect(listBad.json()[0]).toMatchObject({ invalid: true });

    // unknown agent / case → 404
    expect((await app.inject({ method: 'GET', url: '/agents/00000000-0000-4000-8000-000000000000/eval-cases' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/eval-cases/00000000-0000-4000-8000-000000000000', payload: { name: 'x' } })).statusCode).toBe(404);

    // a case in another workspace is invisible
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other WS 2' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.evalCases)
      .values({ workspaceId: otherWs!.id, ownerKind: 'agent', ownerId: agent.id, name: 'foreign', expectedOutput: [], expectation: 'must_not_flag' })
      .returning();
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${foreign!.id}` })).statusCode).toBe(404);

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${id}` })).statusCode).toBe(404);
  });
});
