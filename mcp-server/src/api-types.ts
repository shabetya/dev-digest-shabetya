import { z } from 'zod';

/**
 * Hand-copied minimal subset of `@devdigest/shared`'s contracts, verified
 * against the real schemas in `server/src/vendor/shared/contracts/` at the
 * time this package was written (knowledge.ts, platform.ts, findings.ts,
 * review-api.ts, trace.ts). This is a DELIBERATE hand-copy, not a vendored
 * copy — `mcp-server` is a pure HTTP client with no build-time coupling to
 * the API's source tree, so it only declares the fields these 5 tools
 * actually read. If the API's contracts change field names/shapes, update
 * this file by hand; zod strips unknown keys by default, so extra fields on
 * the real response never break parsing here.
 */

// ---- Agents (knowledge.ts § Agent) ----------------------------------------

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type Agent = z.infer<typeof AgentSchema>;

// ---- Repos (platform.ts § Repo) -------------------------------------------

export const RepoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});
export type Repo = z.infer<typeof RepoSchema>;

// ---- Pull requests (platform.ts § PrMeta) ----------------------------------

export const PrMetaSchema = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  status: z.string(),
});
export type PrMeta = z.infer<typeof PrMetaSchema>;

// ---- Conventions (knowledge.ts § ConventionCandidate) ----------------------
// Trimmed to the fields useful for a quick "what's accepted here" read.

export const ConventionCandidateSchema = z.object({
  id: z.string(),
  rule: z.string(),
  status: z.string(),
  confidence: z.number(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidateSchema>;

// ---- Findings (findings.ts § FindingShape, review-api.ts § FindingRecord) --

export const FindingRecordSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.enum(['bug', 'security', 'perf', 'style', 'test']),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  confidence: z.number(),
});
export type FindingRecord = z.infer<typeof FindingRecordSchema>;

// ---- Reviews (review-api.ts § ReviewRecord, ReviewRunResponse) ------------

export const ReviewRecordSchema = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  created_at: z.string(),
  findings: z.array(FindingRecordSchema),
});
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

export const ReviewRunTargetSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTargetSchema>;

export const ReviewRunResponseSchema = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTargetSchema),
  reviews: z.array(ReviewRecordSchema),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponseSchema>;

// ---- Runs (trace.ts § RunSummary, reviews/repository/run.repo.ts active-runs) --

/**
 * One entry of `GET /pulls/:id/runs/active`. NOTE: this list has no `status`
 * field — the run repository filters server-side to `status='running'`
 * (see `activeRunsForPull` in `server/src/modules/reviews/repository/run.repo.ts`),
 * so a run's presence/absence in this list *is* the "still running" signal.
 */
export const ActiveRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type ActiveRun = z.infer<typeof ActiveRunSchema>;

export const RunSummarySchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

// ---- Blast radius (brief.ts § BlastRadius, review-api.ts § BlastRadiusResponse) --

export const ChangedSymbolSchema = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbolSchema>;

export const BlastCallerSchema = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCallerSchema>;

export const DownstreamImpactSchema = z.object({
  symbol: z.string(),
  callers: z.array(BlastCallerSchema),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpactSchema>;

export const BlastRadiusSchema = z.object({
  changed_symbols: z.array(ChangedSymbolSchema),
  downstream: z.array(DownstreamImpactSchema),
  summary: z.string(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
});
export type BlastRadius = z.infer<typeof BlastRadiusSchema>;
