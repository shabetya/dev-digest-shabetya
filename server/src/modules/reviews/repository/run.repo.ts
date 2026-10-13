import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary, RunTrace } from '@devdigest/shared';
import type { FindingRow } from '../../../db/rows.js';

// ---- in-flight / history --------------------------------------------------

/** In-flight runs for a PR (status='running') — the server-side source of
 *  truth for "which agents are running now". Joined with the agent name. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        eq(t.agentRuns.status, 'running'),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));
  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
  }));
}

/**
 * Delete one agent run (+ its trace via FK cascade) AND the review it produced.
 * Workspace-scoped. `reviews.run_id` now has a real (ON DELETE SET NULL) FK to
 * `agent_runs`, which stops a dangling `run_id` from ever existing — but it
 * would only null the column, not remove the review, so the review (and its
 * findings, which DO cascade from `reviews`) must still be deleted explicitly
 * here, otherwise deleting a run from the timeline leaves its review/findings
 * behind, orphaned from the run that produced them. Both deletes run in one
 * transaction so a failure partway through can't leave the review gone but the
 * run still present (or vice versa).
 */
export async function deleteAgentRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .delete(t.reviews)
      .where(and(eq(t.reviews.runId, runId), eq(t.reviews.workspaceId, workspaceId)));
    const rows = await tx
      .delete(t.agentRuns)
      .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
      .returning({ id: t.agentRuns.id });
    return rows.length > 0;
  });
}

/** Mark a still-running run as cancelled (no-op if it already finished). */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled' })
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.status, 'running')))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'running' is orphaned (its process died / restarted),
 *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed' })
    .where(eq(t.agentRuns.status, 'running'))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row in `running` state; returns its id (= the runId). */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
    /** The multi_agent_runs row this run was fanned out from (2+ agent
     *  targets); omitted/null for a single-agent run. */
    multiAgentRunId?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: 'running',
      source: 'local',
      multiAgentRunId: values.multiAgentRunId ?? null,
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

// ---- Multi-Agent Review (SPEC-05) -----------------------------------------

/** Create a `multi_agent_runs` row for one "Run multi-agent review" click,
 *  snapshotting the targeted agents so a later individually-deleted
 *  `agent_runs` row can still be rendered as a placeholder (see
 *  `target_agents` column doc). Returns its id. */
export async function createMultiAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    targetAgents: { agent_id: string; agent_name: string }[];
  },
): Promise<string> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({
      workspaceId: values.workspaceId,
      prId: values.prId,
      targetAgents: values.targetAgents,
    })
    .returning({ id: t.multiAgentRuns.id });
  return row!.id;
}

/** One multi-run's resolved column data: the snapshot entry, its live
 *  `agent_runs` row (null when that row was individually hard-deleted via
 *  `DELETE /runs/:id` after being tagged — the "run deleted" placeholder
 *  case), and that run's persisted findings (empty when there's no run, or
 *  the run never reached a persisted review). */
export interface MultiAgentColumnData {
  agentId: string;
  agentName: string;
  run: (typeof t.agentRuns.$inferSelect) | null;
  findings: FindingRow[];
}

export interface MultiAgentRunDetail {
  id: string;
  prId: string;
  ranAt: Date;
  columns: MultiAgentColumnData[];
}

/**
 * Workspace-scoped join of one multi-run + every `agent_runs` row still
 * tagged with it, left-joined against the `target_agents` snapshot (iterated
 * from the snapshot, not the live rows) so an agent whose run was later
 * hard-deleted still produces a column (`run: null`) rather than silently
 * disappearing. Returns undefined when the multi-run doesn't exist or isn't
 * in this workspace.
 */
export async function getMultiAgentRunDetail(
  db: Db,
  workspaceId: string,
  multiRunId: string,
): Promise<MultiAgentRunDetail | undefined> {
  const [row] = await db
    .select()
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, multiRunId)));
  if (!row) return undefined;

  const snapshot = (row.targetAgents as { agent_id: string; agent_name: string }[]) ?? [];

  const runs = await db
    .select()
    .from(t.agentRuns)
    .where(
      and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.multiAgentRunId, multiRunId)),
    );
  const runByAgentId = new Map(runs.filter((r) => r.agentId).map((r) => [r.agentId as string, r]));

  const runIds = runs.map((r) => r.id);
  const reviews = runIds.length
    ? await db.select().from(t.reviews).where(inArray(t.reviews.runId, runIds))
    : [];
  const reviewIds = reviews.map((r) => r.id);
  const findingRows = reviewIds.length
    ? await db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds))
    : [];
  const findingsByRunId = new Map<string, FindingRow[]>();
  for (const review of reviews) {
    if (!review.runId) continue;
    const existing = findingsByRunId.get(review.runId) ?? [];
    existing.push(...findingRows.filter((f) => f.reviewId === review.id));
    findingsByRunId.set(review.runId, existing);
  }

  const columns: MultiAgentColumnData[] = snapshot.map((target) => {
    const run = runByAgentId.get(target.agent_id) ?? null;
    return {
      agentId: target.agent_id,
      agentName: target.agent_name,
      run,
      findings: run ? findingsByRunId.get(run.id) ?? [] : [],
    };
  });

  return { id: row.id, prId: row.prId, ranAt: row.ranAt, columns };
}

/** The agent's 10 most recent `status='done'` runs (workspace-scoped, no
 *  time cutoff) — the historical window AC-22's cost/time estimate is
 *  computed from. Excludes failed/cancelled/running rows explicitly so a
 *  naive "all runs" query can't pollute the median with 0/null-cost rows. */
export async function recentDoneRunsForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
  limit: number,
): Promise<{ durationMs: number | null; costUsd: number | null }[]> {
  return db
    .select({ durationMs: t.agentRuns.durationMs, costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        eq(t.agentRuns.status, 'done'),
      ),
    )
    .orderBy(desc(t.agentRuns.ranAt))
    .limit(limit);
}

export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    findingsCount: number;
    grounding: string;
    /** Review score (0-100); null on failed/cancelled runs. */
    score?: number | null;
    /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
    blockers?: number | null;
    /** Failure reason (status='failed') / cancellation note. Null clears it. */
    error?: string | null;
    /** USD cost of this run's LLM call(s); null when unknown. */
    costUsd?: number | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      error: values.error ?? null,
      costUsd: values.costUsd ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}

/** Which skills were active in a run (§ Skill Stats) — the queryable
 *  counterpart to the trace's skills_detail blob. Runs inside the caller's
 *  transaction (review + findings + run_skills as one unit). No-op for an
 *  empty list. */
export async function insertRunSkills(
  db: Db | Tx,
  runId: string,
  entries: { skillId: string; tokens: number }[],
): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(t.runSkills).values(entries.map((e) => ({ runId, skillId: e.skillId, tokens: e.tokens })));
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: Db, runId: string, trace: RunTrace): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

export async function getRunTrace(db: Db, runId: string): Promise<RunTrace | undefined> {
  const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
  return row ? (row.trace as RunTrace) : undefined;
}
