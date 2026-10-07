/**
 * Pure helpers for the eval module (SPEC-04) — row ⇄ DTO mapping, diff
 * snippetting, deltas/alerts, compare and stale detection. No DB, no clock
 * (callers inject `now`), no network.
 */
import {
  AgentVersionConfig,
  EvalExpectationList,
  EvalExpectationType,
  refineExpectationList,
  type EvalCase,
  type EvalCaseRun,
  type EvalCaseSummary,
  type EvalCompare,
  type EvalExpectation,
  type EvalSuiteRun,
  type EvalTrendPoint,
} from '@devdigest/shared';
import { z } from 'zod';
import type { ReviewInput } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { EvalCaseRow, EvalRunRow, EvalSuiteRunRow, FindingRow } from '../../db/rows.js';
import { EVAL_ALERT_PTS, EVAL_REASON, EVAL_TASK_INSTRUCTIONS } from './constants.js';
import { normalizePath } from './scoring.js';

// ===========================================================================
// Expectation from a labelled finding (AC-4/5)
// ===========================================================================

/** accepted → must_find, dismissed → must_not_flag, undecided → null. */
export function expectationFromFinding(
  f: Pick<FindingRow, 'acceptedAt' | 'dismissedAt'>,
): z.infer<typeof EvalExpectationType> | null {
  if (f.acceptedAt) return 'must_find';
  if (f.dismissedAt) return 'must_not_flag';
  return null;
}

/** The single expectation item built from a finding (AC-5). */
export function expectationItemFromFinding(
  f: Pick<FindingRow, 'file' | 'startLine' | 'endLine' | 'severity' | 'category' | 'title'>,
): EvalExpectation {
  return {
    file: normalizePath(f.file),
    start_line: f.startLine,
    end_line: f.endLine,
    severity: f.severity,
    category: f.category,
    title: f.title,
  };
}

/** Default case name: a slug of the finding title (editable later). */
export function slugName(title: string, maxLen = 80): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return slug || 'eval-case';
}

// ===========================================================================
// Single-file diff snippet (AC-5, edge case "diff_too_large")
// ===========================================================================

export type SnippetResult =
  | { ok: true; diff: string; files: string[] }
  | { ok: false; reason: typeof EVAL_REASON.diffUnavailable | typeof EVAL_REASON.diffTooLarge };

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Cut `rawDiff` down to ONLY `file`'s section, keeping whole hunks whose
 * new-side range intersects `[startLine, endLine]`. `diff_unavailable` when the
 * file/hunk isn't in the diff; `diff_too_large` when even that exceeds the cap
 * (we refuse rather than store an ungradable, trimmed case).
 */
export function extractFileSnippet(
  rawDiff: string,
  file: string,
  startLine: number,
  endLine: number,
  capBytes: number,
): SnippetResult {
  const want = normalizePath(file);
  const lines = rawDiff.split('\n');

  // Locate this file's section: from its `diff --git` line to the next one.
  let begin = -1;
  let finish = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('diff --git')) continue;
    if (begin !== -1) {
      finish = i;
      break;
    }
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    const path = m ? normalizePath(m[2]!) : '';
    if (path === want) begin = i;
  }
  if (begin === -1) return { ok: false, reason: EVAL_REASON.diffUnavailable };

  const section = lines.slice(begin, finish);
  const firstHunk = section.findIndex((l) => HUNK_HEADER.test(l));
  if (firstHunk === -1) return { ok: false, reason: EVAL_REASON.diffUnavailable };
  const header = section.slice(0, firstHunk);

  const [lo, hi] = startLine <= endLine ? [startLine, endLine] : [endLine, startLine];
  const kept: string[][] = [];
  let cur: string[] | null = null;
  let curIntersects = false;
  const flush = () => {
    if (cur && curIntersects) kept.push(cur);
    cur = null;
    curIntersects = false;
  };
  for (const line of section.slice(firstHunk)) {
    const hh = line.match(HUNK_HEADER);
    if (hh) {
      flush();
      const newStart = Number(hh[3]);
      const newLines = hh[4] !== undefined ? Number(hh[4]) : 1;
      const newEnd = newStart + Math.max(newLines, 1) - 1;
      curIntersects = newStart <= hi && lo <= newEnd;
      cur = [line];
    } else if (cur) {
      cur.push(line);
    }
  }
  flush();
  if (kept.length === 0) return { ok: false, reason: EVAL_REASON.diffUnavailable };

  // Trailing blank (from the split) belongs to the file end, not a hunk body.
  const body = kept.map((h) => {
    const copy = [...h];
    while (copy.length > 1 && copy[copy.length - 1] === '') copy.pop();
    return copy.join('\n');
  });
  const diff = [...header, ...body].join('\n') + '\n';
  if (Buffer.byteLength(diff, 'utf8') > capBytes) {
    return { ok: false, reason: EVAL_REASON.diffTooLarge };
  }
  return { ok: true, diff, files: [want] };
}

