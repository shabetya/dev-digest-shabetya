import { describe, it, expect } from 'vitest';
import {
  buildAlert,
  caseRowToDto,
  caseRowToSummary,
  compareCaseRuns,
  deltaPts,
  expectationFromFinding,
  expectationItemFromFinding,
  extractFileSnippet,
  isStaleRunning,
  metricDeltas,
  readInputMeta,
  slugName,
  validateCaseExpectation,
} from '../src/modules/eval/helpers.js';
import type { EvalCaseRow, EvalRunRow } from '../src/db/rows.js';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' one',
  '+two',
  ' three',
  ' four',
  '@@ -50,2 +51,3 @@',
  ' fifty',
  '+fiftyone',
  ' fiftytwo',
  'diff --git a/src/b.ts b/src/b.ts',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1,1 +1,2 @@',
  ' x',
  '+y',
  '',
].join('\n');

describe('eval helpers: extractFileSnippet', () => {
  it('keeps only the requested file and only intersecting whole hunks', () => {
    const r = extractFileSnippet(DIFF, 'src/a.ts', 2, 2, 10_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files).toEqual(['src/a.ts']);
    expect(r.diff).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(r.diff).toContain('+two');
    expect(r.diff).not.toContain('fiftyone');
    expect(r.diff).not.toContain('src/b.ts');
    expect(r.diff.endsWith('\n')).toBe(true);
  });

  it('accepts a ./-prefixed path and a range spanning two hunks', () => {
    const r = extractFileSnippet(DIFF, './src/a.ts', 2, 52, 10_000);
    expect(r.ok && r.diff.includes('+two') && r.diff.includes('+fiftyone')).toBe(true);
  });

  it('reports diff_unavailable for a missing file or a line outside every hunk', () => {
    expect(extractFileSnippet(DIFF, 'src/missing.ts', 1, 1, 10_000)).toEqual({ ok: false, reason: 'diff_unavailable' });
    expect(extractFileSnippet(DIFF, 'src/a.ts', 200, 201, 10_000)).toEqual({ ok: false, reason: 'diff_unavailable' });
  });

  it('reports diff_too_large instead of trimming a hunk', () => {
    expect(extractFileSnippet(DIFF, 'src/a.ts', 2, 2, 20)).toEqual({ ok: false, reason: 'diff_too_large' });
  });
});

