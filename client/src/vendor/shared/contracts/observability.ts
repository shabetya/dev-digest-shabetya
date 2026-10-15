import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/**
 * A finding as surfaced in a multi-agent column (subset of FindingRecord —
 * SPEC-05 extends this with `confidence`/`rationale`/`suggestion`/
 * `accepted_at`/`dismissed_at` so the results page's detail panel (AC-14) can
 * render a full finding and its accept/dismiss state without a second shape).
 */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
  confidence: z.number(),
  rationale: z.string(),
  suggestion: z.string().nullable(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/**
 * One agent's result column in the multi-agent review. `run_id` is null and
 * `status` is `'deleted'` for an agent present in the multi-run's
 * `target_agents` snapshot whose `agent_runs` row was later hard-deleted via
 * `DELETE /runs/:id` (SPEC-05 edge case) — every other field is then null/[]
 * since there is nothing left to show.
 */
export const AgentColumn = z.object({
  run_id: z.string().nullable(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running', 'cancelled', 'deleted']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * One distinct code location (file + overlapping line range) that at least
 * one agent flagged, with every selected agent's verdict there — including
 * `'ignored'` for an agent that reviewed but raised nothing at that location.
 * This includes full-agreement locations too: the client's "Show only
 * conflicts" toggle (AC-18) filters those out of an otherwise-complete list,
 * rather than the server only ever returning disagreements. Computed from
 * persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
  /**
   * `'pending'` while most columns are still `running` (conflict-matching is
   * deliberately short-circuited mid-flight — see `shouldComputeConflicts`);
   * `'computed'` once the matching pass has actually run. Both states can
   * serialize `conflicts` as `[]`, but they mean different things — "not
   * computed yet" vs. "computed, zero disagreements" — so a client showing
   * the same empty "Where agents disagree" panel for both would silently
   * imply a conclusion ("agents agree") the system hasn't reached yet.
   * Mirrors `shouldComputeConflicts`'s own condition exactly (the <2-columns
   * case also reports `'pending'` here, but the client never renders the
   * panel at all below 2 columns, so that's moot).
   */
  conflicts_status: z.enum(['pending', 'computed']),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/**
 * Per-agent historical cost/time estimate (AC-22/23) — computed at query time
 * from that agent's 10 most recent `status='done'` `agent_runs` rows, never
 * from a stored static field. `median_duration_ms`/`median_cost_usd` are null
 * when the agent has zero completed historical runs ("no history yet"); the
 * client excludes such an agent from a combined total rather than treating
 * null as 0.
 */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  median_duration_ms: z.number().int().nullable(),
  median_cost_usd: z.number().nullable(),
  sample_size: z.number().int(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

/** Response of `GET /agents/estimates` — one entry per workspace agent. */
export const AgentEstimateList = z.object({
  estimates: z.array(AgentEstimate),
});
export type AgentEstimateList = z.infer<typeof AgentEstimateList>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
