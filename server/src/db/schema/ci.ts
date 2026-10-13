import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  doublePrecision,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One installation row per agent+repo (re-export upserts in place, AC-7 edge case).
    agentRepoUq: uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repo),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
    /** Head commit SHA the run reviewed (AC-15's real dedupe/validation key). */
    commitSha: text('commit_sha'),
    /** GitHub Actions run id (`github.run_id`) — half of the dedupe key below. */
    githubRunId: text('github_run_id'),
    /** AC-17: how long the review run took, from `CiResultArtifact.duration_ms` — null until ingested. */
    durationMs: integer('duration_ms'),
  },
  (t) => ({
    // Re-running Refresh against the same GH Actions run must be idempotent
    // (AC-16a). `ciInstallationId` is nullable (`onDelete: 'set null'`), and a
    // plain unique index treats NULLs as distinct per row — `NULLS NOT
    // DISTINCT` (PG16, confirmed via docker-compose.yml's pgvector/pg16 image)
    // closes that gap so two null-installation rows with the same
    // `github_run_id` still collide. Only `uniqueIndex()` lacks a
    // `.nullsNotDistinct()` builder in this drizzle-orm version — the
    // table-level `unique()` constraint has it, so that's used here instead.
    installationRunUq: unique('ci_runs_installation_run_uq')
      .on(t.ciInstallationId, t.githubRunId)
      .nullsNotDistinct(),
  }),
);
