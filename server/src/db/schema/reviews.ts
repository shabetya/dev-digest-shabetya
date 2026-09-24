import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, boolean, index, check } from 'drizzle-orm/pg-core';
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
    /**
     * Intent-scope verdict (Intent Layer): true/false when the reviewing agent
     * judged this finding against a supplied PR intent; null when no intent
     * was available (pre-Intent-Layer rows, or intent computation failed).
     * `null` MUST read as "in scope" everywhere it's consumed.
     */
    inScope: boolean('in_scope'),
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

export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 0-1 self-reported confidence; nullable so pre-Intent-Layer rows (and any
     *  row computed before a confidence was assessed) stay valid without a
     *  fabricated value. */
    confidence: doublePrecision('confidence'),
    /** Which indirect signals were available when this Intent was computed. */
    sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    planLinkUrl: text('plan_link_url'),
    planLinkStatus: text('plan_link_status', {
      enum: ['not_linked', 'fetched', 'inaccessible'],
    })
      .notNull()
      .default('not_linked'),
    /** Provider/model that computed this Intent; null on legacy rows. */
    model: text('model'),
    /** The PR head SHA this Intent was computed against; null on legacy rows
     *  (also used to detect a stale Intent when the head moves). */
    computedForSha: text('computed_for_sha'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    confidenceCk: check(
      'pr_intent_confidence_ck',
      sql`${t.confidence} is null or (${t.confidence} between 0 and 1)`,
    ),
    planLinkStatusCk: check(
      'pr_intent_plan_link_status_ck',
      sql`${t.planLinkStatus} in ('not_linked', 'fetched', 'inaccessible')`,
    ),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
