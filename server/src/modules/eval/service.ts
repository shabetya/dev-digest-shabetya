import type {
  AgentVersionConfig,
  EvalCaseBody,
  EvalCaseCreated,
  EvalCasePatch,
  EvalCaseSummary,
  EvalCompare,
  EvalDashboard,
  EvalRun,
  EvalRunResult,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
  Provider,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { loadDiff } from '../reviews/diff-loader.js';
import type { AgentRow } from '../../db/rows.js';
import { EvalRepository, type CaseRunWithCase, type EvalCaseRow } from './repository.js';
import {
  EVAL_CASE_TIMEOUT_MS,
  EVAL_CONCURRENCY,
  EVAL_DASHBOARD_WINDOW_DAYS,
  EVAL_DIFF_CAP_BYTES,
  EVAL_RECENT_RUNS_LIMIT,
  EVAL_REASON,
  EVAL_RUN_LIST_LIMIT,
  EVAL_SPARKLINE_POINTS,
  EVAL_SUITE_STALE_MS,
} from './constants.js';
import {
  buildAlert,
  buildFrozenReviewInput,
  buildInputMeta,
  caseRowToDto,
  caseRowToSummary,
  caseRunRowToDto,
  compareCaseRuns,
  compareDeltas,
  expectationFromFinding,
  expectationItemFromFinding,
  extractFileSnippet,
  metricDeltas,
  slugName,
  suiteRunRowToDto,
  trendPoint,
  validateCaseExpectation,
  type Metrics,
} from './helpers.js';
import {
  aggregate,
  scoreCase,
  type CaseScore,
  type ExpectationKind,
  type ScoredExpectation,
} from './scoring.js';

/** Minimal structured logger (pino-compatible) — same shape the reviews module uses. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/** What a suite/case run executes with: frozen config + pre-resolved skill bodies. */
interface RunContext {
  llm: Awaited<ReturnType<Container['llm']>>;
  config: AgentVersionConfig;
  skillBodies: string[];
}

/** A case that passed read-side validation and can be run. */
interface RunnableCase {
  row: EvalCaseRow;
  expectation: ExpectationKind;
  expected: ScoredExpectation[];
}

interface CaseOutcome {
  status: 'passed' | 'failed' | 'error';
  score: CaseScore | null;
  error: string | null;
  findings: { file: string; start_line: number; end_line: number; severity: string; category: string; title: string }[];
  preGroundingCount: number;
  costUsd: number | null;
  durationMs: number;
}

/**
 * Eval service (SPEC-04): case creation from findings, case CRUD, suite
 * execution, history/dashboard/compare.
 *
 * AC-14: runs are built ONLY from the case's frozen input via
 * `buildFrozenReviewInput` + `reviewPullRequest`. This class deliberately does
 * NOT use `ReviewRunExecutor` (it enriches with repo-intel / project context /
 * intent). No LLM/network call happens inside a DB transaction (there are none
 * here). Time comes from the injected `now`.
 */
export class EvalService {
  private repo: EvalRepository;
  private inflight = new Set<Promise<void>>();

  constructor(
    private container: Container,
    private deps: { now?: () => Date; logger?: Logger } = {},
  ) {
    this.repo = new EvalRepository(container.db);
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  /** Resolves when every background suite started by this instance has finished (tests). */
  async onIdle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  // ===========================================================================
  // Case creation from a finding (AC-4..7)
  // ===========================================================================

  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseCreated> {
    const reviewRepo = this.container.reviewRepo;
    const ctx = await reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');

    // Idempotent: a case for this finding already exists → return it (200).
    const existing = await this.repo.findCaseBySourceFinding(workspaceId, findingId);
    if (existing) return this.createdPayload(existing, false);

    const expectation = expectationFromFinding(ctx.finding);
    if (!expectation) {
      throw new AppError(
        EVAL_REASON.findingUndecided,
        'Accept or dismiss this finding before turning it into an eval case',
        409,
      );
    }

    const agentId = ctx.review.agentId;
    const agent = agentId ? await this.container.agentsRepo.getById(workspaceId, agentId) : undefined;
    if (!agentId || !agent) {
      throw new AppError(EVAL_REASON.noAgent, "This finding's agent no longer exists", 422);
    }

    const repoRow = await reviewRepo.getRepo(ctx.pull.repoId);
    if (!repoRow) throw new AppError(EVAL_REASON.diffUnavailable, 'The PR diff could not be loaded', 422);
    let rawDiff: string;
    try {
      rawDiff = (await loadDiff(this.container, reviewRepo, workspaceId, ctx.pull, repoRow)).raw;
    } catch {
      throw new AppError(EVAL_REASON.diffUnavailable, 'The PR diff could not be loaded', 422);
    }

    const snippet = extractFileSnippet(
      rawDiff,
      ctx.finding.file,
      ctx.finding.startLine,
      ctx.finding.endLine,
      EVAL_DIFF_CAP_BYTES,
    );
    if (!snippet.ok) {
      throw new AppError(
        snippet.reason,
        snippet.reason === EVAL_REASON.diffTooLarge
          ? "The finding's file diff is too large to store as an eval case"
          : "The finding's file is not in the PR diff",
        422,
      );
    }

    const row = await this.repo.insertCase({
      workspaceId,
      ownerId: agentId,
      name: slugName(ctx.finding.title),
      inputDiff: snippet.diff,
      inputFiles: snippet.files,
      inputMeta: buildInputMeta({
        prTitle: ctx.pull.title,
        prDescription: ctx.pull.body ?? null,
        agentId,
        agentVersion: agent.version,
      }),
      expectation,
      expectedOutput: [expectationItemFromFinding(ctx.finding)],
      sourceFindingId: findingId,
    });
    if (!row) {
      // Lost an idempotent-create race against the unique index.
      const winner = await this.repo.findCaseBySourceFinding(workspaceId, findingId);
      if (!winner) throw new AppError('eval_case_conflict', 'Could not create the eval case', 409);
      return this.createdPayload(winner, false);
    }
    return this.createdPayload(row, true);
  }

  private createdPayload(row: EvalCaseRow, created: boolean): EvalCaseCreated {
    const dto = caseRowToDto(row);
    if (!dto) throw new AppError(EVAL_REASON.invalidCase, 'Stored eval case is invalid', 422);
    return { created, case: dto, agent_id: row.ownerId };
  }

  // ===========================================================================
  // Case CRUD (AC-9)
  // ===========================================================================

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listCases(workspaceId, agentId);
    const last = await this.repo.lastRunPerCase(rows.map((r) => r.id));
    return rows.map((r) => caseRowToSummary(r, last.get(r.id)));
  }

  async createCase(workspaceId: string, agentId: string, body: EvalCaseBody): Promise<EvalCaseSummary> {
    await this.requireAgent(workspaceId, agentId);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerId: agentId,
      name: body.name,
      inputDiff: body.input_diff,
      inputFiles: body.input_files ?? null,
      inputMeta: body.input_meta ?? null,
      expectation: body.expectation,
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
    });
    if (!row) throw new AppError('eval_case_conflict', 'Could not create the eval case', 409);
    return caseRowToSummary(row, undefined);
  }

  async updateCase(workspaceId: string, caseId: string, patch: EvalCasePatch): Promise<EvalCaseSummary> {
    const existing = await this.repo.getCase(workspaceId, caseId);
    if (!existing || existing.ownerKind !== 'agent') throw new NotFoundError('Eval case not found');

    // Re-validate the MERGED expectation pair; a rename alone must still work
    // on a row whose stored expectation is already invalid.
    if (patch.expectation !== undefined || patch.expected_output !== undefined) {
      const v = validateCaseExpectation(
        patch.expectation ?? existing.expectation,
        patch.expected_output ?? existing.expectedOutput,
      );
      if (!v.ok) throw new ValidationError(v.reason);
    }
    const row = await this.repo.updateCase(workspaceId, caseId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expectation !== undefined ? { expectation: patch.expectation } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
    });
    if (!row) throw new NotFoundError('Eval case not found');
    const last = await this.repo.lastRunPerCase([row.id]);
    return caseRowToSummary(row, last.get(row.id));
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const ok = await this.repo.deleteCase(workspaceId, caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
  }

  // ===========================================================================
  // Running (AC-11..15)
  // ===========================================================================

  /** Snapshot an agent's current config (AgentVersionConfig shape — never keys) + skill bodies. */
  private async snapshotAgent(
    agent: AgentRow,
  ): Promise<{ config: AgentVersionConfig; skillBodies: string[] }> {
    const linked = await this.container.agentsRepo.linkedSkills(agent.id);
    const config: AgentVersionConfig = {
      provider: agent.provider as Provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      output_schema: agent.outputSchema ?? null,
      strategy: agent.strategy,
      ci_fail_on: agent.ciFailOn,
      repo_intel: agent.repoIntel,
      skills: linked.map((l) => l.skill.id),
    };
    // Same gate as production: a linked skill must also be enabled itself.
    const skillBodies = linked.filter((l) => l.skill.enabled).map((l) => l.skill.body);
    return { config, skillBodies };
  }

  private async resolveLlm(provider: Provider): Promise<RunContext['llm']> {
    try {
      return await this.container.llm(provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(EVAL_REASON.llmUnavailable, err.message, 422);
      }
      throw err;
    }
  }

  private toRunnable(row: EvalCaseRow): RunnableCase | null {
    const v = validateCaseExpectation(row.expectation, row.expectedOutput);
    if (!v.ok) return null;
    return { row, expectation: row.expectation, expected: v.items };
  }

  /** Run ONE case against the agent's CURRENT config; no suite run is created (AC-15). */
  async runCase(workspaceId: string, caseId: string): Promise<EvalRunResult> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row || row.ownerKind !== 'agent') throw new NotFoundError('Eval case not found');
    const runnable = this.toRunnable(row);
    if (!runnable) throw new AppError(EVAL_REASON.invalidCase, 'This eval case is invalid — fix its expected output first', 422);
    const agent = await this.requireAgent(workspaceId, row.ownerId);
    const { config, skillBodies } = await this.snapshotAgent(agent);
    const llm = await this.resolveLlm(config.provider);

    const outcome = await this.executeCase({ llm, config, skillBodies }, runnable);
    const saved = await this.repo.insertCaseRun({
      caseId: row.id,
      suiteRunId: null,
      ...persistable(outcome, runnable),
    });
    const caseRun = caseRunRowToDto(saved, row.name, row.expectation);
    const result: EvalRun = {
      recall: caseRun.recall,
      precision: caseRun.precision,
      citation_accuracy: caseRun.citation_accuracy,
      traces_passed: outcome.status === 'passed' ? 1 : 0,
      traces_total: 1,
      duration_ms: outcome.durationMs,
      cost_usd: outcome.costUsd,
      per_trace: [
        {
          name: row.name,
          pass: outcome.status === 'passed',
          expected: runnable.expected,
          actual: outcome.findings,
        },
      ],
    };
    return { run_id: saved.id, case_id: row.id, result, case_run: caseRun };
  }

  /**
   * Start a suite: validate, snapshot, insert the `running` row, then execute in
   * the background. Responds as soon as the row exists (the route returns 202).
   */
  async startSuite(workspaceId: string, agentId: string): Promise<EvalSuiteRun> {
    await this.sweepStale(workspaceId);
    const agent = await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listCases(workspaceId, agentId);
    const runnable = rows.map((r) => this.toRunnable(r)).filter((c): c is RunnableCase => c !== null);
    if (runnable.length === 0) {
      throw new AppError(EVAL_REASON.noCases, 'This agent has no runnable eval cases', 422);
    }

    // Skill bodies resolved ONCE here and held in memory for the whole run.
    const { config, skillBodies } = await this.snapshotAgent(agent);
    const suite = await this.repo.createSuite({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      configSnapshot: config,
      casesTotal: runnable.length,
    });
    if (!suite) {
      const active = await this.repo.getRunningSuite(workspaceId, agentId);
      throw new AppError(
        EVAL_REASON.suiteRunning,
        'An eval run is already in progress for this agent',
        409,
        { run_id: active?.id ?? null },
      );
    }

    // No LLM key/provider → fail fast, no partial metrics (AC-13).
    let llm: RunContext['llm'];
    try {
      llm = await this.container.llm(config.provider);
    } catch (err) {
      const message = (err as Error).message;
      await this.repo.finishSuite(suite.id, {
        status: 'failed',
        reason: EVAL_REASON.llmUnavailable,
        error: message,
        recall: null,
        precision: null,
        citationAccuracy: null,
        casesPassed: 0,
        casesTotal: runnable.length,
        costUsd: null,
        durationMs: 0,
      });
      return this.suiteDto(workspaceId, suite.id);
    }

    const startedAt = this.now().getTime();
    const job = this.executeSuite(suite.id, { llm, config, skillBodies }, runnable, startedAt)
      .catch(async (err) => {
        this.deps.logger?.error({ suiteId: suite.id, err: (err as Error).message }, 'eval: suite crashed');
        await this.repo
          .finishSuite(suite.id, {
            status: 'failed',
            reason: 'internal_error',
            error: (err as Error).message,
            recall: null,
            precision: null,
            citationAccuracy: null,
            casesPassed: 0,
            casesTotal: runnable.length,
            costUsd: null,
            durationMs: this.now().getTime() - startedAt,
          })
          .catch(() => undefined);
      })
      .finally(() => this.inflight.delete(job));
    this.inflight.add(job);

    return this.suiteDto(workspaceId, suite.id);
  }

  private async executeSuite(
    suiteId: string,
    ctx: RunContext,
    cases: RunnableCase[],
    startedAt: number,
  ): Promise<void> {
    const outcomes: CaseOutcome[] = [];
    await mapWithConcurrency(cases, EVAL_CONCURRENCY, async (c) => {
      const outcome = await this.executeCase(ctx, c);
      outcomes.push(outcome);
      // Appended as each case finishes so the poller sees rows fill in.
      await this.repo.insertCaseRun({ caseId: c.row.id, suiteRunId: suiteId, ...persistable(outcome, c) });
    });

    // Errored cases are excluded from every metric denominator (AC-13).
    const scored = outcomes.flatMap((o) => (o.score ? [o.score] : []));
    const agg = aggregate(scored);
    const costs = outcomes.flatMap((o) => (o.costUsd === null ? [] : [o.costUsd]));
    await this.repo.finishSuite(suiteId, {
      status: 'completed',
      recall: agg.recall,
      precision: agg.precision,
      citationAccuracy: agg.citationAccuracy,
      casesPassed: outcomes.filter((o) => o.status === 'passed').length,
      casesTotal: cases.length,
      costUsd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
      durationMs: this.now().getTime() - startedAt,
    });
  }

  /** Run one case on its frozen input; never throws (errors become an `error` outcome). */
  private async executeCase(ctx: RunContext, c: RunnableCase): Promise<CaseOutcome> {
    const start = this.now().getTime();
    let timedOut = false;
    try {
      const input = buildFrozenReviewInput({
        config: ctx.config,
        skillBodies: ctx.skillBodies,
        caseInput: { inputDiff: c.row.inputDiff, inputMeta: c.row.inputMeta },
      });
      const outcome = await withTimeout(
        reviewPullRequest({
          ...input,
          llm: ctx.llm,
          // Stop before the next chunk call once the timeout fired.
          checkCancelled: () => {
            if (timedOut) throw new TimeoutError(EVAL_CASE_TIMEOUT_MS);
          },
        }),
        EVAL_CASE_TIMEOUT_MS,
      ).catch((err) => {
        timedOut = true;
        throw err;
      });

      const findings = outcome.review.findings.map((f) => ({
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        severity: f.severity,
        category: f.category,
        title: f.title,
      }));
      const score = scoreCase({
        expectation: c.expectation,
        expected: c.expected,
        findings,
        preGroundingCount: outcome.preGroundingCount,
      });
      return {
        status: score.pass ? 'passed' : 'failed',
        score,
        error: null,
        findings,
        preGroundingCount: outcome.preGroundingCount,
        costUsd: outcome.costUsd,
        durationMs: this.now().getTime() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        score: null,
        error: (err as Error).message,
        findings: [],
        preGroundingCount: 0,
        costUsd: null,
        durationMs: this.now().getTime() - start,
      };
    }
  }

  // ===========================================================================
  // Reads: suite run, history, dashboards, compare (AC-16, 23..25)
  // ===========================================================================

  /** Mark `running` suites older than the stale window as failed (restart safety). */
  private async sweepStale(workspaceId: string): Promise<void> {
    const cutoff = new Date(this.now().getTime() - EVAL_SUITE_STALE_MS);
    await this.repo.markStaleFailed(workspaceId, cutoff, EVAL_REASON.stale);
  }

  private async suiteDto(workspaceId: string, suiteId: string): Promise<EvalSuiteRun> {
    const found = await this.repo.getSuiteRun(workspaceId, suiteId);
    if (!found) throw new NotFoundError('Eval run not found');
    return suiteRunRowToDto(found.run, found.agentName);
  }

  async getSuiteRun(workspaceId: string, suiteId: string): Promise<EvalSuiteRunDetail> {
    await this.sweepStale(workspaceId);
    const found = await this.repo.getSuiteRun(workspaceId, suiteId);
    if (!found) throw new NotFoundError('Eval run not found');
    const caseRuns = await this.repo.listCaseRunsForSuite(suiteId);
    return {
      ...suiteRunRowToDto(found.run, found.agentName),
      case_runs: caseRuns.map(toCaseRunDto),
    };
  }

  async listSuiteRuns(workspaceId: string, agentId: string): Promise<EvalSuiteRun[]> {
    await this.requireAgent(workspaceId, agentId);
    await this.sweepStale(workspaceId);
    const rows = await this.repo.listSuiteRuns(workspaceId, { agentId, limit: EVAL_RUN_LIST_LIMIT });
    return rows.map((r) => suiteRunRowToDto(r.run, r.agentName));
  }

  async workspaceDashboard(workspaceId: string): Promise<EvalWorkspaceDashboard> {
    await this.sweepStale(workspaceId);
    const [agents, counts, completed, recent] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.caseCountsByAgent(workspaceId),
      this.repo.listSuiteRuns(workspaceId, { status: 'completed', limit: 1000 }),
      this.repo.listSuiteRuns(workspaceId, { limit: EVAL_RECENT_RUNS_LIMIT }),
    ]);
    const byAgent = new Map<string, EvalSuiteRun[]>();
    for (const r of completed) {
      const dto = suiteRunRowToDto(r.run, r.agentName);
      const list = byAgent.get(dto.agent_id) ?? [];
      list.push(dto); // newest first
      byAgent.set(dto.agent_id, list);
    }
    return {
      agents: agents.map((a) => {
        const runs = byAgent.get(a.id) ?? [];
        return {
          agent_id: a.id,
          agent_name: a.name,
          provider: a.provider as Provider,
          model: a.model,
          cases_total: counts.get(a.id) ?? 0,
          latest: runs[0] ?? null,
          sparkline: runs.slice(0, EVAL_SPARKLINE_POINTS).reverse().map(trendPoint),
        };
      }),
      recent_runs: recent.map((r) => suiteRunRowToDto(r.run, r.agentName)),
    };
  }

  async agentDashboard(
    workspaceId: string,
    agentId: string,
    days: number = EVAL_DASHBOARD_WINDOW_DAYS,
  ): Promise<EvalDashboard> {
    await this.requireAgent(workspaceId, agentId);
    await this.sweepStale(workspaceId);
    const since = new Date(this.now().getTime() - days * 24 * 60 * 60 * 1000);
    const [casesTotal, lastTwo, windowRuns] = await Promise.all([
      this.repo.countCases(workspaceId, agentId),
      this.repo.listSuiteRuns(workspaceId, { agentId, status: 'completed', limit: 2 }),
      this.repo.listSuiteRuns(workspaceId, { agentId, since, limit: EVAL_RUN_LIST_LIMIT }),
    ]);
    const latest = lastTwo[0] ? suiteRunRowToDto(lastTwo[0].run, lastTwo[0].agentName) : null;
    const previous = lastTwo[1] ? suiteRunRowToDto(lastTwo[1].run, lastTwo[1].agentName) : null;
    const current: Metrics = {
      recall: latest?.recall ?? null,
      precision: latest?.precision ?? null,
      citation_accuracy: latest?.citation_accuracy ?? null,
    };
    const delta = metricDeltas(
      current,
      previous
        ? { recall: previous.recall, precision: previous.precision, citation_accuracy: previous.citation_accuracy }
        : null,
    );
    const windowDtos = windowRuns.map((r) => suiteRunRowToDto(r.run, r.agentName));
    return {
      owner_kind: 'agent',
      owner_id: agentId,
      cases_total: casesTotal,
      current: {
        ...current,
        traces_passed: latest?.cases_passed ?? 0,
        traces_total: latest?.cases_total ?? 0,
        cost_usd: latest?.cost_usd ?? null,
      },
      delta: { recall: delta.recall, precision: delta.precision, citation_accuracy: delta.citation_accuracy },
      trend: windowDtos
        .filter((r) => r.status === 'completed')
        .reverse()
        .map(trendPoint),
      recent_runs: windowDtos,
      alert: latest && previous ? buildAlert(delta, latest.agent_version) : null,
    };
  }

  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalCompare> {
    const [a, b] = await Promise.all([
      this.repo.getSuiteRun(workspaceId, aId),
      this.repo.getSuiteRun(workspaceId, bId),
    ]);
    if (!a || !b) throw new NotFoundError('Eval run not found');
    if (a.run.agentId !== b.run.agentId) {
      throw new AppError(EVAL_REASON.differentAgents, 'Both runs must belong to the same agent', 422);
    }
    const [casesA, casesB] = await Promise.all([
      this.repo.listCaseRunsForSuite(a.run.id),
      this.repo.listCaseRunsForSuite(b.run.id),
    ]);
    const dtoA = suiteRunRowToDto(a.run, a.agentName);
    const dtoB = suiteRunRowToDto(b.run, b.agentName);
    const toCompare = (rows: CaseRunWithCase[]) =>
      rows.map((r) => ({ case_id: r.run.caseId, case_name: r.caseName, passed: r.run.status === 'passed' }));
    return {
      a: dtoA,
      b: dtoB,
      delta: compareDeltas(dtoA, dtoB),
      ...compareCaseRuns(toCompare(casesA), toCompare(casesB)),
    };
  }
}

// ---------------------------------------------------------------------------
// module-private helpers
// ---------------------------------------------------------------------------

function toCaseRunDto(r: CaseRunWithCase) {
  return caseRunRowToDto(r.run, r.caseName, r.expectation);
}

/** Map an outcome to the columns persisted on `eval_runs`. */
function persistable(outcome: CaseOutcome, c: RunnableCase) {
  return {
    status: outcome.status,
    pass: outcome.status === 'error' ? null : outcome.status === 'passed',
    error: outcome.error,
    actualOutput: {
      findings: outcome.findings,
      pre_grounding_count: outcome.preGroundingCount,
      expected_count: c.expected.length,
      expectation: c.expectation,
    },
    recall: outcome.score?.recall ?? null,
    precision: outcome.score?.precision ?? null,
    citationAccuracy: outcome.score?.citationAccuracy ?? null,
    durationMs: outcome.durationMs,
    costUsd: outcome.costUsd,
  };
}

/** Run `fn` over `items` with at most `limit` in flight; rejects on the first throw. */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
