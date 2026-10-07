import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import {
  DIFF_A,
  DIFF_OTHER,
  ScriptedLLM,
  addCase,
  createAgent,
  diffFileOf,
  reviewOf,
  runSuite,
} from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-dashboard-compare] Docker not available — skipping integration tests.');

/** SPEC-04 AC-23..25: history, dashboards (delta/alert/trend) and compare. */
d('eval: dashboard, history, compare', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** `mode` is switched between runs to simulate a good then a degraded prompt. */
  const mode = { current: 'good' as 'good' | 'noisy' | 'blind' };
  const llm = new ScriptedLLM((req) => {
    const file = diffFileOf(req);
    if (mode.current === 'blind') return reviewOf([]); // finds nothing
    if (file === 'src/a.ts') return reviewOf([{ file: 'src/a.ts', start: 11 }]);
    // other.ts: "good" stays quiet; "noisy" flags the dismissed line
    return mode.current === 'noisy' ? reviewOf([{ file: 'src/other.ts', start: 2 }]) : reviewOf([]);
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), secrets: new MockSecretsProvider({}), llm: { openai: llm } },
    });

  async function agentWithCases(app: Awaited<ReturnType<typeof makeApp>>) {
    const agent = await createAgent(app);
    const find = await addCase(app, agent.id, {
      name: 'find-a',
      expectation: 'must_find',
      expected_output: [{ file: 'src/a.ts', start_line: 11 }],
      input_diff: DIFF_A,
    });
    const quiet = await addCase(app, agent.id, {
      name: 'quiet-other',
      expectation: 'must_not_flag',
      expected_output: [{ file: 'src/other.ts', start_line: 2 }],
      input_diff: DIFF_OTHER,
    });
    return { agent, find, quiet };
  }

  it('first run has no delta/alert; a degraded second run shows a negative delta, an alert naming the metric + version, and a trend', async () => {
    const app = await makeApp();
    const { agent } = await agentWithCases(app);

    mode.current = 'good';
    const r1 = await runSuite(app, agent.id);
    expect(r1).toMatchObject({ status: 'completed', cases_passed: 2, recall: 1, precision: 1 });

    const dash1 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json();
    expect(dash1.current).toMatchObject({ recall: 1, precision: 1, traces_passed: 2, traces_total: 2 });
    expect(dash1.delta).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(dash1.alert).toBeNull();
    expect(dash1.cases_total).toBe(2);

    // edit the prompt (bumps to v2) and degrade the behaviour: now noisy
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'Flag everything you see.' } });
    mode.current = 'noisy';
    const r2 = await runSuite(app, agent.id);
    expect(r2.agent_version).toBe(2);
    expect(r2.precision).toBe(0.5);

    const dash2 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json();
    expect(dash2.current.precision).toBe(0.5);
    expect(dash2.delta.precision).toBe(-50);
    expect(dash2.delta.recall).toBe(0);
    expect(dash2.alert).toMatch(/^Precision dipped 50pts on v2/);
    expect(dash2.trend).toHaveLength(2);
    expect(dash2.trend[0].ran_at <= dash2.trend[1].ran_at).toBe(true); // chronological
    expect(dash2.recent_runs[0].id).toBe(r2.id); // newest first

    // history list: newest first
    const history = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(history.map((r: { id: string }) => r.id)).toEqual([r2.id, r1.id]);

    // an improvement afterwards clears the alert
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'Be precise.' } });
    mode.current = 'good';
    await runSuite(app, agent.id);
    const dash3 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?days=30` })).json();
    expect(dash3.delta.precision).toBe(50);
    expect(dash3.alert).toBeNull();
  });

  it('null metrics yield null deltas (no alert on them) while a recall collapse still alerts', async () => {
    const app = await makeApp();
    const { agent } = await agentWithCases(app);
    mode.current = 'good';
    await runSuite(app, agent.id);
    mode.current = 'blind'; // finds nothing: recall 0 (big drop) but precision/citation null
    await runSuite(app, agent.id);
    const dash = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json();
    expect(dash.current).toMatchObject({ recall: 0, precision: null, citation_accuracy: null });
    expect(dash.delta).toEqual({ recall: -100, precision: null, citation_accuracy: null });
    expect(dash.alert).toMatch(/^Recall dipped 100pts/);
  });

  it('workspace dashboard lists every agent with its latest completed run, sparkline, and recent runs', async () => {
    const app = await makeApp();
    const { agent } = await agentWithCases(app);
    const bare = await createAgent(app); // no cases, never run
    mode.current = 'good';
    const run = await runSuite(app, agent.id);

    const dash = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    const row = dash.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
    expect(row).toMatchObject({ cases_total: 2, model: 'gpt-4o-mini', latest: { id: run.id, recall: 1 } });
    expect(row.sparkline).toHaveLength(1);
    const bareRow = dash.agents.find((a: { agent_id: string }) => a.agent_id === bare.id);
    expect(bareRow).toMatchObject({ cases_total: 0, latest: null, sparkline: [] });
    expect(dash.recent_runs.some((r: { id: string }) => r.id === run.id)).toBe(true);
  });

  it('compare: metric deltas (b − a), fixed/regressed cases, both system prompts; route is not shadowed by :id', async () => {
    const app = await makeApp();
    const { agent } = await agentWithCases(app);
    mode.current = 'noisy'; // quiet-other fails
    const a = await runSuite(app, agent.id);
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'Second prompt.' } });
    mode.current = 'good'; // quiet-other now passes → fixed
    const b = await runSuite(app, agent.id);

    const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/compare?a=${a.id}&b=${b.id}` });
    expect(res.statusCode).toBe(200);
    const cmp = res.json();
    expect(cmp.a.id).toBe(a.id);
    expect(cmp.b.id).toBe(b.id);
    expect(cmp.delta.precision).toBe(50);
    expect(cmp.fixed.map((c: { case_name: string }) => c.case_name)).toEqual(['quiet-other']);
    expect(cmp.regressed).toEqual([]);
    expect(cmp.a.config_snapshot.system_prompt).toBe('You are a careful reviewer.');
    expect(cmp.b.config_snapshot.system_prompt).toBe('Second prompt.');

    // reversed → the same case regresses
    const rev = (await app.inject({ method: 'GET', url: `/eval-suite-runs/compare?a=${b.id}&b=${a.id}` })).json();
    expect(rev.regressed.map((c: { case_name: string }) => c.case_name)).toEqual(['quiet-other']);
    expect(rev.delta.precision).toBe(-50);

    // a case added only before run c is listed as only-in-b
    await addCase(app, agent.id, { name: 'late', expectation: 'must_not_flag', expected_output: [], input_diff: DIFF_OTHER });
    const c = await runSuite(app, agent.id);
    const onlyB = (await app.inject({ method: 'GET', url: `/eval-suite-runs/compare?a=${b.id}&b=${c.id}` })).json();
    expect(onlyB.only_in_b.map((x: { case_name: string }) => x.case_name)).toEqual(['late']);
  });

  it('compare rejects different agents (422), unknown runs (404) and malformed ids (422)', async () => {
    const app = await makeApp();
    const one = await agentWithCases(app);
    const two = await agentWithCases(app);
    mode.current = 'good';
    const a = await runSuite(app, one.agent.id);
    const b = await runSuite(app, two.agent.id);

    const diff = await app.inject({ method: 'GET', url: `/eval-suite-runs/compare?a=${a.id}&b=${b.id}` });
    expect(diff.statusCode).toBe(422);
    expect(diff.json().error.code).toBe('different_agents');

    const missing = await app.inject({ method: 'GET', url: `/eval-suite-runs/compare?a=${a.id}&b=00000000-0000-4000-8000-000000000000` });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'GET', url: `/eval-suite-runs/compare?a=nope&b=${b.id}` });
    expect(bad.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/eval-suite-runs/00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
  });
});
