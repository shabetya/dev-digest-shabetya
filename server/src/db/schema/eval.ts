import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    /** must_find (from an accepted finding) | must_not_flag (from a dismissed one). */
    expectation: text('expectation', { enum: ['must_find', 'must_not_flag'] })
      .notNull()
      .default('must_find'),
    /** Provenance only: the case owns a frozen copy of its input, so deleting
     *  the finding/PR must NOT delete the case. */
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /** Bumped on edit; drives the "edited since last run" hint. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('eval_cases_owner_idx').on(t.ownerKind, t.ownerId),
    wsIdx: index('eval_cases_ws_idx').on(t.workspaceId),
    // One case per source finding (idempotent create; NULLs stay distinct).
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
    expectationCk: check(
      'eval_cases_expectation_ck',
      sql`${t.expectation} in ('must_find', 'must_not_flag')`,
    ),
  }),
);

/** One "Run all" of an agent's test set under a frozen config snapshot. */
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    /** `agents.version` at suite start. */
    agentVersion: integer('agent_version').notNull(),
    /** AgentVersionConfig-shaped snapshot (provider/model/prompt/skill ids…); never keys. */
    configSnapshot: jsonb('config_snapshot').notNull(),
    status: text('status', { enum: ['running', 'completed', 'failed'] })
      .notNull()
      .default('running'),
    /** Machine-readable failure reason (e.g. `llm_unavailable`, `stale`). */
    reason: text('reason'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    casesPassed: integer('cases_passed').notNull().default(0),
    casesTotal: integer('cases_total').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    error: text('error'),
  },
  (t) => ({
    agentRanIdx: index('eval_suite_runs_agent_ran_idx').on(t.agentId, t.ranAt),
    wsIdx: index('eval_suite_runs_ws_idx').on(t.workspaceId),
    // One active suite per agent; a violation maps to 409 in the service.
    oneRunningPerAgent: uniqueIndex('eval_suite_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
    statusCk: check(
      'eval_suite_runs_status_ck',
      sql`${t.status} in ('running', 'completed', 'failed')`,
    ),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    /** Null for a stand-alone single-case run. */
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    /** `{ findings, pre_grounding_count, expected_count, expectation }`. */
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    /** passed | failed | error (null on pre-SPEC-04 rows). */
    status: text('status', { enum: ['passed', 'failed', 'error'] }),
    error: text('error'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    suiteIdx: index('eval_runs_suite_idx').on(t.suiteRunId),
    caseIdx: index('eval_runs_case_idx').on(t.caseId, t.ranAt),
    statusCk: check(
      'eval_runs_status_ck',
      sql`${t.status} is null or ${t.status} in ('passed', 'failed', 'error')`,
    ),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
