import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { agentRuns } from './runs';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict', { enum: ['request_changes', 'approve', 'comment'] }),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    prIdx: index('reviews_pr_idx').on(t.prId),
    wsIdx: index('reviews_ws_idx').on(t.workspaceId),
    runIdx: index('reviews_run_idx').on(t.runId),
    // Defense-in-depth: the zod contracts (@devdigest/shared) already close
    // these to a fixed set; a DB-level CHECK stops a non-Drizzle writer
    // (a raw psql session, another service) from inserting an out-of-enum
    // value that would later blow up `Verdict.parse` / `reviewToDto`.
    kindCk: check('reviews_kind_ck', sql`${t.kind} in ('summary', 'review')`),
    verdictCk: check(
      'reviews_verdict_ck',
      sql`${t.verdict} in ('request_changes', 'approve', 'comment')`,
    ),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity', { enum: ['CRITICAL', 'WARNING', 'SUGGESTION'] }).notNull(),
    category: text('category', { enum: ['bug', 'security', 'perf', 'style', 'test'] }).notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind', { enum: ['finding', 'secret_leak', 'lethal_trifecta', 'phantom', 'hook'] })
      .notNull()
      .default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    reviewIdx: index('findings_review_idx').on(t.reviewId),
    severityCk: check(
      'findings_severity_ck',
      sql`${t.severity} in ('CRITICAL', 'WARNING', 'SUGGESTION')`,
    ),
    categoryCk: check(
      'findings_category_ck',
      sql`${t.category} in ('bug', 'security', 'perf', 'style', 'test')`,
    ),
    kindCk: check(
      'findings_kind_ck',
      sql`${t.kind} in ('finding', 'secret_leak', 'lethal_trifecta', 'phantom', 'hook')`,
    ),
  }),
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