// ===========================================================================
// Case input meta (frozen PR title/description + agent reference)
// ===========================================================================

export interface EvalInputMeta {
  pr_title: string | null;
  pr_description: string | null;
  agent_id: string | null;
  agent_version: number | null;
}

export function buildInputMeta(args: {
  prTitle: string;
  prDescription: string | null;
  agentId: string;
  agentVersion: number | null;
}): EvalInputMeta {
  return {
    pr_title: args.prTitle,
    pr_description: args.prDescription,
    agent_id: args.agentId,
    agent_version: args.agentVersion,
  };
}

const InputMetaShape = z
  .object({
    pr_title: z.string().nullish(),
    pr_description: z.string().nullish(),
  })
  .passthrough();

/**
 * Pull the PR text out of a case's `input_meta`. Tolerant: a hand-written case
 * may carry anything (or nothing) — unknown shapes just yield no description.
 */
export function readInputMeta(meta: unknown): { prTitle: string | null; prDescription: string | null } {
  const parsed = InputMetaShape.safeParse(meta);
  if (!parsed.success) return { prTitle: null, prDescription: null };
  return { prTitle: parsed.data.pr_title ?? null, prDescription: parsed.data.pr_description ?? null };
}

// ===========================================================================
// Row → DTO
// ===========================================================================

/** `{ findings, pre_grounding_count, expected_count, expectation }` stored in eval_runs.actual_output. */
const StoredOutput = z.object({
  findings: z
    .array(
      z.object({
        file: z.string(),
        start_line: z.number().int(),
        end_line: z.number().int(),
        severity: z.string().nullish(),
        category: z.string().nullish(),
        title: z.string().nullish(),
      }),
    )
    .default([]),
  pre_grounding_count: z.number().int().default(0),
  expected_count: z.number().int().default(0),
  expectation: EvalExpectationType.nullish(),
});
export type StoredEvalOutput = z.infer<typeof StoredOutput>;

export function readStoredOutput(v: unknown): StoredEvalOutput {
  const parsed = StoredOutput.safeParse(v);
  return parsed.success ? parsed.data : StoredOutput.parse({});
}

type ValidatedExpectation = { ok: true; items: EvalExpectation[] } | { ok: false; reason: string };

/** Zod-validate a stored case's expectation list (read-side of AC-1). */
export function validateCaseExpectation(
  expectation: string,
  expected: unknown,
): ValidatedExpectation {
  const type = EvalExpectationType.safeParse(expectation);
  if (!type.success) return { ok: false, reason: `unknown expectation "${expectation}"` };
  const list = EvalExpectationList.safeParse(expected);
  if (!list.success) {
    return { ok: false, reason: list.error.issues[0]?.message ?? 'invalid expected_output' };
  }
  let reason: string | null = null;
  refineExpectationList(
    { expectation: type.data, expected_output: list.data },
    { addIssue: (i) => (reason = i.message ?? 'invalid expected_output'), path: [] },
  );
  return reason ? { ok: false, reason } : { ok: true, items: list.data };
}

export function caseRowToDto(row: EvalCaseRow): EvalCase | null {
  const v = validateCaseExpectation(row.expectation, row.expectedOutput);
  if (!v.ok) return null;
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expectation: row.expectation,
    expected_output: v.items,
    source_finding_id: row.sourceFindingId ?? null,
    notes: row.notes ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function caseRunRowToDto(
  row: EvalRunRow,
  caseName: string | null,
  expectation: string | null,
): EvalCaseRun {
  const out = readStoredOutput(row.actualOutput);
  const status = row.status ?? (row.pass ? 'passed' : row.pass === false ? 'failed' : 'error');
  const parsedExpectation = EvalExpectationType.safeParse(out.expectation ?? expectation);
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName,
    suite_run_id: row.suiteRunId ?? null,
    ran_at: row.ranAt.toISOString(),
    status,
    pass: row.pass ?? null,
    error: row.error ?? null,
    expectation: parsedExpectation.success ? parsedExpectation.data : null,
    expected_count: out.expected_count,
    actual_count: out.findings.length,
    pre_grounding_count: out.pre_grounding_count,
    actual_findings: out.findings,
    recall: row.recall ?? null,
    precision: row.precision ?? null,
    citation_accuracy: row.citationAccuracy ?? null,
    duration_ms: row.durationMs ?? null,
    cost_usd: row.costUsd ?? null,
  };
}