describe('eval helpers: finding → case', () => {
  const base = { file: './src/a.ts', startLine: 3, endLine: 4, severity: 'WARNING' as const, category: 'bug' as const, title: 'Null deref!' };
  it('derives expectation from the decision', () => {
    expect(expectationFromFinding({ acceptedAt: new Date(), dismissedAt: null })).toBe('must_find');
    expect(expectationFromFinding({ acceptedAt: null, dismissedAt: new Date() })).toBe('must_not_flag');
    expect(expectationFromFinding({ acceptedAt: null, dismissedAt: null })).toBeNull();
  });
  it('builds the expectation item and slug name', () => {
    expect(expectationItemFromFinding(base)).toEqual({
      file: 'src/a.ts',
      start_line: 3,
      end_line: 4,
      severity: 'WARNING',
      category: 'bug',
      title: 'Null deref!',
    });
    expect(slugName('Null deref!  in `foo()`')).toBe('null-deref-in-foo');
    expect(slugName('!!!')).toBe('eval-case');
    expect(slugName('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it('reads PR text from tolerant input_meta', () => {
    expect(readInputMeta({ pr_title: 't', pr_description: 'd', other: 1 })).toEqual({ prTitle: 't', prDescription: 'd' });
    expect(readInputMeta('garbage')).toEqual({ prTitle: null, prDescription: null });
    expect(readInputMeta(null)).toEqual({ prTitle: null, prDescription: null });
  });
});

describe('eval helpers: row mapping', () => {
  const at = new Date('2026-01-01T00:00:00Z');
  const caseRow = (over: Partial<EvalCaseRow> = {}): EvalCaseRow => ({
    id: 'c1',
    workspaceId: 'w',
    ownerKind: 'agent',
    ownerId: 'a',
    name: 'n',
    inputDiff: 'd',
    inputFiles: null,
    inputMeta: null,
    expectedOutput: [{ file: 'a.ts', start_line: 1 }],
    notes: null,
    expectation: 'must_find',
    sourceFindingId: null,
    createdAt: at,
    updatedAt: at,
    ...over,
  });

  it('flags an invalid stored case instead of throwing', () => {
    expect(validateCaseExpectation('must_find', [])).toMatchObject({ ok: false });
    expect(validateCaseExpectation('must_not_flag', [])).toEqual({ ok: true, items: [] });
    expect(validateCaseExpectation('must_find', 'oops')).toMatchObject({ ok: false });
    expect(caseRowToDto(caseRow({ expectedOutput: 'oops' }))).toBeNull();
    const s = caseRowToSummary(caseRow({ expectedOutput: 'oops' }), undefined);
    expect(s.invalid).toBe(true);
    expect(s.last_run.status).toBe('never_run');
  });

  it('summarises the last run and "edited since last run"', () => {
    const run = {
      id: 'r1',
      caseId: 'c1',
      suiteRunId: null,
      ranAt: at,
      actualOutput: { findings: [{ file: 'a.ts', start_line: 1, end_line: 1 }], pre_grounding_count: 2, expected_count: 1 },
      pass: true,
      status: 'passed',
      error: null,
      recall: 1,
      precision: 1,
      citationAccuracy: 0.5,
      durationMs: 5,
      costUsd: null,
    } as EvalRunRow;
    const fresh = caseRowToSummary(caseRow(), run);
    expect(fresh.last_run).toMatchObject({ status: 'passed', expected_count: 1, actual_count: 1 });
    expect(fresh.edited_since_last_run).toBe(false);
    const edited = caseRowToSummary(caseRow({ updatedAt: new Date('2026-02-01T00:00:00Z') }), run);
    expect(edited.edited_since_last_run).toBe(true);
  });
});

describe('eval helpers: deltas and alert (AC-24)', () => {
  it('computes percentage-point deltas with float-noise rounding, null-safe', () => {
    expect(deltaPts(0.91, 0.89)).toBe(2);
    expect(deltaPts(0.89, 0.91)).toBe(-2);
    expect(deltaPts(null, 0.5)).toBeNull();
    expect(metricDeltas({ recall: 0.5, precision: null, citation_accuracy: 1 }, null)).toEqual({
      recall: null,
      precision: null,
      citation_accuracy: null,
    });
  });

  it('alerts at exactly the threshold, naming the worst metric and version', () => {
    const prev = { recall: 0.9, precision: 0.91, citation_accuracy: 0.95 };
    const cur = { recall: 0.9, precision: 0.89, citation_accuracy: 0.95 };
    expect(buildAlert(metricDeltas(cur, prev), 7)).toMatch(/^Precision dipped 2pts on v7/);
    const worse = { recall: 0.8, precision: 0.89, citation_accuracy: 0.95 };
    expect(buildAlert(metricDeltas(worse, prev), 8)).toMatch(/^Recall dipped 10pts on v8/);
  });

  it('does not alert on a small drop, an improvement or null deltas', () => {
    const prev = { recall: 0.9, precision: 0.9, citation_accuracy: 0.9 };
    expect(buildAlert(metricDeltas({ recall: 0.89, precision: 0.95, citation_accuracy: 0.9 }, prev), 2)).toBeNull();
    expect(buildAlert({ recall: null, precision: null, citation_accuracy: null }, 2)).toBeNull();
  });
});

describe('eval helpers: compare and stale detection', () => {
  it('reports fixed / regressed on shared cases and only-in lists for the rest', () => {
    const a = [
      { case_id: '1', case_name: 'one', passed: false },
      { case_id: '2', case_name: 'two', passed: true },
      { case_id: '3', case_name: 'three', passed: true },
      { case_id: '4', case_name: 'four', passed: true },
    ];
    const b = [
      { case_id: '1', case_name: 'one', passed: true },
      { case_id: '2', case_name: 'two', passed: false },
      { case_id: '3', case_name: 'three', passed: true },
      { case_id: '5', case_name: 'five', passed: true },
    ];
    const r = compareCaseRuns(a, b);
    expect(r.fixed.map((c) => c.case_id)).toEqual(['1']);
    expect(r.regressed.map((c) => c.case_id)).toEqual(['2']);
    expect(r.only_in_a.map((c) => c.case_id)).toEqual(['4']);
    expect(r.only_in_b.map((c) => c.case_id)).toEqual(['5']);
  });

  it('marks only old running suites stale, with an injected now', () => {
    const ranAt = new Date('2026-01-01T00:00:00Z');
    const later = new Date(ranAt.getTime() + 31 * 60_000);
    expect(isStaleRunning({ status: 'running', ranAt }, later, 30 * 60_000)).toBe(true);
    expect(isStaleRunning({ status: 'running', ranAt }, new Date(ranAt.getTime() + 60_000), 30 * 60_000)).toBe(false);
    expect(isStaleRunning({ status: 'completed', ranAt }, later, 30 * 60_000)).toBe(false);
  });
});
