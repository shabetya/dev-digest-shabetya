import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import {
  DIFF_A,
  DIFF_AB,
  DIFF_OTHER,
  ScriptedLLM,
  addCase,
  allText,
  createAgent,
  defaultWorkspaceId,
  diffFileOf,
  evalRowCounts,
  reviewOf,
  runSuite,
  seedFinding,
  systemText,
  waitForSuite,
  type Script,
} from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-suite] Docker not available — skipping integration tests.');

/** SPEC-04 AC-11..16, AC-14, AC-19..22 at the HTTP boundary, against a real Postgres. */
d('eval: suite execution', () => {
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

  function makeApp(llm?: ScriptedLLM, extra: Record<string, unknown> = {}) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF_AB }),
        github: new MockGitHubClient(),
        // never read real keys from ~/.devdigest/secrets.json
        secrets: new MockSecretsProvider({}),
        ...(llm ? { llm: { openai: llm } } : {}),
        ...extra,
      },
    });
  }

  const A_FIND = { file: 'src/a.ts', start: 11 };
  const mustFindA = { name: 'find-a', expectation: 'must_find' as const, expected_output: [{ file: 'src/a.ts', start_line: 11, end_line: 11 }] };
  const noFlagOther = { name: 'quiet-other', expectation: 'must_not_flag' as const, expected_output: [{ file: 'src/other.ts', start_line: 2, end_line: 2 }] };

  it('runs every case on frozen inputs, scores in code, persists results and aggregates, and writes no review rows', async () => {
    // finds a.ts:11 (+ one hallucinated line the grounding gate must drop); flags other.ts:2 (noise)
    const llm = new ScriptedLLM((req) =>
      diffFileOf(req) === 'src/a.ts'
        ? reviewOf([A_FIND, { file: 'src/a.ts', start: 999 }])
        : reviewOf([{ file: 'src/other.ts', start: 2 }]),
    );
    const app = await makeApp(llm);
    const agent = await createAgent(app);
    const c1 = await addCase(app, agent.id, { ...mustFindA, input_diff: DIFF_A });
    await addCase(app, agent.id, { ...noFlagOther, input_diff: DIFF_OTHER });
    const before = await evalRowCounts(pg.handle.db);

    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(start.statusCode).toBe(202);
    expect(start.json()).toMatchObject({ status: 'running', agent_id: agent.id, agent_version: 1, cases_total: 2 });
    expect(start.json().config_snapshot).toMatchObject({ model: 'gpt-4o-mini', system_prompt: 'You are a careful reviewer.' });
    expect(JSON.stringify(start.json())).not.toMatch(/sk-|api[_-]?key/i);

    const run = await waitForSuite(app, start.json().id);
    expect(run.status).toBe('completed');
    expect(run.cases_total).toBe(2);
    expect(run.cases_passed).toBe(1); // find-a passes, quiet-other fails
    expect(run.recall).toBe(1);
    // grounded: a.ts:11 + other.ts:2 (the latter is noise on a must_not_flag case);
    // a.ts:999 is dropped by the grounding gate → 2 kept of 3 emitted
    expect(run.precision).toBe(0.5);
    expect(run.citation_accuracy).toBeCloseTo(2 / 3);
    expect(run.cost_usd).toBeGreaterThan(0);
    expect(run.case_runs).toHaveLength(2);
    const byName = Object.fromEntries(run.case_runs.map((r: { case_name: string }) => [r.case_name, r]));
    expect(byName['find-a']).toMatchObject({ status: 'passed', expected_count: 1, suite_run_id: run.id, case_id: c1.id });
    expect(byName['find-a'].pre_grounding_count).toBe(2);
    expect(byName['find-a'].actual_count).toBe(1);
    expect(byName['find-a'].citation_accuracy).toBe(0.5);

    // AC-12: no review / finding / agent_run rows; only suite + case-run rows
    const after = await evalRowCounts(pg.handle.db);
    expect(after.reviews).toBe(before.reviews);
    expect(after.agentRuns).toBe(before.agentRuns);
    expect(after.suites).toBe(before.suites + 1);
    expect(after.caseRuns).toBe(before.caseRuns + 2);

    // history + case list reflect the run
    const history = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect(history.json()[0]).toMatchObject({ id: run.id, status: 'completed' });
    const cases = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(cases.json().map((c: { last_run: { status: string } }) => c.last_run.status).sort()).toEqual(['failed', 'passed']);
  });

  it('a case that errors is recorded, excluded from the denominators, and the suite continues', async () => {
    const llm = new ScriptedLLM((req) => {
      if (diffFileOf(req) === 'src/other.ts') throw new Error('provider exploded');
      return reviewOf([A_FIND]);
    });
    const app = await makeApp(llm);
    const agent = await createAgent(app);
    await addCase(app, agent.id, mustFindA);
    // diff only touches other.ts so the scripted LLM errors for it
    await addCase(app, agent.id, {
      name: 'will-error',
      expectation: 'must_find',
      expected_output: [{ file: 'src/other.ts', start_line: 2 }],
      input_diff: ['diff --git a/src/other.ts b/src/other.ts', '--- a/src/other.ts', '+++ b/src/other.ts', '@@ -1,1 +1,2 @@', ' keep', '+added'].join('\n'),
    });
    const run = await runSuite(app, agent.id);
    expect(run.status).toBe('completed');
    expect(run.cases_total).toBe(2);
    expect(run.cases_passed).toBe(1);
    expect(run.recall).toBe(1); // the errored case's expectation is NOT in the denominator
    const errored = run.case_runs.find((r: { case_name: string }) => r.case_name === 'will-error');
    expect(errored).toMatchObject({ status: 'error', pass: null });
    expect(errored.error).toContain('provider exploded');
  });

  it('no LLM key → the suite fails fast with reason llm_unavailable and no partial metrics', async () => {
    const app = await makeApp(); // no llm override + empty secrets
    const agent = await createAgent(app, { provider: 'anthropic', model: 'claude-x' });
    await addCase(app, agent.id, mustFindA);
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'failed', reason: 'llm_unavailable', recall: null, precision: null, citation_accuracy: null });
    const rows = await pg.handle.db.select().from(t.evalRuns);
    expect(rows.filter((r) => r.suiteRunId === res.json().id)).toHaveLength(0);
    // the failed run is terminal, so a new run is NOT blocked by a 409
    const again = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(again.statusCode).toBe(202);
  });

  it('422 no_cases creates nothing', async () => {
    const app = await makeApp(new ScriptedLLM(() => reviewOf([])));
    const agent = await createAgent(app);
    const before = await evalRowCounts(pg.handle.db);
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('no_cases');
    expect((await evalRowCounts(pg.handle.db)).suites).toBe(before.suites);
    expect((await app.inject({ method: 'POST', url: '/agents/00000000-0000-4000-8000-000000000000/eval-runs' })).statusCode).toBe(404);
  });

  it('one active suite per agent: a concurrent POST is 409 with the active id; the run uses its own snapshot even if the agent is edited mid-run', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered = 0;
    const llm = new ScriptedLLM(async () => {
      entered++;
      await gate;
      return reviewOf([A_FIND]);
    });
    const app = await makeApp(llm);
    const agent = await createAgent(app);
    // 4 cases > EVAL_CONCURRENCY (3): the 4th starts only after the agent was edited
    for (let i = 0; i < 4; i++) await addCase(app, agent.id, { ...mustFindA, name: `case-${i}` });

    const first = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(first.statusCode).toBe(202);
    const second = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('suite_running');
    expect(second.json().error.details.run_id).toBe(first.json().id);

    // wait until the first 3 are in flight, then edit the agent's prompt
    for (let i = 0; i < 200 && entered < 3; i++) await new Promise((r) => setTimeout(r, 10));
    expect(entered).toBe(3);
    const edit = await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'EDITED PROMPT' } });
    expect(edit.statusCode).toBeLessThan(300);
    release();

    const run = await waitForSuite(app, first.json().id);
    expect(run.status).toBe('completed');
    expect(run.agent_version).toBe(1);
    expect(run.config_snapshot.system_prompt).toBe('You are a careful reviewer.');
    expect(llm.requests).toHaveLength(4);
    for (const r of llm.requests) {
      expect(systemText(r.messages)).toContain('You are a careful reviewer.');
      expect(systemText(r.messages)).not.toContain('EDITED PROMPT');
    }
    // after it finished a new run is allowed again (guard releases)
    const third = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(third.statusCode).toBe(202);
    await waitForSuite(app, third.json().id);
  });

  it('a stale `running` suite is marked failed (reason stale) on read, and the agent can run again', async () => {
    const app = await makeApp(new ScriptedLLM(() => reviewOf([A_FIND])));
    const agent = await createAgent(app);
    await addCase(app, agent.id, mustFindA);
    const [stale] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: 1,
        configSnapshot: { provider: 'openai', model: 'm', system_prompt: 'p', strategy: 'single-pass', ci_fail_on: 'critical', repo_intel: true, skills: [] },
        status: 'running',
        casesTotal: 1,
        ranAt: new Date(Date.now() - 31 * 60_000),
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/${stale!.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'failed', reason: 'stale' });

    const fresh = await runSuite(app, agent.id);
    expect(fresh.status).toBe('completed');
  });

  it('single-case run uses the current config, stores suite_run_id = null and creates no suite run', async () => {
    const llm = new ScriptedLLM(() => reviewOf([A_FIND]));
    const app = await makeApp(llm);
    const agent = await createAgent(app);
    const c = await addCase(app, agent.id, mustFindA);
    const before = await evalRowCounts(pg.handle.db);

    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'CURRENT PROMPT' } });
    const res = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.case_run).toMatchObject({ suite_run_id: null, status: 'passed', case_id: c.id });
    expect(body.result).toMatchObject({ traces_passed: 1, traces_total: 1, recall: 1 });
    expect(systemText(llm.requests[0]!.messages)).toContain('CURRENT PROMPT');

    const after = await evalRowCounts(pg.handle.db);
    expect(after.suites).toBe(before.suites);
    expect(after.caseRuns).toBe(before.caseRuns + 1);
    const [row] = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, body.run_id));
    expect(row!.suiteRunId).toBeNull();

    expect((await app.inject({ method: 'POST', url: '/eval-cases/00000000-0000-4000-8000-000000000000/run' })).statusCode).toBe(404);
  });

  it('AC-14: the prompt holds ONLY frozen inputs — no repo-intel, project context, intent or live PR text', async () => {
    const llm = new ScriptedLLM(() => reviewOf([A_FIND]));
    // A repo-intel facade that fails the test if anything consults it.
    const touched: string[] = [];
    const repoIntel = new Proxy({} as RepoIntel, {
      get: (_t, prop) => (..._a: unknown[]) => {
        touched.push(String(prop));
        throw new Error(`repo-intel must not be consulted by eval runs (${String(prop)})`);
      },
    });
    const git = new MockGitClient({
      diff: DIFF_AB,
      files: { 'docs/CONTEXT.md': 'LIVE-PROJECT-CONTEXT-SENTINEL' },
    });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git, github: new MockGitHubClient(), secrets: new MockSecretsProvider({}), llm: { openai: llm }, repoIntel },
    });
    const agent = await createAgent(app);

    // live state that production reviews WOULD inject — and a skill that eval SHOULD inject
    await pg.handle.db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'docs/CONTEXT.md', order: 0 });
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: 'eval-skill', description: 'd', type: 'custom', source: 'manual', body: 'SKILL-BODY-SENTINEL', enabled: true })
      .returning();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill!.id] } });

    // case frozen from a finding, THEN the live PR changes
    const { finding, pr } = await seedFinding(pg.handle.db, workspaceId, { agentId: agent.id, decision: 'accepted', prBody: 'FROZEN-PR-BODY' });
    const created = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(created.statusCode).toBe(201);
    await pg.handle.db.update(t.pullRequests).set({ body: 'LIVE-PR-BODY-SENTINEL', title: 'LIVE-PR-TITLE' }).where(eq(t.pullRequests.id, pr.id));
    await pg.handle.db.insert(t.prIntent).values({ prId: pr.id, summary: 'LIVE-INTENT-SENTINEL' });

    const run = await runSuite(app, agent.id);
    expect(run.status).toBe('completed');
    expect(llm.requests.length).toBeGreaterThan(0);

    for (const req of llm.requests) {
      const text = allText(req.messages);
      // frozen inputs ARE present
      expect(text).toContain('## Diff to review');
      expect(text).toContain('stripeKey');
      expect(text).toContain('FROZEN-PR-BODY');
      expect(text).toContain('## Skills / rules');
      expect(text).toContain('SKILL-BODY-SENTINEL');
      // nothing live / enriched is
      for (const forbidden of [
        '## Repo skeleton',
        '## Callers of changed symbols',
        '## Project context',
        '## PR intent & scope',
        '## Relevant memory',
        'LIVE-PROJECT-CONTEXT-SENTINEL',
        'LIVE-PR-BODY-SENTINEL',
        'LIVE-PR-TITLE',
        'LIVE-INTENT-SENTINEL',
        'most-depended-on',
      ]) {
        expect(text, `prompt must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
    expect(touched).toEqual([]);
    // the case's own file was the only file reviewed
    expect(llm.requests.every((r) => !allText(r.messages).includes('src/other.ts'))).toBe(true);
  });
});
