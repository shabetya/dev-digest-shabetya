import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  check,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Observability

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    provider: text('provider'),
    model: text('model'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    /** Actual/estimated USD cost of this run's LLM call(s); null when unknown. */
    costUsd: doublePrecision('cost_usd'),
    status: text('status', { enum: ['running', 'done', 'failed', 'cancelled'] }),
    /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
    error: text('error'),
    source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
    findingsCount: integer('findings_count'),
    grounding: text('grounding'),
    /** Review score (0-100) for this run; null on failed/cancelled runs. */
    score: integer('score'),
    /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
    blockers: integer('blockers'),
    /** The multi-agent run (one "Run multi-agent review" click) this run was
     *  fanned out from; null for a single-agent run. Set-null on delete of
     *  the parent so hard-deleting a `multi_agent_runs` row (there is no such
     *  route today) can't orphan this row's FK — see `multi_agent_runs.
     *  target_agents` for how the *reverse* deletion (this row deleted via
     *  `DELETE /runs/:id`) is detected instead. */
    multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    prIdx: index('agent_runs_pr_idx').on(t.prId),
    agentIdx: index('agent_runs_agent_idx').on(t.agentId),
    wsIdx: index('agent_runs_ws_idx').on(t.workspaceId),
    multiAgentRunIdx: index('agent_runs_multi_agent_run_idx').on(t.multiAgentRunId),
    // `status` is nullable (row starts running before a status is ever set in
    // some paths) — CHECK allows NULL to pass (three-valued logic) same as
    // any other CHECK constraint, so this only rejects a bad non-null value.
    statusCk: check(
      'agent_runs_status_ck',
      sql`${t.status} in ('running', 'done', 'failed', 'cancelled')`,
    ),
  }),
);

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

/** Which skills were active (linked + enabled) in a given run, and how many
 *  tokens each contributed — the queryable counterpart to
 *  `run_traces.trace.skills_detail` (a jsonb blob), used by the Skill Stats
 *  tab to aggregate without parsing JSON. Only written for runs that reached
 *  a persisted review (see run-executor.ts) — a failed/cancelled run has no
 *  rows here. */
export const runSkills = pgTable(
  'run_skills',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    tokens: integer('tokens').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.runId, t.skillId] }),
    skillIdx: index('run_skills_skill_idx').on(t.skillId),
  }),
);

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  /**
   * Snapshot of `{agent_id, agent_name}[]` taken at creation time (one entry
   * per targeted agent). `DELETE /runs/:id` hard-deletes `agent_runs` rows, so
   * the nullable `agent_runs.multi_agent_run_id` FK alone can't distinguish
   * "this agent's run was deleted" from "this agent was never part of the
   * run" once the row is gone — the detail endpoint diffs this snapshot
   * against the still-live `agent_runs` rows to render a "run deleted"
   * placeholder for the difference.
   */
  targetAgents: jsonb('target_agents')
    .$type<{ agent_id: string; agent_name: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});
