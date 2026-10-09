import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow, EvalSuiteRunRow } from '../../db/rows.js';

/**
 * Eval data-access (SPEC-04). The ONLY layer touching the DB for the eval
 * domain; owns `eval_cases`, `eval_suite_runs`, `eval_runs`. Every read by id
 * carries the workspace. No transactions here and no LLM/network calls — the
 * service sequences those.
 */

export type { EvalCaseRow, EvalRunRow, EvalSuiteRunRow };

export interface SuiteRunWithAgent {
  run: EvalSuiteRunRow;
  agentName: string;
}

export interface CaseRunWithCase {
  run: EvalRunRow;
  caseName: string;
  expectation: string;
}

export interface InsertCase {
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles: unknown;
  inputMeta: unknown;
  expectation: 'must_find' | 'must_not_flag';
  expectedOutput: unknown;
  notes?: string | null;
  sourceFindingId?: string | null;
}

export interface UpdateCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectation?: 'must_find' | 'must_not_flag';
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertCaseRun {
  caseId: string;
  suiteRunId: string | null;
  status: 'passed' | 'failed' | 'error';
  pass: boolean | null;
  error: string | null;
  actualOutput: unknown;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export interface FinishSuite {
  status: 'completed' | 'failed';
  reason?: string | null;
  error?: string | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  casesPassed: number;
  casesTotal: number;
  costUsd: number | null;
  durationMs: number | null;
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases ---------------------------------------------------------------

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(...caseOwner(workspaceId, agentId)))
      .orderBy(t.evalCases.createdAt);
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(...caseOwner(workspaceId, agentId)));
    return row?.n ?? 0;
  }

  /** Case counts per agent for the workspace dashboard. */
  async caseCountsByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, r.n]));
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row;
  }

  async findCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.sourceFindingId, findingId)),
      );
    return row;
  }

  /**
   * Insert a case. `undefined` when a case already exists for the same
   * `source_finding_id` (the unique index) — the idempotent-create race.
   */
  async insertCase(values: InsertCase): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: 'agent',
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: values.inputFiles ?? null,
        inputMeta: values.inputMeta ?? null,
        expectation: values.expectation,
        expectedOutput: values.expectedOutput ?? [],
        notes: values.notes ?? null,
        sourceFindingId: values.sourceFindingId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles ?? null } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta ?? null } : {}),
        ...(patch.expectation !== undefined ? { expectation: patch.expectation } : {}),
        ...(patch.expectedOutput !== undefined ? { expectedOutput: patch.expectedOutput } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Newest case-run per case (any suite or stand-alone), keyed by case id. */
  async lastRunPerCase(caseIds: string[]): Promise<Map<string, EvalRunRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId])
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    return new Map(rows.map((r) => [r.caseId, r]));
  }

  // ---- suite runs ----------------------------------------------------------

  /**
   * Start a suite. `undefined` when the agent already has a `running` suite
   * (the partial unique index) — the caller maps that to 409.
   */
  async createSuite(values: {
    workspaceId: string;
    agentId: string;
    agentVersion: number;
    configSnapshot: unknown;
    casesTotal: number;
  }): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: values.agentVersion,
        configSnapshot: values.configSnapshot as object,
        casesTotal: values.casesTotal,
        status: 'running',
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async getRunningSuite(workspaceId: string, agentId: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return row;
  }

  /** Append one case result. Metrics are NOT aggregated here (single update at finish). */
  async insertCaseRun(values: InsertCaseRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        suiteRunId: values.suiteRunId,
        status: values.status,
        pass: values.pass,
        error: values.error,
        actualOutput: (values.actualOutput ?? null) as object | null,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
      })
      .returning();
    return row!;
  }

  /**
   * Finish a suite in ONE update (aggregates + status). Guarded on
   * `status='running'` so a suite already swept to `failed` is never resurrected.
   */
  async finishSuite(suiteId: string, v: FinishSuite): Promise<boolean> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: v.status,
        reason: v.reason ?? null,
        error: v.error ?? null,
        recall: v.recall,
        precision: v.precision,
        citationAccuracy: v.citationAccuracy,
        casesPassed: v.casesPassed,
        casesTotal: v.casesTotal,
        costUsd: v.costUsd,
        durationMs: v.durationMs,
      })
      .where(and(eq(t.evalSuiteRuns.id, suiteId), eq(t.evalSuiteRuns.status, 'running')))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length > 0;
  }

  /** Mark `running` suites started before `cutoff` as failed/stale (read-side sweep). */
  async markStaleFailed(workspaceId: string, cutoff: Date, reason: string): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', reason, error: 'Suite did not finish (server restarted or timed out)' })
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.status, 'running'),
          lt(t.evalSuiteRuns.ranAt, cutoff),
        ),
      )
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }

  async getSuiteRun(workspaceId: string, suiteId: string): Promise<SuiteRunWithAgent | undefined> {
    const [row] = await this.db
      .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, suiteId)));
    return row;
  }

  /** Suite runs, newest first; optionally one agent and/or since a cutoff. */
  async listSuiteRuns(
    workspaceId: string,
    opts: { agentId?: string; since?: Date; status?: EvalSuiteRunRow['status']; limit: number },
  ): Promise<SuiteRunWithAgent[]> {
    const conds = [eq(t.evalSuiteRuns.workspaceId, workspaceId)];
    if (opts.agentId) conds.push(eq(t.evalSuiteRuns.agentId, opts.agentId));
    if (opts.since) conds.push(gte(t.evalSuiteRuns.ranAt, opts.since));
    if (opts.status) conds.push(eq(t.evalSuiteRuns.status, opts.status));
    return this.db
      .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
      .where(and(...conds))
      .orderBy(desc(t.evalSuiteRuns.ranAt))
      .limit(opts.limit);
  }

  /** Case results of one suite, with the case name + expectation (case may be gone → name from join only). */
  async listCaseRunsForSuite(suiteId: string): Promise<CaseRunWithCase[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name, expectation: t.evalCases.expectation })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(eq(t.evalRuns.suiteRunId, suiteId))
      .orderBy(t.evalRuns.ranAt);
    return rows;
  }
}

function caseOwner(workspaceId: string, agentId: string) {
  return [
    eq(t.evalCases.workspaceId, workspaceId),
    eq(t.evalCases.ownerKind, 'agent'),
    eq(t.evalCases.ownerId, agentId),
  ];
}
