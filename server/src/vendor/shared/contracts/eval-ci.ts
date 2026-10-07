import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalRun,
  EvalOwnerKind,
  EvalExpectationType,
  EvalExpectationList,
  EvalCase,
  refineExpectationList,
  AgentVersionConfig,
  Conformance,
  Provider,
  CiFailOn,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/**
 * Field-level shape of an eval case write (no cross-field rule yet). Exported
 * so route bodies can `.omit()` / `.partial()` it; `EvalCaseInput` below adds
 * the "empty expected_output only with must_not_flag" rule.
 */
export const EvalCaseInputBase = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expectation: EvalExpectationType.default('must_find'),
  expected_output: EvalExpectationList,
  notes: z.string().nullish(),
});

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = EvalCaseInputBase.superRefine(refineExpectationList);
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type EvalCaseInputBody = z.input<typeof EvalCaseInput>;

/** `POST /agents/:id/eval-cases` body — the owner comes from the path. */
export const EvalCaseBody = EvalCaseInputBase.omit({
  owner_kind: true,
  owner_id: true,
}).superRefine(refineExpectationList);
export type EvalCaseBody = z.infer<typeof EvalCaseBody>;
export type EvalCaseBodyInput = z.input<typeof EvalCaseBody>;

/** `PATCH /eval-cases/:id` body — any subset; the merged result is re-validated. */
export const EvalCasePatch = EvalCaseInputBase.omit({ owner_kind: true, owner_id: true }).partial();
export type EvalCasePatch = z.infer<typeof EvalCasePatch>;

/** Outcome of one case in a run. `error` = the case could not be scored. */
export const EvalCaseStatus = z.enum(['passed', 'failed', 'error']);
export type EvalCaseStatus = z.infer<typeof EvalCaseStatus>;

/** Last-run summary shown on a case row (`never_run` when no case run exists). */
export const EvalCaseLastRun = z.object({
  status: z.enum(['passed', 'failed', 'error', 'never_run']),
  run_id: z.string().nullable(),
  ran_at: z.string().nullable(),
  expected_count: z.number().int().nullable(),
  actual_count: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type EvalCaseLastRun = z.infer<typeof EvalCaseLastRun>;

/**
 * A case as listed for an agent. `expected_output` is `unknown` here on purpose:
 * a stored row that fails the expectation schema is surfaced as `invalid: true`
 * (excluded from runs) instead of failing the whole list.
 */
export const EvalCaseSummary = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expectation: EvalExpectationType,
  expected_output: z.unknown(),
  source_finding_id: z.string().nullable(),
  notes: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string(),
  invalid: z.boolean(),
  invalid_reason: z.string().nullable(),
  edited_since_last_run: z.boolean(),
  last_run: EvalCaseLastRun,
});
export type EvalCaseSummary = z.infer<typeof EvalCaseSummary>;

/** `POST /findings/:id/eval-case` response: `created` distinguishes 201 vs idempotent 200. */
export const EvalCaseCreated = z.object({
  created: z.boolean(),
  case: EvalCase,
  agent_id: z.string(),
});
export type EvalCaseCreated = z.infer<typeof EvalCaseCreated>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** One case's result inside a suite run (or a stand-alone single-case run). */
export const EvalCaseRun = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullable(),
  suite_run_id: z.string().nullable(),
  ran_at: z.string(),
  status: EvalCaseStatus,
  pass: z.boolean().nullable(),
  error: z.string().nullable(),
  expectation: EvalExpectationType.nullable(),
  expected_count: z.number().int(),
  actual_count: z.number().int(),
  pre_grounding_count: z.number().int(),
  /** Grounded findings the agent produced (file/lines/severity/category/title). */
  actual_findings: z.array(
    z.object({
      file: z.string(),
      start_line: z.number().int(),
      end_line: z.number().int(),
      severity: z.string().nullish(),
      category: z.string().nullish(),
      title: z.string().nullish(),
    }),
  ),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseRun = z.infer<typeof EvalCaseRun>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
  case_run: EvalCaseRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

export const EvalSuiteStatus = z.enum(['running', 'completed', 'failed']);
export type EvalSuiteStatus = z.infer<typeof EvalSuiteStatus>;

/** One "Run all" of an agent's test set, under a frozen agent config snapshot. */
export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  config_snapshot: AgentVersionConfig,
  status: EvalSuiteStatus,
  /** Machine-readable failure reason, e.g. `llm_unavailable` / `stale`. */
  reason: z.string().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cases_passed: z.number().int(),
  cases_total: z.number().int(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  ran_at: z.string(),
  error: z.string().nullable(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** `GET /eval-suite-runs/:id` — the run plus every case result so far (poll target). */
export const EvalSuiteRunDetail = EvalSuiteRun.extend({
  case_runs: z.array(EvalCaseRun),
});
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

/** `GET /eval-suite-runs/compare?a=&b=` — b minus a. Deltas in percentage points (cost in USD). */
export const EvalCompare = z.object({
  a: EvalSuiteRun,
  b: EvalSuiteRun,
  delta: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    cost_usd: z.number().nullable(),
  }),
  fixed: z.array(z.object({ case_id: z.string(), case_name: z.string() })),
  regressed: z.array(z.object({ case_id: z.string(), case_name: z.string() })),
  only_in_a: z.array(z.object({ case_id: z.string(), case_name: z.string() })),
  only_in_b: z.array(z.object({ case_id: z.string(), case_name: z.string() })),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** One point on the dashboard trend (per completed suite run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  agent_version: z.number().int().nullish(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  pass_rate: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  /** current − previous completed run, percentage points; null when either side is null. */
  delta: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalSuiteRun),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

/** One agent's row on the workspace eval dashboard. */
export const EvalAgentDashboardRow = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  provider: Provider,
  model: z.string(),
  cases_total: z.number().int(),
  latest: EvalSuiteRun.nullable(),
  sparkline: z.array(EvalTrendPoint),
});
export type EvalAgentDashboardRow = z.infer<typeof EvalAgentDashboardRow>;

/** `GET /eval/dashboard` — every agent's latest completed run + recent runs. */
export const EvalWorkspaceDashboard = z.object({
  agents: z.array(EvalAgentDashboardRow),
  recent_runs: z.array(EvalSuiteRun),
});
export type EvalWorkspaceDashboard = z.infer<typeof EvalWorkspaceDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