export function suiteRunRowToDto(row: EvalSuiteRunRow, agentName: string): EvalSuiteRun {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: agentName,
    agent_version: row.agentVersion,
    // A snapshot is written by us; a malformed one is a bug, not user input.
    config_snapshot: AgentVersionConfig.parse(row.configSnapshot),
    status: row.status,
    reason: row.reason ?? null,
    recall: row.recall ?? null,
    precision: row.precision ?? null,
    citation_accuracy: row.citationAccuracy ?? null,
    cases_passed: row.casesPassed,
    cases_total: row.casesTotal,
    cost_usd: row.costUsd ?? null,
    duration_ms: row.durationMs ?? null,
    ran_at: row.ranAt.toISOString(),
    error: row.error ?? null,
  };
}

/** Build the case-list DTO for one row, including the last-run summary. */
export function caseRowToSummary(
  row: EvalCaseRow,
  lastRun: EvalRunRow | undefined,
): EvalCaseSummary {
  const v = validateCaseExpectation(row.expectation, row.expectedOutput);
  const base = {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expectation: row.expectation,
    expected_output: row.expectedOutput ?? null,
    source_finding_id: row.sourceFindingId ?? null,
    notes: row.notes ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    invalid: !v.ok,
    invalid_reason: v.ok ? null : v.reason,
  };
  if (!lastRun) {
    return {
      ...base,
      edited_since_last_run: false,
      last_run: {
        status: 'never_run',
        run_id: null,
        ran_at: null,
        expected_count: null,
        actual_count: null,
        error: null,
      },
    };
  }
  const out = readStoredOutput(lastRun.actualOutput);
  const status = lastRun.status ?? (lastRun.pass ? 'passed' : lastRun.pass === false ? 'failed' : 'error');
  return {
    ...base,
    edited_since_last_run: row.updatedAt.getTime() > lastRun.ranAt.getTime(),
    last_run: {
      status,
      run_id: lastRun.id,
      ran_at: lastRun.ranAt.toISOString(),
      expected_count: out.expected_count,
      actual_count: out.findings.length,
      error: lastRun.error ?? null,
    },
  };
}

// ===========================================================================
// Deltas, alert, trend
// ===========================================================================

export type MetricName = 'recall' | 'precision' | 'citation_accuracy';
export const METRIC_NAMES: readonly MetricName[] = ['recall', 'precision', 'citation_accuracy'];
const METRIC_LABEL: Record<MetricName, string> = {
  recall: 'Recall',
  precision: 'Precision',
  citation_accuracy: 'Citation accuracy',
};

export type Metrics = Record<MetricName, number | null>;

/** Percentage points, rounded to 0.01pt so float noise can't straddle a threshold. */
export function deltaPts(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10000) / 100;
}

export function metricDeltas(current: Metrics, previous: Metrics | null): Metrics {
  return {
    recall: previous ? deltaPts(current.recall, previous.recall) : null,
    precision: previous ? deltaPts(current.precision, previous.precision) : null,
    citation_accuracy: previous ? deltaPts(current.citation_accuracy, previous.citation_accuracy) : null,
  };
}

/**
 * Regression alert (AC-24): when any metric drops by ≥ `thresholdPts`, name the
 * worst one ("Precision dipped 2pts on v7 — …"); otherwise null.
 */
export function buildAlert(
  deltas: Metrics,
  version: number,
  thresholdPts: number = EVAL_ALERT_PTS,
): string | null {
  let worst: { metric: MetricName; drop: number } | null = null;
  for (const metric of METRIC_NAMES) {
    const d = deltas[metric];
    if (d === null || d > -thresholdPts) continue;
    const drop = -d;
    if (!worst || drop > worst.drop) worst = { metric, drop };
  }
  if (!worst) return null;
  const pts = Number.isInteger(worst.drop) ? String(worst.drop) : worst.drop.toFixed(1);
  return `${METRIC_LABEL[worst.metric]} dipped ${pts}pts on v${version} — compare with the previous run to see what changed.`;
}

export function trendPoint(run: EvalSuiteRun): EvalTrendPoint {
  return {
    ran_at: run.ran_at,
    agent_version: run.agent_version,
    recall: run.recall,
    precision: run.precision,
    citation_accuracy: run.citation_accuracy,
    pass_rate: run.cases_total > 0 ? run.cases_passed / run.cases_total : null,
    cost_usd: run.cost_usd,
  };
}

// ===========================================================================
// Compare (AC-25)
// ===========================================================================

export interface CompareCaseRun {
  case_id: string;
  case_name: string;
  passed: boolean;
}

/** Cases present in both runs are diffed by pass/fail; the rest are listed per side. */
export function compareCaseRuns(
  a: readonly CompareCaseRun[],
  b: readonly CompareCaseRun[],
): Pick<EvalCompare, 'fixed' | 'regressed' | 'only_in_a' | 'only_in_b'> {
  const mapA = new Map(a.map((c) => [c.case_id, c]));
  const mapB = new Map(b.map((c) => [c.case_id, c]));
  const fixed: EvalCompare['fixed'] = [];
  const regressed: EvalCompare['regressed'] = [];
  const onlyA: EvalCompare['only_in_a'] = [];
  const onlyB: EvalCompare['only_in_b'] = [];
  for (const [id, ca] of mapA) {
    const cb = mapB.get(id);
    if (!cb) onlyA.push({ case_id: id, case_name: ca.case_name });
    else if (!ca.passed && cb.passed) fixed.push({ case_id: id, case_name: cb.case_name });
    else if (ca.passed && !cb.passed) regressed.push({ case_id: id, case_name: cb.case_name });
  }
  for (const [id, cb] of mapB) {
    if (!mapA.has(id)) onlyB.push({ case_id: id, case_name: cb.case_name });
  }
  return { fixed, regressed, only_in_a: onlyA, only_in_b: onlyB };
}

export function compareDeltas(a: EvalSuiteRun, b: EvalSuiteRun): EvalCompare['delta'] {
  return {
    recall: deltaPts(b.recall, a.recall),
    precision: deltaPts(b.precision, a.precision),
    citation_accuracy: deltaPts(b.citation_accuracy, a.citation_accuracy),
    cost_usd:
      a.cost_usd === null || b.cost_usd === null
        ? null
        : Math.round((b.cost_usd - a.cost_usd) * 1e6) / 1e6,
  };
}

// ===========================================================================
// Stale suite detection (reliability: restart mid-run)
// ===========================================================================

export function isStaleRunning(
  run: Pick<EvalSuiteRunRow, 'status' | 'ranAt'>,
  now: Date,
  staleMs: number,
): boolean {
  return run.status === 'running' && now.getTime() - run.ranAt.getTime() > staleMs;
}

// ===========================================================================
// Frozen review input (AC-12 / AC-14)
// ===========================================================================

/** Task framing from the FROZEN PR title only — never live PR state. */
export function evalTaskLine(prTitle: string | null): string {
  const subject = prTitle ? `pull request "${prTitle}"` : 'the following pull request';
  return `Review ${subject}. ${EVAL_TASK_INSTRUCTIONS}`;
}

/**
 * The ONLY inputs an eval run hands to the review engine: the case's frozen
 * diff + PR description, the suite's snapshotted prompt/model/strategy and its
 * pre-resolved skill bodies. Deliberately NOT built from the production run
 * executor: no repo-intel (callers / repo map / rank note), no Project Context
 * specs, no memory, no Intent. Runs of different agent versions must differ
 * only by agent config (AC-14).
 */
export function buildFrozenReviewInput(args: {
  config: Pick<AgentVersionConfig, 'system_prompt' | 'model' | 'strategy'>;
  skillBodies: readonly string[];
  caseInput: { inputDiff: string | null; inputMeta: unknown };
}): Omit<ReviewInput, 'llm'> {
  const { prTitle, prDescription } = readInputMeta(args.caseInput.inputMeta);
  return {
    systemPrompt: args.config.system_prompt,
    model: args.config.model,
    diff: parseUnifiedDiff(args.caseInput.inputDiff ?? ''),
    strategy: args.config.strategy,
    ...(args.skillBodies.length > 0 ? { skills: [...args.skillBodies] } : {}),
    ...(prDescription ? { prDescription } : {}),
    task: evalTaskLine(prTitle),
  };
}
